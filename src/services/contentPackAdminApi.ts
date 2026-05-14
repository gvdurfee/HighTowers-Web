/**
 * Wing administrator auth + elevated content-pack operations (PIN + API key).
 */
import { apiUrl } from '@/config/apiConfig'
import { getContentPackApiKey, type ServerContentPackSummary } from '@/services/contentPackApi'

const STORAGE_KEY = 'HighTowers.adminToken.v1'

export type AdminSession = {
  token: string
  expiresAt: string
  name: string | null
  wing: string | null
}

export type NonEssentialZipReport = {
  count: number
  totalBytes: number
  samplePaths: string[]
}

export type UploadPackAdminResult = {
  pack: ServerContentPackSummary
  nonEssential: NonEssentialZipReport
}

export class AdminAuthHttpError extends Error {
  readonly status: number
  readonly retryAfterSec?: number

  constructor(message: string, status: number, retryAfterSec?: number) {
    super(message)
    this.name = 'AdminAuthHttpError'
    this.status = status
    this.retryAfterSec = retryAfterSec
  }
}

function asStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  return null
}

async function readError(res: Response): Promise<string> {
  try {
    const t = await res.text()
    try {
      const j = JSON.parse(t) as { message?: string; error?: string }
      if (j.message) return j.message
      if (j.error) return j.error
    } catch {
      /* not JSON */
    }
    return t.slice(0, 500)
  } catch {
    return res.statusText
  }
}

function resStatusFallback(status: number): string {
  return `HTTP ${status}`
}

/** Proxy/backend down in local dev often surfaces as 5xx with an empty or generic body. */
function failMessage(status: number, body: string): string {
  const m = body.trim() || resStatusFallback(status)
  if (status >= 500 && status <= 504) {
    const generic =
      m === 'Internal Server Error' || /^HTTP \d{3}$/.test(m) || m === resStatusFallback(status)
    if (generic) {
      return `${m} — Is the API running on port 3001? Use npm run dev:all or npm run server in another terminal.`
    }
  }
  return m
}

async function throwUnlessOk(res: Response): Promise<void> {
  if (res.ok) return
  const raw = await readError(res)
  throw new Error(failMessage(res.status, raw || resStatusFallback(res.status)))
}

function contentPackKeyHeaders(): HeadersInit {
  const key = getContentPackApiKey()
  const h: Record<string, string> = {}
  if (key) h['X-API-Key'] = key
  return h
}

export function adminAuthHeaders(): Record<string, string> {
  const s = getAdminSession()
  if (!s?.token) return {}
  return { 'X-Admin-Token': s.token }
}

function packAdminHeaders(json = false): HeadersInit {
  const h: Record<string, string> = {
    ...(contentPackKeyHeaders() as Record<string, string>),
    ...adminAuthHeaders(),
  }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

function persistAdminSession(s: AdminSession): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function getAdminSession(): AdminSession | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const o = parsed as Record<string, unknown>
    const token = typeof o.token === 'string' ? o.token : ''
    const expiresAt = typeof o.expiresAt === 'string' ? o.expiresAt : ''
    if (!token || !expiresAt) return null
    const expMs = Date.parse(expiresAt)
    if (!Number.isFinite(expMs) || expMs <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return {
      token,
      expiresAt,
      name: asStringOrNull(o.name),
      wing: asStringOrNull(o.wing),
    }
  } catch {
    return null
  }
}

export function clearAdminSession(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}

export async function loginWithPin(pin: string): Promise<AdminSession> {
  const res = await fetch(apiUrl('/api/admin/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
  if (!res.ok) {
    const raw = await readError(res)
    const msg = failMessage(res.status, raw || resStatusFallback(res.status))
    let retryAfterSec: number | undefined
    if (res.status === 429) {
      const ra = res.headers.get('Retry-After')
      if (ra) {
        const n = parseInt(ra, 10)
        if (Number.isFinite(n)) retryAfterSec = n
      }
    }
    throw new AdminAuthHttpError(msg, res.status, retryAfterSec)
  }
  const j = (await res.json()) as {
    token?: string
    expiresAt?: string
    name?: unknown
    wing?: unknown
  }
  const token = typeof j.token === 'string' ? j.token : ''
  const expiresAt = typeof j.expiresAt === 'string' ? j.expiresAt : ''
  if (!token || !expiresAt) {
    throw new Error('Invalid login response from server.')
  }
  const session: AdminSession = {
    token,
    expiresAt,
    name: asStringOrNull(j.name),
    wing: asStringOrNull(j.wing),
  }
  persistAdminSession(session)
  return session
}

/**
 * Confirms the stored token with the server. On 401 (or missing token), clears session storage.
 * @returns true if the session is valid after the call
 */
export async function verifyAdminSession(): Promise<boolean> {
  const s = getAdminSession()
  if (!s?.token) {
    clearAdminSession()
    return false
  }
  const res = await fetch(apiUrl('/api/admin/session'), {
    headers: { ...adminAuthHeaders() },
  })
  if (res.status === 503) {
    clearAdminSession()
    return false
  }
  if (!res.ok) {
    clearAdminSession()
    return false
  }
  try {
    const j = (await res.json()) as {
      ok?: boolean
      name?: unknown
      wing?: unknown
      expiresAt?: string
    }
    if (j.expiresAt && typeof j.expiresAt === 'string') {
      persistAdminSession({
        token: s.token,
        expiresAt: j.expiresAt,
        name: asStringOrNull(j.name),
        wing: asStringOrNull(j.wing),
      })
    }
  } catch {
    /* keep existing stored session fields */
  }
  return true
}

export async function uploadPack(file: File, displayName?: string): Promise<UploadPackAdminResult> {
  const fd = new FormData()
  fd.append('file', file)
  if (displayName?.trim()) fd.append('name', displayName.trim())
  const res = await fetch(apiUrl('/api/content-packs'), {
    method: 'POST',
    headers: packAdminHeaders(false),
    body: fd,
  })
  await throwUnlessOk(res)
  return res.json() as Promise<UploadPackAdminResult>
}

export async function createEmptyPack(body: {
  routeNumber: string
  displayName?: string
  organizationName?: string
  abbreviation?: string
}): Promise<{ pack: ServerContentPackSummary }> {
  const res = await fetch(apiUrl('/api/content-packs/new'), {
    method: 'POST',
    headers: packAdminHeaders(true),
    body: JSON.stringify(body),
  })
  await throwUnlessOk(res)
  return res.json() as Promise<{ pack: ServerContentPackSummary }>
}

/** Admin-only. Server returns 204 No Content on success. */
export async function deletePack(packId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/content-packs/${encodeURIComponent(packId)}`), {
    method: 'DELETE',
    headers: packAdminHeaders(false),
  })
  await throwUnlessOk(res)
}
