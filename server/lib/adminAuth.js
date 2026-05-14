/**
 * Wing Administrator PIN authentication.
 *
 * Provides a second auth layer on top of the Content Pack API key, gating
 * elevated lifecycle operations (publishing packs, creating empty packs for new
 * routes, future rename/delete). Crew-facing reads + per-mission apply remain
 * on the API-key-only path.
 *
 * Model:
 *   1. PIN(s) are configured server-side via env vars.
 *   2. The admin POSTs their PIN to /api/admin/login and receives an
 *      HMAC-signed bearer token with a short TTL.
 *   3. Admin-only routes call `requireAdminToken` middleware, which validates
 *      the token from `Authorization: Bearer <token>` or `X-Admin-Token`.
 *   4. Repeated bad PINs from the same IP trigger a backoff.
 *
 * Tokens are sealed by an HMAC secret. The secret comes from
 * `CONTENT_PACK_ADMIN_SECRET` if set; otherwise we generate an ephemeral secret
 * at server start (acceptable property: server restart invalidates outstanding
 * admin sessions — fine for a low-traffic internal admin console).
 */
import crypto from 'crypto'

const TOKEN_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours
const RATE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const RATE_MAX_FAILURES = 3
const RATE_LOCKOUT_MS = 60 * 1000 // 1 minute lockout after threshold

let _secret = null
let _admins = null
/** Map<ip, { failures: number[], lockoutUntil: number }> */
const rateState = new Map()

function getSecret() {
  if (_secret) return _secret
  const env = process.env.CONTENT_PACK_ADMIN_SECRET?.trim()
  if (env && env.length >= 16) {
    _secret = env
    return _secret
  }
  _secret = crypto.randomBytes(32).toString('hex')
  console.warn(
    '[admin] CONTENT_PACK_ADMIN_SECRET not set (or too short); using ephemeral signing key. Admin tokens will invalidate on restart.'
  )
  return _secret
}

/**
 * Parse configured admin PINs.
 *
 * Supports two env shapes:
 *   - `CONTENT_PACK_ADMIN_PIN=4815` (single admin, no metadata)
 *   - `CONTENT_PACK_ADMIN_PINS=[{"pin":"4815","name":"Greg D.","wing":"NM"},...]`
 *     (multi-admin, JSON array; future-proofs the multi-wing case)
 *
 * Returns an array of `{ pin, name, wing }` rows.
 */
function loadAdmins() {
  if (_admins) return _admins
  const json = process.env.CONTENT_PACK_ADMIN_PINS?.trim()
  if (json) {
    try {
      const parsed = JSON.parse(json)
      if (Array.isArray(parsed)) {
        const rows = []
        for (const r of parsed) {
          if (!r || typeof r !== 'object') continue
          const pin = String(r.pin ?? '').trim()
          if (!pin) continue
          rows.push({
            pin,
            name: typeof r.name === 'string' ? r.name : null,
            wing: typeof r.wing === 'string' ? r.wing : null,
          })
        }
        _admins = rows
        return _admins
      }
    } catch (e) {
      console.error('[admin] CONTENT_PACK_ADMIN_PINS is not valid JSON; ignoring.', e?.message)
    }
  }
  const single = process.env.CONTENT_PACK_ADMIN_PIN?.trim()
  _admins = single ? [{ pin: single, name: null, wing: null }] : []
  return _admins
}

export function isAdminConfigured() {
  return loadAdmins().length > 0
}

function nowMs() {
  return Date.now()
}

/** Trim stale failure timestamps outside the rate window. */
function pruneFailures(state) {
  const cutoff = nowMs() - RATE_WINDOW_MS
  state.failures = state.failures.filter((t) => t >= cutoff)
}

function getRateRecord(ip) {
  let state = rateState.get(ip)
  if (!state) {
    state = { failures: [], lockoutUntil: 0 }
    rateState.set(ip, state)
  }
  pruneFailures(state)
  return state
}

function recordFailure(ip) {
  const state = getRateRecord(ip)
  state.failures.push(nowMs())
  if (state.failures.length >= RATE_MAX_FAILURES) {
    state.lockoutUntil = nowMs() + RATE_LOCKOUT_MS
  }
}

function clearRate(ip) {
  rateState.delete(ip)
}

function isLockedOut(ip) {
  const state = getRateRecord(ip)
  if (state.lockoutUntil > nowMs()) {
    return { locked: true, retryAfterMs: state.lockoutUntil - nowMs() }
  }
  if (state.lockoutUntil && state.lockoutUntil <= nowMs()) {
    state.lockoutUntil = 0
    state.failures = []
  }
  return { locked: false, retryAfterMs: 0 }
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function fromBase64url(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Buffer.from(padded, 'base64')
}

function signPayload(payloadBase64) {
  return base64url(crypto.createHmac('sha256', getSecret()).update(payloadBase64).digest())
}

function timingSafeEqualStrings(a, b) {
  const A = Buffer.from(a)
  const B = Buffer.from(b)
  if (A.length !== B.length) return false
  return crypto.timingSafeEqual(A, B)
}

/**
 * Issue a signed admin session token.
 *
 * @param {{ name?: string|null, wing?: string|null }} admin
 * @returns {{ token: string, expiresAt: string, name: string|null, wing: string|null }}
 */
export function issueAdminToken(admin) {
  const exp = nowMs() + TOKEN_TTL_MS
  const payload = {
    sub: 'wing-admin',
    name: admin?.name ?? null,
    wing: admin?.wing ?? null,
    iat: nowMs(),
    exp,
    nonce: crypto.randomBytes(8).toString('hex'),
  }
  const payloadBase64 = base64url(JSON.stringify(payload))
  const sig = signPayload(payloadBase64)
  return {
    token: `${payloadBase64}.${sig}`,
    expiresAt: new Date(exp).toISOString(),
    name: payload.name,
    wing: payload.wing,
  }
}

/**
 * Verify a token. Returns the decoded payload or `null` if invalid/expired.
 *
 * @param {string|undefined} token
 * @returns {null | { sub: string, name: string|null, wing: string|null, iat: number, exp: number }}
 */
export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return null
  const idx = token.indexOf('.')
  if (idx < 1 || idx === token.length - 1) return null
  const payloadBase64 = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  const expected = signPayload(payloadBase64)
  if (!timingSafeEqualStrings(sig, expected)) return null
  let payload
  try {
    payload = JSON.parse(fromBase64url(payloadBase64).toString('utf8'))
  } catch {
    return null
  }
  if (!payload || payload.sub !== 'wing-admin') return null
  if (typeof payload.exp !== 'number' || payload.exp < nowMs()) return null
  return payload
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  const firstFwd = typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : null
  return firstFwd || req.socket?.remoteAddress || req.ip || 'unknown'
}

function extractToken(req) {
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  const xt = req.headers['x-admin-token']
  if (typeof xt === 'string') return xt.trim()
  if (Array.isArray(xt) && typeof xt[0] === 'string') return xt[0].trim()
  return ''
}

/**
 * Express middleware: rejects unless the request carries a valid admin token.
 *
 * Returns 503 when no PIN is configured, so deployments can't accidentally
 * leave admin routes wide open with a single missing env var.
 */
export function requireAdminToken(req, res, next) {
  if (!isAdminConfigured()) {
    res.status(503).json({
      error: 'admin_not_configured',
      message:
        'Wing administrator is not configured on this server. Set CONTENT_PACK_ADMIN_PIN in the server .env and restart.',
    })
    return
  }
  const token = extractToken(req)
  const payload = verifyAdminToken(token)
  if (!payload) {
    res.status(401).json({
      error: 'admin_token_required',
      message: 'Wing administrator session required. Sign in at /admin/content-packs.',
    })
    return
  }
  req.admin = { name: payload.name, wing: payload.wing }
  next()
}

/**
 * Express handler for POST /api/admin/login.
 *
 * Body: `{ pin: string }`
 * Returns: `{ token, expiresAt, name?, wing? }`
 * Errors: 503 (not configured), 429 (locked out), 401 (bad PIN)
 */
export function adminLoginHandler(req, res) {
  if (!isAdminConfigured()) {
    res.status(503).json({
      error: 'admin_not_configured',
      message: 'Wing administrator is not configured on this server.',
    })
    return
  }
  const ip = clientIp(req)
  const lock = isLockedOut(ip)
  if (lock.locked) {
    res.setHeader('Retry-After', Math.ceil(lock.retryAfterMs / 1000))
    res.status(429).json({
      error: 'too_many_attempts',
      message: `Too many failed sign-in attempts. Try again in ${Math.ceil(
        lock.retryAfterMs / 1000
      )} second(s).`,
    })
    return
  }
  const pin = String(req.body?.pin ?? '').trim()
  if (!pin) {
    res.status(400).json({ error: 'pin_required', message: 'PIN is required.' })
    return
  }
  const admins = loadAdmins()
  const match = admins.find((a) => timingSafeEqualStrings(a.pin, pin))
  if (!match) {
    recordFailure(ip)
    const state = getRateRecord(ip)
    const remaining = Math.max(0, RATE_MAX_FAILURES - state.failures.length)
    res.status(401).json({
      error: 'bad_pin',
      message:
        remaining > 0
          ? `Incorrect PIN. ${remaining} attempt(s) remaining before backoff.`
          : 'Incorrect PIN. Further attempts are temporarily blocked.',
    })
    return
  }
  clearRate(ip)
  const issued = issueAdminToken(match)
  res.json(issued)
}

/** Express handler for GET /api/admin/session — confirms a token is still valid. */
export function adminSessionHandler(req, res) {
  if (!isAdminConfigured()) {
    res.status(503).json({ error: 'admin_not_configured' })
    return
  }
  const token = extractToken(req)
  const payload = verifyAdminToken(token)
  if (!payload) {
    res.status(401).json({ error: 'admin_token_required' })
    return
  }
  res.json({
    ok: true,
    name: payload.name,
    wing: payload.wing,
    expiresAt: new Date(payload.exp).toISOString(),
  })
}
