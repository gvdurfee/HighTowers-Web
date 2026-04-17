import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Map, MapRef, Source, Layer } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { apiConfig, isMapboxConfigured } from '@/config/apiConfig'
import { fetchRecentImageryOverlay } from '@/services/recentImageryOverlay'
import type { RecentImageryOverlay } from '@/services/recentImageryOverlay'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'

const HINT_SURVEY_G1000 = 'surveyMap.g1000Context'
const HINT_SURVEY_COORDS = 'surveyMap.coordinates'
const HINT_SURVEY_OVERLAY = 'surveyMap.overlayPatch'

/** Convert decimal degrees to DMS components (DD, MM.mm, N/S or E/W) */
function toDms(decimal: number, isLat: boolean): { deg: number; min: number; hem: 'N' | 'S' | 'E' | 'W' } {
  const abs = Math.abs(decimal)
  const deg = Math.floor(abs)
  const min = (abs - deg) * 60
  const hem = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W')
  return { deg, min, hem }
}

/** Convert DMS to decimal degrees */
function fromDms(deg: number, min: number, hem: 'N' | 'S' | 'E' | 'W'): number {
  const abs = deg + min / 60
  return (hem === 'S' || hem === 'W') ? -abs : abs
}

/** Minutes for display: always two digits after the decimal (MM.mm) */
function formatMinutesDisplay(minStr: string): string {
  if (!minStr.trim()) return '—'
  const n = Number(minStr)
  if (!Number.isFinite(n)) return minStr
  return n.toFixed(2)
}

/** Minutes when syncing from map center (avoid long float strings in inputs) */
function formatMinutesFromMap(minutes: number): string {
  return minutes.toFixed(2)
}

export interface SurveyMapRecordOptions {
  /** Tower could not be identified on the map; best-effort map position / estimated bearing. */
  towerNotVisibleOnMap?: boolean
}

interface SurveyMapModalProps {
  isOpen: boolean
  onClose: () => void
  initialLat: number
  initialLon: number
  onRecord: (lat: number, lon: number, elevationFt: number, options?: SurveyMapRecordOptions) => void
  fetchElevation: (lat: number, lon: number) => Promise<number>
}

export function SurveyMapModal({
  isOpen,
  onClose,
  initialLat,
  initialLon,
  onRecord,
  fetchElevation,
}: SurveyMapModalProps) {
  const defLat = initialLat || 35.0844
  const defLon = initialLon || -106.6504
  const [latDeg, setLatDeg] = useState<string>('')
  const [latMin, setLatMin] = useState<string>('')
  const [latHem, setLatHem] = useState<'N' | 'S'>('N')
  const [lonDeg, setLonDeg] = useState<string>('')
  const [lonMin, setLonMin] = useState<string>('')
  const [lonHem, setLonHem] = useState<'E' | 'W'>('W')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coordWarning, setCoordWarning] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const mapRef = useRef<MapRef>(null)
  const latDegRef = useRef<HTMLInputElement>(null)
  const latMinRef = useRef<HTMLInputElement>(null)
  const lonDegRef = useRef<HTMLInputElement>(null)
  const lonMinRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const latHemRef = useRef<HTMLSelectElement>(null)
  const lonHemRef = useRef<HTMLSelectElement>(null)
  const backBtnRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const recordBtnRef = useRef<HTMLButtonElement>(null)
  const towerNotVisibleRef = useRef<HTMLInputElement>(null)
  const overlayBlobRef = useRef<string | null>(null)
  /** When true, next map moveend came from coordinate fields / programatic fly — do not overwrite inputs */
  const skipNextMapCenterSyncRef = useRef(false)

  const [imageryOverlay, setImageryOverlay] = useState<RecentImageryOverlay | null>(null)
  const [overlayLoading, setOverlayLoading] = useState(false)
  const [overlayError, setOverlayError] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [towerNotVisibleOnMap, setTowerNotVisibleOnMap] = useState(false)
  const [coordVerifyDismissed, setCoordVerifyDismissed] = useState(false)
  const { isSeen, markSeen } = useHintsSeen()

  const overlayLoadRef = useRef<HTMLButtonElement>(null)
  const overlayRemoveRef = useRef<HTMLButtonElement>(null)
  const coordVerifyDismissRef = useRef<HTMLButtonElement>(null)

  const revokeOverlayBlob = useCallback(() => {
    if (overlayBlobRef.current) {
      URL.revokeObjectURL(overlayBlobRef.current)
      overlayBlobRef.current = null
    }
  }, [])

  const coordsComplete = useMemo(() => {
    const ld = latDeg.trim()
    const lm = latMin.trim()
    const gd = lonDeg.trim()
    const gm = lonMin.trim()
    if (!ld || !lm || !gd || !gm) return false
    const latM = Number(lm)
    const lonM = Number(gm)
    if (!Number.isFinite(latM) || !Number.isFinite(lonM)) return false
    if (latM < 0 || latM >= 60 || lonM < 0 || lonM >= 60) return false
    return true
  }, [latDeg, latMin, lonDeg, lonMin])

  const showCoordVerifyBanner = coordsComplete && !coordVerifyDismissed

  const getOrderedFocusables = useCallback((): HTMLElement[] => {
    const list: HTMLElement[] = []
    const push = (el: HTMLElement | null) => {
      if (el) list.push(el)
    }
    push(backBtnRef.current)
    push(latDegRef.current)
    push(latMinRef.current)
    push(lonDegRef.current)
    push(lonMinRef.current)
    push(towerNotVisibleRef.current)
    push(overlayLoadRef.current)
    if (imageryOverlay) push(overlayRemoveRef.current)
    if (showCoordVerifyBanner) push(coordVerifyDismissRef.current)
    push(recordBtnRef.current)
    push(closeBtnRef.current)
    return list
  }, [imageryOverlay, showCoordVerifyBanner])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusables = getOrderedFocusables()
      if (focusables.length === 0) return
      const current = document.activeElement as HTMLElement | null
      const idx = current ? focusables.indexOf(current) : -1
      if (idx < 0) return
      e.preventDefault()
      if (e.shiftKey) {
        const next = idx === 0 ? focusables[focusables.length - 1] : focusables[idx - 1]
        next.focus()
      } else {
        const next = idx === focusables.length - 1 ? focusables[0] : focusables[idx + 1]
        next.focus()
      }
    },
    [getOrderedFocusables]
  )

  const [viewState, setViewState] = useState({
    longitude: defLon,
    latitude: defLat,
    zoom: 16,
  })

  useEffect(() => {
    if (isOpen) {
      setCoordWarning(null)
      setLatDeg('')
      setLatMin('')
      setLatHem('N')
      setLonDeg('')
      setLonMin('')
      setLonHem('W')
      revokeOverlayBlob()
      setImageryOverlay(null)
      setOverlayError(null)
      setOverlayLoading(false)
      setMapError(null)
      setTowerNotVisibleOnMap(false)
      setCoordVerifyDismissed(false)
      setViewState({
        longitude: initialLon || -106.6504,
        latitude: initialLat || 35.0844,
        zoom: 16,
      })
      setMapReady(false)
      const t = setTimeout(() => setMapReady(true), 100)
      return () => clearTimeout(t)
    }
  }, [initialLat, initialLon, isOpen, revokeOverlayBlob])

  useEffect(() => {
    if (isOpen && modalRef.current) {
      const first = latDegRef.current
      first?.focus()
    }
  }, [isOpen, mapReady])

  useEffect(() => {
    if (!coordsComplete) setCoordVerifyDismissed(false)
  }, [coordsComplete])

  useEffect(() => {
    if (latDeg === '' && latMin === '' && lonDeg === '' && lonMin === '') return
    const latM = Number(latMin)
    const lonM = Number(lonMin)
    if ((latMin && (latM < 0 || latM >= 60)) || (lonMin && (lonM < 0 || lonM >= 60))) return
    const nextLat = fromDms(Number(latDeg) || 0, Number(latMin) || 0, latHem)
    const nextLon = fromDms(Number(lonDeg) || 0, Number(lonMin) || 0, lonHem)
    skipNextMapCenterSyncRef.current = true
    setViewState((prev) => ({ ...prev, longitude: nextLon, latitude: nextLat }))
  }, [latDeg, latMin, latHem, lonDeg, lonMin, lonHem])

  const syncCenterToCoords = (lng: number, latVal: number) => {
    const dLat = toDms(latVal, true)
    const dLon = toDms(lng, false)
    setLatDeg(String(dLat.deg))
    setLatMin(formatMinutesFromMap(dLat.min))
    setLatHem(dLat.hem as 'N' | 'S')
    setLonDeg(String(dLon.deg))
    setLonMin(formatMinutesFromMap(dLon.min))
    setLonHem(dLon.hem as 'E' | 'W')
  }

  const validateAndWarn = (): boolean => {
    setCoordWarning(null)
    const latM = Number(latMin)
    const lonM = Number(lonMin)
    if (latMin && (latM < 0 || latM >= 60)) {
      setCoordWarning('Latitude minutes must be 0–59.99 (use decimal, e.g. 59.93)')
      latMinRef.current?.focus()
      return false
    }
    if (lonMin && (lonM < 0 || lonM >= 60)) {
      setCoordWarning('Longitude minutes must be 0–59.99 (use decimal, e.g. 40.14)')
      lonMinRef.current?.focus()
      return false
    }
    return true
  }

  const handleLoadImageryOverlay = async () => {
    setOverlayError(null)
    setOverlayLoading(true)
    revokeOverlayBlob()
    setImageryOverlay(null)
    try {
      const result = await fetchRecentImageryOverlay(
        viewState.latitude,
        viewState.longitude
      )
      if (result.url.startsWith('blob:')) {
        overlayBlobRef.current = result.url
      }
      setImageryOverlay(result)
    } catch (e) {
      let msg = e instanceof Error ? e.message : 'Failed to load overlay'
      if (msg.includes('CDSE_OAUTH_CLIENT')) {
        msg += ` Add both variables to HighTowers-Web/.env (project root), then restart npm run dev:all so the server reloads them. See server/README.md.`
      }
      setOverlayError(msg)
    } finally {
      setOverlayLoading(false)
    }
  }

  const handleRemoveImageryOverlay = () => {
    revokeOverlayBlob()
    setImageryOverlay(null)
    setOverlayError(null)
  }

  const handleRecord = async () => {
    if (!validateAndWarn()) return
    setLoading(true)
    setError(null)
    const recordLat = viewState.latitude
    const recordLon = viewState.longitude
    try {
      const elev = await fetchElevation(recordLat, recordLon)
      onRecord(recordLat, recordLon, elev, {
        towerNotVisibleOnMap: towerNotVisibleOnMap || undefined,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch elevation')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const token = apiConfig.mapboxAccessToken
  if (!isMapboxConfigured()) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 max-w-md space-y-3">
          <p className="text-cap-pimento font-medium">Mapbox access token missing or still set to the placeholder.</p>
          <p className="text-sm text-gray-700">
            Add a real token from{' '}
            <a href="https://account.mapbox.com/" className="text-cap-ultramarine underline" target="_blank" rel="noreferrer">
              account.mapbox.com
            </a>{' '}
            to <code className="bg-gray-100 px-1 rounded">HighTowers-Web/.env</code> as{' '}
            <code className="bg-gray-100 px-1 rounded">VITE_MAPBOX_ACCESS_TOKEN=pk.…</code>
            , then restart <code className="bg-gray-100 px-1 rounded">npm run dev:all</code>.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 px-4 py-2 bg-gray-200 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fly-over-location-title"
        className="bg-white rounded-xl flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between gap-2 p-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <button
              ref={backBtnRef}
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cap-ultramarine/40"
            >
              Back
            </button>
            <h2 id="fly-over-location-title" className="text-lg font-semibold">
              Look for Tower on Map
            </h2>
            <GuidedHint
              hintId={HINT_SURVEY_G1000}
              stepNumber={1}
              title="Coordinates from the aircraft"
              body="Aircrew often get an approximate tower position by flying over the structure and pressing the G1000 MFD Range Knob to capture coordinates—written down or photographed from the display. Enter that position in the Lat and Lon fields at the bottom (degrees and decimal minutes)."
              isSeen={isSeen(HINT_SURVEY_G1000)}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded shrink-0"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-600 px-4 pb-2">
          Pan and zoom the map so the center crosshair is over the tower base, or enter coordinates below.
        </p>
        {showCoordVerifyBanner && (
          <div
            role="alert"
            className="mx-4 mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            <span className="min-w-0 flex-1">
              Double-check the coordinates against your MFD notes or photo before moving the map. After you
              dismiss this message, you can pan and zoom as usual.
            </span>
            <button
              ref={coordVerifyDismissRef}
              type="button"
              className="shrink-0 rounded-lg bg-cap-ultramarine px-3 py-1.5 text-white text-sm font-medium hover:bg-cap-ultramarine/90"
              onClick={() => setCoordVerifyDismissed(true)}
            >
              Got it
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
          <GuidedHint
            hintId={HINT_SURVEY_OVERLAY}
            stepNumber={3}
            title="Recent map patch overlay"
            body="This adds a semi-transparent patch of alternate recent imagery on top of the basemap. Use it when the tower is missing or hard to identify in the default Mapbox view, then pan and zoom as usual."
            isSeen={isSeen(HINT_SURVEY_OVERLAY)}
            onDismiss={markSeen}
            surface="light"
          />
          <button
            ref={overlayLoadRef}
            type="button"
            onClick={handleLoadImageryOverlay}
            disabled={overlayLoading}
            className="text-sm px-3 py-1.5 border border-cap-ultramarine text-cap-ultramarine rounded-lg hover:bg-cap-ultramarine/10 disabled:opacity-50"
            aria-label="Overlay recent map patch for this area"
          >
            {overlayLoading ? 'Loading patch…' : 'Overlay recent map patch'}
          </button>
          {imageryOverlay && (
            <button
              ref={overlayRemoveRef}
              type="button"
              onClick={handleRemoveImageryOverlay}
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-gray-900 hover:bg-gray-50"
              aria-label="Remove map patch overlay"
            >
              Remove overlay
            </button>
          )}
        </div>
        {overlayError && (
          <p className="text-xs text-cap-pimento px-4 pb-1">{overlayError}</p>
        )}
        {imageryOverlay && (
          <p className="text-xs text-gray-500 px-4 pb-1">
            Sentinel-2 is ~10&nbsp;m resolution (often softer than Mapbox). Overlay is visual only; Record
            Location still uses the map center (crosshair). Use <strong>Remove overlay</strong> for the
            sharpest Mapbox view.
          </p>
        )}
        {mapError && (
          <p className="text-xs text-cap-pimento px-4 pb-1">
            Map: {mapError} Check VITE_MAPBOX_ACCESS_TOKEN and restart the dev server.
          </p>
        )}
        <div
          className="relative w-full overflow-hidden"
          style={{ height: 400 }}
          tabIndex={-1}
        >
          {mapReady && (
            <Map
              ref={mapRef}
              mapboxAccessToken={token}
              {...viewState}
              onMove={(evt) => setViewState(evt.viewState)}
              onMoveEnd={(evt) => {
                if (skipNextMapCenterSyncRef.current) {
                  skipNextMapCenterSyncRef.current = false
                  return
                }
                syncCenterToCoords(evt.viewState.longitude, evt.viewState.latitude)
              }}
              onError={(e) => {
                const msg =
                  e.error && typeof (e.error as Error).message === 'string'
                    ? (e.error as Error).message
                    : String((e as { error?: unknown }).error ?? 'Map failed to load')
                setMapError(msg)
              }}
              style={{ width: '100%', height: '100%' }}
              mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
            >
              {imageryOverlay && (
                <Source
                  id="recent-imagery-overlay"
                  type="image"
                  url={imageryOverlay.url}
                  coordinates={imageryOverlay.coordinates}
                >
                  <Layer
                    id="recent-imagery-overlay-layer"
                    type="raster"
                    paint={{ 'raster-opacity': 0.55 }}
                  />
                </Source>
              )}
            </Map>
          )}
          {/* Center crosshair - iPad style: semi-transparent circle with white cross */}
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            aria-hidden
          >
            <div
              className="relative w-[60px] h-[60px] rounded-full border-2 flex items-center justify-center"
              style={{
                backgroundColor: 'rgba(0, 20, 137, 0.3)',
                borderColor: '#0E2B8D',
              }}
            >
              <div className="absolute w-[2px] h-6 bg-white" />
              <div className="absolute h-[2px] w-6 bg-white" />
            </div>
          </div>
        </div>
        <form
          className="p-4 border-t space-y-3 text-gray-900"
          onSubmit={(e) => {
            e.preventDefault()
            if (validateAndWarn()) handleRecord()
          }}
        >
          <p id="hemisphere-fields-note" className="sr-only">
            North-south and east-west hemisphere controls are skipped when tabbing between coordinate fields;
            use the pointer to change them when needed (for example overseas training routes).
          </p>
          <div
            className="flex flex-wrap items-end gap-x-4 gap-y-2"
            aria-describedby="hemisphere-fields-note"
          >
            <GuidedHint
              hintId={HINT_SURVEY_COORDS}
              stepNumber={2}
              title="Entering coordinates"
              body="Enter degrees and decimal minutes from your MFD notes or photo. Tab moves through latitude degrees, latitude minutes, longitude degrees, and longitude minutes—it skips the N and W controls, which default to typical U.S. locations. For overseas routes, click or tap N/S and E/W to match the capture."
              isSeen={isSeen(HINT_SURVEY_COORDS)}
              onDismiss={markSeen}
              surface="light"
            />
            <fieldset className="flex items-center gap-1.5">
              <legend className="sr-only">Latitude</legend>
              <span className="text-sm text-gray-600">Lat</span>
              <input
                ref={latDegRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={latDeg}
                onChange={(e) => setLatDeg(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    latMinRef.current?.focus()
                  }
                }}
                className="w-10 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm bg-white text-gray-900"
                tabIndex={0}
                aria-label="Latitude degrees"
                placeholder=""
              />
              <span className="text-gray-500">°</span>
              <input
                ref={latMinRef}
                type="text"
                inputMode="decimal"
                value={latMin}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, '')
                  if ((v.match(/\./g) || []).length <= 1) {
                    const n = Number(v)
                    if (v && n >= 60) {
                      setCoordWarning('Minutes must be 0–59.99 (use decimal, e.g. 59.93)')
                    } else {
                      setCoordWarning(null)
                    }
                    setLatMin(v)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    lonDegRef.current?.focus()
                  }
                }}
                className="w-16 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm bg-white text-gray-900"
                tabIndex={0}
                aria-label="Latitude minutes"
                placeholder=""
              />
              <span className="text-gray-500">′</span>
              <select
                ref={latHemRef}
                value={latHem}
                onChange={(e) => setLatHem(e.target.value as 'N' | 'S')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    lonDegRef.current?.focus()
                  }
                }}
                className="px-2 py-1.5 border border-gray-300 rounded font-mono text-sm bg-white text-gray-900"
                tabIndex={-1}
                aria-label="Latitude hemisphere"
              >
                <option value="N">N</option>
                <option value="S">S</option>
              </select>
            </fieldset>
            <fieldset className="flex items-center gap-1.5">
              <legend className="sr-only">Longitude</legend>
              <span className="text-sm text-gray-600">Lon</span>
              <input
                ref={lonDegRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={lonDeg}
                onChange={(e) => setLonDeg(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    lonMinRef.current?.focus()
                  }
                }}
                className="w-12 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm bg-white text-gray-900"
                tabIndex={0}
                aria-label="Longitude degrees"
                placeholder=""
              />
              <span className="text-gray-500">°</span>
              <input
                ref={lonMinRef}
                type="text"
                inputMode="decimal"
                value={lonMin}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, '')
                  if ((v.match(/\./g) || []).length <= 1) {
                    const n = Number(v)
                    if (v && n >= 60) {
                      setCoordWarning('Minutes must be 0–59.99 (use decimal, e.g. 40.14)')
                    } else {
                      setCoordWarning(null)
                    }
                    setLonMin(v)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!validateAndWarn()) return
                    handleRecord()
                  }
                }}
                className="w-16 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm bg-white text-gray-900"
                tabIndex={0}
                aria-label="Longitude minutes"
                placeholder=""
              />
              <span className="text-gray-500">′</span>
              <select
                ref={lonHemRef}
                value={lonHem}
                onChange={(e) => setLonHem(e.target.value as 'E' | 'W')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (!validateAndWarn()) return
                    handleRecord()
                  }
                }}
                className="px-2 py-1.5 border border-gray-300 rounded font-mono text-sm bg-white text-gray-900"
                tabIndex={-1}
                aria-label="Longitude hemisphere"
              >
                <option value="E">E</option>
                <option value="W">W</option>
              </select>
            </fieldset>
          </div>
          {coordWarning && (
            <p className="text-cap-pimento text-sm">{coordWarning}</p>
          )}
          <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
            <input
              ref={towerNotVisibleRef}
              type="checkbox"
              checked={towerNotVisibleOnMap}
              onChange={(e) => {
                const checked = e.target.checked
                setTowerNotVisibleOnMap(checked)
                if (!checked) {
                  handleRemoveImageryOverlay()
                }
              }}
              className="mt-1 rounded border-gray-300"
              aria-describedby="tower-not-visible-hint"
            />
            <span>
              <span className="font-medium">Tower not visible on map</span>
              <span id="tower-not-visible-hint" className="block text-gray-600 text-xs mt-0.5">
                Check if the structure cannot be identified on the imagery. Record the best map position
                (e.g. nearest route segment). Heights and bearing/distance on the survey form will be
                marked as estimated — see Notes.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-gray-500">
              {latDeg || lonDeg
                ? `${latDeg || '—'}°${formatMinutesDisplay(latMin)}′ ${latHem}, ${lonDeg || '—'}°${formatMinutesDisplay(lonMin)}′ ${lonHem}`
                : 'Pan map or enter coordinates'}
            </div>
            {error && <p className="text-cap-pimento text-sm">{error}</p>}
            <button
              ref={recordBtnRef}
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? 'Fetching elevation...' : 'Record Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
