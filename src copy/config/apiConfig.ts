/**
 * API and map configuration.
 * Secrets (e.g. Mapbox token) come from VITE_* env vars.
 */
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
