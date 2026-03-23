import { useState, useEffect, useRef, useCallback } from 'react'
import { Map, MapRef } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { apiConfig } from '@/config/apiConfig'

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

interface SurveyMapModalProps {
  isOpen: boolean
  onClose: () => void
  initialLat: number
  initialLon: number
  onRecord: (lat: number, lon: number, elevationFt: number) => void
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
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const recordBtnRef = useRef<HTMLButtonElement>(null)

  const getOrderedFocusables = useCallback((): HTMLElement[] => {
    const els = [
      latDegRef.current,
      latMinRef.current,
      latHemRef.current,
      lonDegRef.current,
      lonMinRef.current,
      lonHemRef.current,
      recordBtnRef.current,
      closeBtnRef.current,
    ].filter((el) => el != null) as HTMLElement[]
    return els
  }, [])

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

  const lat = fromDms(Number(latDeg) || 0, Number(latMin) || 0, latHem)
  const lon = fromDms(Number(lonDeg) || 0, Number(lonMin) || 0, lonHem)

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
      setViewState({
        longitude: initialLon || -106.6504,
        latitude: initialLat || 35.0844,
        zoom: 16,
      })
      setMapReady(false)
      const t = setTimeout(() => setMapReady(true), 100)
      return () => clearTimeout(t)
    }
  }, [initialLat, initialLon, isOpen])

  useEffect(() => {
    if (isOpen && modalRef.current) {
      const first = latDegRef.current
      first?.focus()
    }
  }, [isOpen, mapReady])

  useEffect(() => {
    if (latDeg === '' && latMin === '' && lonDeg === '' && lonMin === '') return
    const latM = Number(latMin)
    const lonM = Number(lonMin)
    if ((latMin && (latM < 0 || latM >= 60)) || (lonMin && (lonM < 0 || lonM >= 60))) return
    setViewState((prev) => ({ ...prev, longitude: lon, latitude: lat }))
  }, [latDeg, latMin, latHem, lonDeg, lonMin, lonHem])

  const syncCenterToCoords = (lng: number, latVal: number) => {
    const dLat = toDms(latVal, true)
    const dLon = toDms(lng, false)
    setLatDeg(String(dLat.deg))
    setLatMin(String(dLat.min))
    setLatHem(dLat.hem as 'N' | 'S')
    setLonDeg(String(dLon.deg))
    setLonMin(String(dLon.min))
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

  const handleRecord = async () => {
    if (!validateAndWarn()) return
    setLoading(true)
    setError(null)
    const recordLat = viewState.latitude
    const recordLon = viewState.longitude
    try {
      const elev = await fetchElevation(recordLat, recordLon)
      onRecord(recordLat, recordLon, elev)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch elevation')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const token = apiConfig.mapboxAccessToken
  if (!token) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 max-w-md">
          <p className="text-cap-scarlet">Mapbox token not configured.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-200 rounded-lg"
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
        aria-labelledby="survey-location-title"
        className="bg-white rounded-xl flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 id="survey-location-title" className="text-lg font-semibold">Survey Location</h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-600 px-4 pb-2">
          Pan and zoom the map so the center crosshair is over the tower base, or enter coordinates below.
        </p>
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
              onMoveEnd={(evt) => syncCenterToCoords(evt.viewState.longitude, evt.viewState.latitude)}
              style={{ width: '100%', height: '100%' }}
              mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
            />
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
                borderColor: '#001489',
              }}
            >
              <div className="absolute w-[2px] h-6 bg-white" />
              <div className="absolute h-[2px] w-6 bg-white" />
            </div>
          </div>
        </div>
        <form
          className="p-4 border-t space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (validateAndWarn()) handleRecord()
          }}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
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
                className="w-10 px-2 py-1.5 border rounded font-mono text-sm"
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
                className="w-16 px-2 py-1.5 border rounded font-mono text-sm"
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
                className="px-2 py-1.5 border rounded font-mono text-sm"
                tabIndex={0}
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
                className="w-12 px-2 py-1.5 border rounded font-mono text-sm"
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
                className="w-16 px-2 py-1.5 border rounded font-mono text-sm"
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
                className="px-2 py-1.5 border rounded font-mono text-sm"
                tabIndex={0}
                aria-label="Longitude hemisphere"
              >
                <option value="E">E</option>
                <option value="W">W</option>
              </select>
            </fieldset>
          </div>
          {coordWarning && (
            <p className="text-cap-scarlet text-sm">{coordWarning}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-gray-500">
              {latDeg || lonDeg ? `${latDeg || '—'}°${latMin || '—'}′ ${latHem}, ${lonDeg || '—'}°${lonMin || '—'}′ ${lonHem}` : 'Pan map or enter coordinates'}
            </div>
            {error && <p className="text-cap-scarlet text-sm">{error}</p>}
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
