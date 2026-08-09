/**
 * Client for Gemini tower-locate experiment endpoints.
 */

import { apiUrl } from '@/config/apiConfig'

export type TowerLocateSuggestion = {
  lat: number
  lon: number
  confidence: number | null
  reason: string
  padVisibleOnMap: boolean
  pixelX: number
  pixelY: number
  model: string
}

export type TowerLocateEvalRow = {
  id: string
  timestamp: string
  priorLat: number
  priorLon: number
  humanLat: number
  humanLon: number
  geminiLat: number
  geminiLon: number
  errorMeters: number | null
  errorNm: number | null
  confidence: number | null
  model: string
  imagerySource: string
  notes: string
}

export type TowerLocateSuggestResult = {
  suggestion: TowerLocateSuggestion
  prior: { lat: number; lon: number; halfSideNm: number }
  tile: { width: number; height: number }
  evalRow: TowerLocateEvalRow | null
}

/** Resize an HTMLImageElement to a JPEG data URL (long edge capped). */
export function imageElementToJpegDataUrl(
  img: HTMLImageElement,
  maxLongEdge = 1280,
  quality = 0.85
): string {
  const w0 = img.naturalWidth || img.width
  const h0 = img.naturalHeight || img.height
  if (!w0 || !h0) throw new Error('Image has no dimensions')
  const scale = Math.min(1, maxLongEdge / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * scale))
  const h = Math.max(1, Math.round(h0 * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

export async function fetchTowerLocateStatus(): Promise<{
  geminiConfigured: boolean
  model: string
}> {
  const res = await fetch(apiUrl('/api/tower-locate/status'))
  if (!res.ok) throw new Error(`Status ${res.status}`)
  return res.json()
}

export async function suggestTowerLocation(body: {
  towerPhotoBase64: string
  priorLat: number
  priorLon: number
  halfSideNm?: number
  humanLat?: number
  humanLon?: number
  missionId?: string
  towerLabel?: string
  notes?: string
  logEval?: boolean
}): Promise<TowerLocateSuggestResult> {
  const res = await fetch(apiUrl('/api/tower-locate/suggest'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Suggest failed (${res.status})`
    )
  }
  return data as TowerLocateSuggestResult
}

export async function fetchTowerLocateEvalRows(limit = 50): Promise<TowerLocateEvalRow[]> {
  const res = await fetch(apiUrl(`/api/tower-locate/eval?limit=${limit}`))
  if (!res.ok) throw new Error(`Eval list failed (${res.status})`)
  const data = await res.json()
  return (data.rows ?? []) as TowerLocateEvalRow[]
}
