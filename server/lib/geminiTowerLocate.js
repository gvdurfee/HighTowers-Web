/**
 * Gemini vision assist for tower-base location (experiment).
 * API key: GEMINI_API_KEY in server .env — never exposed to the browser.
 */

import fetch from 'node-fetch'
import { pixelOffsetToLatLon } from '../../shared/tower-locate/geo.js'

const DEFAULT_MODEL = 'gemini-2.0-flash'

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}

export function geminiModel() {
  return (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim()
}

/**
 * Strip data-URL prefix if present; return { mimeType, base64 }.
 */
export function parseImagePayload(imageBase64, fallbackMime = 'image/jpeg') {
  const raw = String(imageBase64 ?? '').trim()
  const m = raw.match(/^data:([^;]+);base64,(.+)$/s)
  if (m) {
    return { mimeType: m[1], base64: m[2].replace(/\s/g, '') }
  }
  return { mimeType: fallbackMime, base64: raw.replace(/\s/g, '') }
}

function extractJsonObject(text) {
  const t = String(text ?? '').trim()
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1].trim() : t
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('Gemini response did not contain a JSON object')
  }
  return JSON.parse(body.slice(start, end + 1))
}

/**
 * Ask Gemini to locate the tower pad in a satellite tile relative to the ground photo.
 *
 * @param {object} opts
 * @param {string} opts.towerPhotoBase64
 * @param {string} [opts.towerPhotoMime]
 * @param {string} opts.satellitePngBase64
 * @param {number} opts.priorLat
 * @param {number} opts.priorLon
 * @param {number} opts.halfSideNm
 * @param {number} opts.tileWidth
 * @param {number} opts.tileHeight
 */
export async function suggestTowerLocationWithGemini(opts) {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server')
  }

  const model = geminiModel()
  const photo = parseImagePayload(opts.towerPhotoBase64, opts.towerPhotoMime || 'image/jpeg')
  const sat = parseImagePayload(opts.satellitePngBase64, 'image/png')

  if (photo.base64.length < 100 || sat.base64.length < 100) {
    throw new Error('Tower photo or satellite tile payload is empty')
  }
  // Rough cap (~12MB base64) to stay under Gemini inline limits with headroom.
  if (photo.base64.length > 12_000_000 || sat.base64.length > 12_000_000) {
    throw new Error('Image payload too large; resize the tower photo and retry')
  }

  const prompt = `You are assisting Civil Air Patrol tower surveyors.

Context:
- Image A is a low-oblique digital photo of a communications tower (or the site).
- Image B is a north-up satellite/map tile centered near a GPS prior (often a G1000 flyover mark).
- Tile center: lat ${opts.priorLat}, lon ${opts.priorLon}
- Tile covers about ±${opts.halfSideNm} nautical miles (square), north-up.
- Tile size: ${opts.tileWidth} x ${opts.tileHeight} pixels. Pixel (0,0) is the NW corner; +x is east; +y is south.

Task:
1. Find the most likely tower base / cleared pad / mast location in Image B that matches Image A.
2. Return the pixel coordinates of that point in Image B.
3. Do NOT invent a location far from plausible clearings if confidence is low — set confidence low instead.

Respond with ONLY a JSON object (no markdown) using this schema:
{
  "pixelX": number,
  "pixelY": number,
  "confidence": number,
  "reason": string,
  "padVisibleOnMap": boolean
}

confidence is 0-100. pixelX/pixelY must be within the tile bounds.`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const body = {
    contents: [
      {
        parts: [
          { text: 'Image A — tower / site photo (low-oblique):' },
          { inline_data: { mime_type: photo.mimeType, data: photo.base64 } },
          { text: 'Image B — north-up satellite tile around GPS prior:' },
          { inline_data: { mime_type: sat.mimeType, data: sat.base64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 400)
    throw new Error(`Gemini API error ${res.status}: ${snippet}`)
  }

  const data = await res.json()
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') ?? ''
  if (!text) {
    throw new Error('Gemini returned an empty response')
  }

  const parsed = extractJsonObject(text)
  const pixelX = Number(parsed.pixelX)
  const pixelY = Number(parsed.pixelY)
  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) {
    throw new Error('Gemini JSON missing pixelX/pixelY')
  }

  const clampedX = Math.min(opts.tileWidth - 1, Math.max(0, pixelX))
  const clampedY = Math.min(opts.tileHeight - 1, Math.max(0, pixelY))
  const { lat, lon } = pixelOffsetToLatLon({
    centerLat: opts.priorLat,
    centerLon: opts.priorLon,
    halfSideNm: opts.halfSideNm,
    pixelX: clampedX,
    pixelY: clampedY,
    widthPx: opts.tileWidth,
    heightPx: opts.tileHeight,
  })

  let confidence = Number(parsed.confidence)
  if (!Number.isFinite(confidence)) confidence = null
  else confidence = Math.min(100, Math.max(0, confidence))

  return {
    lat,
    lon,
    pixelX: clampedX,
    pixelY: clampedY,
    confidence,
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 800) : '',
    padVisibleOnMap: Boolean(parsed.padVisibleOnMap),
    model,
    rawText: text.slice(0, 2000),
  }
}
