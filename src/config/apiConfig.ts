/**
 * API and map configuration.
 * Secrets (e.g. Mapbox token) come from VITE_* env vars.
 */

/** Normalize hosted API origin (no trailing slash). Empty = same-origin `/api` (local Vite proxy). */
function normalizeApiBase(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return ''
  return raw.trim().replace(/\/+$/, '')
}

/** Public URL of the Node API when the web app is not served with a same-origin proxy (e.g. GitHub Pages). */
export const apiBaseUrl = normalizeApiBase(import.meta.env.VITE_API_BASE_URL)

/**
 * Full URL for API routes, e.g. `/api/mtr/waypoints` → `https://api.example.com/api/mtr/waypoints` when configured.
 */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (!apiBaseUrl) return p
  return `${apiBaseUrl}${p}`
}

export const apiConfig = {
  mapboxAccessToken: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '',
  defaultMapboxZoom: 18,
  defaultImageWidth: 512,
  defaultImageHeight: 512,
} as const

export function isMapboxConfigured(): boolean {
  const token = apiConfig.mapboxAccessToken
  return typeof token === 'string' && token.length > 0 && token !== 'your_mapbox_token_here'
}
