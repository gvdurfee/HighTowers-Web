/**
 * Hosted ForeFlight Content Pack library API (hybrid SQLite + ZIP on server).
 */
import { apiUrl } from '@/config/apiConfig'

const LS_KEY = 'hightowers.contentPackApiKey'

/** Matches `GET /api/content-packs` row shape (SQLite column names). */
export type ServerContentPackSummary = {
  id: string
  name: string
  created_at: string
  updated_at: string
  current_revision: number
  csv_member_path: string
  /**
   * Numeric MTR route prefix derived from the pack's user_waypoints rows
   * (e.g. "112"). `null` when the pack has no MTR-style waypoints. Used to
   * auto-match a content pack to a mission/flight plan by route number.
   */
  primary_route_number: string | null
}

export function getContentPackApiKey(): string {
  if (typeof localStorage === 'undefined') return ''
  return (localStorage.getItem(LS_KEY) ?? import.meta.env.VITE_CONTENT_PACK_API_KEY ?? '').trim()
}

export function setContentPackApiKey(key: string): void {
  localStorage.setItem(LS_KEY, key.trim())
}

function authHeaders(): HeadersInit {
  const key = getContentPackApiKey()
  const h: Record<string, string> = {}
  if (key) h['X-API-Key'] = key
  return h
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

function resStatusFallback(status: number): string {
  return `HTTP ${status}`
}

async function throwUnlessOk(res: Response): Promise<void> {
  if (res.ok) return
  const raw = await readError(res)
  throw new Error(failMessage(res.status, raw || resStatusFallback(res.status)))
}

export const contentPackApi = {
  async listPacks(): Promise<{ packs: ServerContentPackSummary[] }> {
    const res = await fetch(apiUrl('/api/content-packs'), { headers: authHeaders() })
    await throwUnlessOk(res)
    return res.json()
  },

  async getPack(id: string, includeWaypoints = false): Promise<unknown> {
    const q = includeWaypoints ? '?include=waypoints' : ''
    const res = await fetch(apiUrl(`/api/content-packs/${id}${q}`), { headers: authHeaders() })
    await throwUnlessOk(res)
    return res.json()
  },

  async uploadPack(file: File, name?: string): Promise<{ pack: ServerContentPackSummary }> {
    const fd = new FormData()
    fd.append('file', file)
    if (name?.trim()) fd.append('name', name.trim())
    const res = await fetch(apiUrl('/api/content-packs'), {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    })
    await throwUnlessOk(res)
    return res.json()
  },

  async previewApply(
    packId: string,
    body: {
      expectedRevision?: number
      routeNumber: string | null
      towers: { lat: number; lon: number; groundElevationFt?: number }[]
    }
  ): Promise<unknown> {
    const res = await fetch(apiUrl(`/api/content-packs/${packId}/preview-apply`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    })
    await throwUnlessOk(res)
    return res.json()
  },

  async apply(
    packId: string,
    body: {
      expectedRevision: number
      routeNumber: string | null
      towers: { lat: number; lon: number; groundElevationFt?: number }[]
      createdBy?: string
    }
  ): Promise<unknown> {
    const res = await fetch(apiUrl(`/api/content-packs/${packId}/apply`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    })
    await throwUnlessOk(res)
    return res.json()
  },

  exportPackDownloadUrl(packId: string): string {
    return apiUrl(`/api/content-packs/${packId}/export`)
  },

  /** Authenticated export (browser navigation cannot send `X-API-Key`). */
  async downloadExportBlob(packId: string): Promise<Blob> {
    const res = await fetch(apiUrl(`/api/content-packs/${packId}/export`), {
      headers: authHeaders(),
    })
    await throwUnlessOk(res)
    return res.blob()
  },
}
