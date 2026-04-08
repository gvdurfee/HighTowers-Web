import { useEffect, useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { db } from '@/db/schema'
import { generateId } from '@/utils/id'
import type {
  FlightPlanRecord,
  WaypointRecord,
  AirportRecord,
  PendingWaypoint,
} from '@/db/schema'
import { G1000Service } from '@/services/g1000'

type LocationState = { skippedWaypoints?: string[]; message?: string } | null

type DisplayItem =
  | { type: 'waypoint'; sequence: number; waypoint: WaypointRecord }
  | { type: 'pending'; sequence: number; pending: PendingWaypoint }

export function FlightPlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navState = (location.state ?? null) as LocationState
  const [dismissedSkippedWarning, setDismissedSkippedWarning] = useState(false)
  const [plan, setPlan] = useState<FlightPlanRecord | null>(null)
  const [waypoints, setWaypoints] = useState<WaypointRecord[]>([])
  const [departure, setDeparture] = useState<AirportRecord | null>(null)
  const [destination, setDestination] = useState<AirportRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [showExport, setShowExport] = useState(false)
  const [coordsByPending, setCoordsByPending] = useState<
    Record<string, { latDeg: string; latMin: string; lonDeg: string; lonMin: string }>
  >({})
  const [supplyingCode, setSupplyingCode] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const p = await db.flightPlans.get(id)
        setPlan(p ?? null)
        if (p) {
          const wps = await db.waypoints
            .where('flightPlanId')
            .equals(id)
            .sortBy('sequence')
          setWaypoints(wps)
          if (p.departureAirportId) {
            const d = await db.airports.get(p.departureAirportId)
            setDeparture(d ?? null)
          }
          if (p.destinationAirportId) {
            const d = await db.airports.get(p.destinationAirportId)
            setDestination(d ?? null)
          }
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handleExport = async () => {
    if (!plan) return
    const dep = departure ? { identifier: departure.identifier, name: departure.name, latitude: departure.latitude, longitude: departure.longitude, elevation: departure.elevation } : undefined
    const dest = destination ? { identifier: destination.identifier, name: destination.name, latitude: destination.latitude, longitude: destination.longitude, elevation: destination.elevation } : undefined
    const xml = G1000Service.generateFlightPlan({
      ...plan,
      departureAirport: dep,
      destinationAirport: dest,
      waypoints: waypoints.map((w) => ({
        id: w.id,
        originalName: w.originalName,
        g1000Name: w.g1000Name,
        latitude: w.latitude,
        longitude: w.longitude,
        routeType: w.routeType,
        sequence: w.sequence,
      })),
    })
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const depCode = departure?.identifier ?? 'UNK'
    const destCode = destination?.identifier ?? 'UNK'
    const routePart = plan.name.replace(/\s/g, '_')
    a.download = `${depCode}-${routePart}-${destCode}.fpl`
    a.click()
    URL.revokeObjectURL(url)
    setShowExport(false)
  }

  if (loading || !plan) {
    return (
      <div className="p-6">
        <p className="text-gray-500">
          {loading ? 'Loading...' : 'Flight plan not found.'}
        </p>
      </div>
    )
  }

  const pendingWaypoints = plan?.pendingWaypoints ?? []
  const showSkippedWarning =
    pendingWaypoints.length > 0 &&
    (!!navState?.message || true) &&
    !dismissedSkippedWarning

  // Merge waypoints and pending into display order by sequence
  const displayList: DisplayItem[] = []
  const wpBySeq = new Map(waypoints.map((w) => [w.sequence, w]))
  const pendingBySeq = new Map(pendingWaypoints.map((p) => [p.sequence, p]))
  const allSeqs = [
    ...new Set([...wpBySeq.keys(), ...pendingBySeq.keys()]),
  ].sort((a, b) => a - b)
  for (const seq of allSeqs) {
    const wp = wpBySeq.get(seq)
    const pend = pendingBySeq.get(seq)
    if (wp) displayList.push({ type: 'waypoint', sequence: seq, waypoint: wp })
    else if (pend)
      displayList.push({ type: 'pending', sequence: seq, pending: pend })
  }

  const supplyCoordinates = async (code: string, sequence: number) => {
    if (!plan) return
    const entry = coordsByPending[code]
    if (!entry) return
    const latDeg = parseFloat(entry.latDeg)
    const latMin = parseFloat(entry.latMin)
    const lonDeg = parseFloat(entry.lonDeg)
    const lonMin = parseFloat(entry.lonMin)
    if (
      Number.isNaN(latDeg) ||
      Number.isNaN(latMin) ||
      Number.isNaN(lonDeg) ||
      Number.isNaN(lonMin)
    )
      return
    const latitude = latDeg + latMin / 60 // N
    const longitude = -(lonDeg + lonMin / 60) // W = negative
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return
    setSupplyingCode(code)
    try {
      const name = code.trim().toUpperCase()
      const g1000Name = toG1000Name(name)
      const routeType = name.startsWith('IR') ? 'IR' : name.startsWith('SR') ? 'SR' : 'VR'
      await db.waypoints.add({
        id: generateId(),
        flightPlanId: plan.id,
        originalName: name,
        g1000Name,
        latitude,
        longitude,
        routeType,
        sequence,
      })
      const updated = {
        ...plan,
        pendingWaypoints: pendingWaypoints.filter((p) => p.code !== code),
        dateModified: new Date().toISOString(),
      }
      await db.flightPlans.update(plan.id, updated)
      setPlan(updated)
      const wps = await db.waypoints
        .where('flightPlanId')
        .equals(plan.id)
        .sortBy('sequence')
      setWaypoints(wps)
      setCoordsByPending((prev) => {
        const next = { ...prev }
        delete next[code]
        return next
      })
    } finally {
      setSupplyingCode(null)
    }
  }

  const setCoordForPending = (
    code: string,
    field: 'latDeg' | 'latMin' | 'lonDeg' | 'lonMin',
    value: string
  ) => {
    setCoordsByPending((prev) => ({
      ...prev,
      [code]: {
        ...(prev[code] ?? { latDeg: '', latMin: '', lonDeg: '', lonMin: '' }),
        [field]: value,
      },
    }))
  }

  return (
    <div className="p-6 max-w-3xl">
      {showSkippedWarning && (
        <div className="mb-4 p-4 bg-cap-yellow/20 border border-cap-yellow rounded-lg flex items-start justify-between gap-3">
          <p className="text-sm text-gray-800">
            {pendingWaypoints.length > 0
              ? `Could not find ${pendingWaypoints.length} waypoint(s) in the database: ${pendingWaypoints.map((p) => p.code).join(', ')}. Supply coordinates for each (e.g. from ForeFlight or AP/1B).`
              : navState?.message}
          </p>
          <button
            type="button"
            onClick={() => setDismissedSkippedWarning(true)}
            className="flex-shrink-0 p-1 hover:bg-black/5 rounded"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/flight-plans"
          className="text-cap-ultramarine hover:underline"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{plan.name}</h1>
      </div>

      <div className="space-y-6">
        <section className="p-4 bg-white rounded-lg border border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-3">Details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">Created:</dt>
            <dd>{new Date(plan.dateCreated).toLocaleString()}</dd>
            <dt className="text-gray-500">Modified:</dt>
            <dd>{new Date(plan.dateModified).toLocaleString()}</dd>
          </dl>
        </section>

        <section className="p-4 bg-white rounded-lg border border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-3">Airports</h2>
          <dl className="space-y-2 text-sm">
            {departure && (
              <>
                <dt className="text-gray-500">Departure:</dt>
                <dd>{departure.name} ({departure.identifier})</dd>
              </>
            )}
            {destination && (
              <>
                <dt className="text-gray-500">Destination:</dt>
                <dd>{destination.name} ({destination.identifier})</dd>
              </>
            )}
            {!departure && !destination && (
              <p className="text-gray-500">No airports set</p>
            )}
          </dl>
        </section>

        <section className="p-4 bg-white rounded-lg border border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-3">
            Waypoints ({displayList.length})
          </h2>
          {displayList.length === 0 ? (
            <p className="text-gray-500 text-sm">No waypoints</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {displayList.map((item, i) => (
                <li
                  key={
                    item.type === 'waypoint'
                      ? item.waypoint.id
                      : `pending-${item.pending.code}`
                  }
                  className="flex flex-wrap items-center gap-2 text-sm py-1.5"
                >
                  <span className="text-gray-500 w-6">{i + 1}.</span>
                  {item.type === 'waypoint' ? (
                    <>
                      <span>{item.waypoint.originalName}</span>
                      <span className="text-gray-400">→</span>
                      <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                        {item.waypoint.g1000Name}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{item.pending.code}</span>
                      <span className="text-gray-400">→</span>
                      <span className="px-2 py-0.5 bg-cap-scarlet/30 text-cap-scarlet rounded text-xs">
                        {toG1000Name(item.pending.code)}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">
                        Enter degrees and minutes (from ForeFlight)
                      </span>
                      <div className="flex flex-wrap gap-2 ml-2 items-center">
                        <span className="text-xs text-gray-600">Latitude</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={coordsByPending[item.pending.code]?.latDeg ?? ''}
                          onChange={(e) =>
                            setCoordForPending(item.pending.code, 'latDeg', e.target.value)
                          }
                          placeholder="34"
                          className="w-12 px-2 py-1 border border-gray-300 rounded text-xs text-center"
                        />
                        <span className="text-xs text-gray-500">º</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={coordsByPending[item.pending.code]?.latMin ?? ''}
                          onChange={(e) =>
                            setCoordForPending(item.pending.code, 'latMin', e.target.value)
                          }
                          placeholder="48.50"
                          className="w-14 px-2 py-1 border border-gray-300 rounded text-xs text-center"
                        />
                        <span className="text-xs text-gray-500">' N</span>
                        <span className="text-xs text-gray-600 ml-1">Longitude</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={coordsByPending[item.pending.code]?.lonDeg ?? ''}
                          onChange={(e) =>
                            setCoordForPending(item.pending.code, 'lonDeg', e.target.value)
                          }
                          placeholder="106"
                          className="w-12 px-2 py-1 border border-gray-300 rounded text-xs text-center"
                        />
                        <span className="text-xs text-gray-500">º</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={coordsByPending[item.pending.code]?.lonMin ?? ''}
                          onChange={(e) =>
                            setCoordForPending(item.pending.code, 'lonMin', e.target.value)
                          }
                          placeholder="33.00"
                          className="w-14 px-2 py-1 border border-gray-300 rounded text-xs text-center"
                        />
                        <span className="text-xs text-gray-500">' W</span>
                        <button
                          type="button"
                          onClick={() =>
                            supplyCoordinates(item.pending.code, item.sequence)
                          }
                          disabled={
                            supplyingCode === item.pending.code ||
                            !(coordsByPending[item.pending.code]?.latDeg ?? '').trim() ||
                            !(coordsByPending[item.pending.code]?.latMin ?? '').trim() ||
                            !(coordsByPending[item.pending.code]?.lonDeg ?? '').trim() ||
                            !(coordsByPending[item.pending.code]?.lonMin ?? '').trim()
                          }
                          className="px-3 py-1 bg-cap-ultramarine text-white rounded text-xs font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
                        >
                          {supplyingCode === item.pending.code ? '...' : 'Supply Coordinates'}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowExport(true)}
            className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90"
          >
            Export .fpl
          </button>
        </div>
      </div>

      {showExport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <h3 className="font-semibold text-lg mb-4">Export Flight Plan</h3>
            <p className="text-gray-600 text-sm mb-4">
              Download the G1000 .fpl file for import into your avionics.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowExport(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg hover:bg-cap-ultramarine/90"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function toG1000Name(original: string): string {
  const upper = original.toUpperCase()
  const match = upper.match(/^(IR|SR|VR)(\d+)([A-Z0-9]+)$/)
  if (!match) return original.slice(0, 8).replace(/[^A-Z0-9]/gi, '')
  const [, , num, suffix] = match
  return (suffix + num).slice(0, 8)
}
