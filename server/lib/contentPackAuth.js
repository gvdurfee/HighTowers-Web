import crypto from 'crypto'

/**
 * Optional API key for Content Pack routes.
 *
 * - When CONTENT_PACK_API_KEY is set: require Bearer / X-API-Key.
 * - When unset in non-production: routes stay open (local training / npm run dev:all).
 * - When unset in production: fail closed (503) unless CONTENT_PACK_ALLOW_OPEN=1.
 */
function timingSafeEqualStrings(a, b) {
  const aa = Buffer.from(String(a ?? ''), 'utf8')
  const bb = Buffer.from(String(b ?? ''), 'utf8')
  if (aa.length !== bb.length) return false
  return crypto.timingSafeEqual(aa, bb)
}

export function isContentPackApiKeyConfigured() {
  return Boolean(process.env.CONTENT_PACK_API_KEY?.trim())
}

/** True when unauthenticated content-pack access is intentionally allowed. */
export function isContentPackAuthOpen() {
  if (isContentPackApiKeyConfigured()) return false
  if (process.env.CONTENT_PACK_ALLOW_OPEN === '1') return true
  return process.env.NODE_ENV !== 'production'
}

export function logContentPackAuthStatus() {
  if (isContentPackApiKeyConfigured()) {
    console.log('[content-packs] CONTENT_PACK_API_KEY is set; apply/export require the key.')
    return
  }
  if (isContentPackAuthOpen()) {
    console.warn(
      '[content-packs] CONTENT_PACK_API_KEY unset; routes are open (dev). Set the key (or CONTENT_PACK_ALLOW_OPEN=1) for hosted APIs.'
    )
    return
  }
  console.warn(
    '[content-packs] CONTENT_PACK_API_KEY unset in production; mutating/list routes return 503 until configured.'
  )
}

export function contentPackAuth(req, res, next) {
  const key = process.env.CONTENT_PACK_API_KEY?.trim()
  if (!key) {
    if (isContentPackAuthOpen()) return next()
    res.status(503).json({
      error: 'content_pack_api_key_required',
      message:
        'CONTENT_PACK_API_KEY is not configured on this server. Set it in .env (or CONTENT_PACK_ALLOW_OPEN=1 for an intentional open deploy).',
    })
    return
  }
  const auth = req.headers.authorization
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const xk = req.headers['x-api-key']
  const headerKey = typeof xk === 'string' ? xk.trim() : Array.isArray(xk) ? xk[0]?.trim() ?? '' : ''
  if (timingSafeEqualStrings(bearer, key) || timingSafeEqualStrings(headerKey, key)) {
    return next()
  }
  res.status(401).json({ error: 'Unauthorized (Content Pack API key required)' })
}
