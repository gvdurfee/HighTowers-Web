import { useEffect, useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { db } from '@/db/schema'
import { generateId } from '@/utils/id'
import type {
  FlightPlanRecord,
  WaypointRecord,
  AirportRecord,
  PendingWaypoint,
  FlightPlanCreationLoadMethod,
} from '@/db/schema'

function creationLoadMethodLabel(m: FlightPlanCreationLoadMethod): string {
  switch (m) {
    case 'route':
      return 'Load full route'
    case 'sequenceLibrary':
      return 'G1000 user waypoint library'
    case 'coordinatorSurvey':
      return 'Coordinator Console'
    default:
      return 'Waypoint sequence'
  }
}
import { G1000Service } from '@/services/g1000'
import { convertWaypointNameToG1000 } from '@/utils/g1000WaypointName'
import { useHintsSeen } from '@/hooks/useHintsSeen'
import { isCoordinatorSurveyAnchor } from '@/utils/coordinatorSurveyPlan'

type LocationState = { skippedWaypoints?: string[]; message?: string } | null

type DisplayItem =
  | { type: 'waypoint'; sequence: number; waypoint: WaypointRecord }
  | { type: 'pending'; sequence: number; pending: PendingWaypoint }

function WaypointColumnHeaders() {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 pb-1.5 mb-1 border-b border-gray-200">
      <span className="w-6 shrink-0" aria-hidden />
      <span className="min-w-[5rem]">ForeFlight</span>
      <span className="w-4 shrink-0" aria-hidden />
      <span>G1000</span>
    </div>
  )
}

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
  const { resetAll: resetAllHints } = useHintsSeen()

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

  if (loading || !plan) {
    return (
      <div className="app-page-shell overflow-auto">
        <div className="app-panel max-w-3xl mx-auto p-6">
          <p className="text-gray-600">
            {loading ? 'Loading...' : 'Flight plan not found.'}
          </p>
        </div>
      </div>
    )
  }

  const pendingWaypoints = plan.pendingWaypoints ?? []
  const showPostCreateBanner =
    pendingWaypoints.length > 1 ||
    (!dismissedSkippedWarning &&
      (!!navState?.message?.trim() || pendingWaypoints.length > 0))

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

  const waypointSplit = Math.ceil(displayList.length / 2)
  const waypointColumns = [
    displayList.slice(0, waypointSplit),
    displayList.slice(waypointSplit),
  ]

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
      const g1000Name = convertWaypointNameToG1000(name)
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

  const isAnchorPlan = isCoordinatorSurveyAnchor(plan)

  return (
    <div className="app-page-shell overflow-auto">
      <div className="app-panel w-full min-h-full p-6 md:p-8">
      {showPostCreateBanner && (
        <div className="mb-4 p-4 bg-cap-yellow/20 border border-cap-yellow rounded-lg flex items-start justify-between gap-3">
          <p className="text-sm text-gray-800 flex-1 min-w-0">
            {navState?.message?.trim() ? `${navState.message.trim()} ` : null}
            {pendingWaypoints.length > 1
              ? `More than one waypoint still needs coordinates. Supply them in the Waypoints list — scroll that panel if a pending row is not in view: ${pendingWaypoints.map((p) => p.code).join(', ')} (e.g. from ForeFlight or AP/1B). `
              : pendingWaypoints.length > 0
                ? `Supply coordinates below for pending waypoints: ${pendingWaypoints.map((p) => p.code).join(', ')} (e.g. from ForeFlight or AP/1B). `
                : null}
            If the waypoint list itself is wrong, use{' '}
            <Link
              to={`/flight-plans/new?edit=${plan.id}`}
              className="text-cap-ultramarine font-medium hover:underline"
            >
              Correct waypoint sequence
            </Link>{' '}
            to edit this plan instead of starting over.
          </p>
          {pendingWaypoints.length <= 1 ? (
          <button
            type="button"
            onClick={() => setDismissedSkippedWarning(true)}
            className="flex-shrink-0 p-1 hover:bg-black/5 rounded"
            aria-label="Dismiss"
          >
            ✕
          </button>
          ) : null}
        </div>
      )}
      {isAnchorPlan && (
        <div className="mb-4 p-4 rounded-lg border border-gray-200 bg-slate-50 text-sm text-gray-800">
          <p>
            This route was loaded for coordinator survey planning. Continue staffing from{' '}
            <strong>Coordinator Console</strong> in the sidebar (Mission Planning).
          </p>
        </div>
      )}
      <div className="flex items-center gap-4 mb-6">
        <Link
          to="/flight-plans"
          className="text-cap-ultramarine hover:underline"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex-1 min-w-0">{plan.name}</h1>
        <button
          type="button"
          onClick={resetAllHints}
          className="px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 flex-shrink-0"
          aria-label="Reset guided tour hints"
        >
          Reset hints
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:items-stretch">
        <div className="space-y-6 min-w-0">
        <section className="p-4 bg-white rounded-lg border border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-3">Details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">Created:</dt>
            <dd>{new Date(plan.dateCreated).toLocaleString()}</dd>
            <dt className="text-gray-500">Modified:</dt>
            <dd>{new Date(plan.dateModified).toLocaleString()}</dd>
            {plan.creationLoadMethod ? (
              <>
                <dt className="text-gray-500">Load method:</dt>
                <dd>{creationLoadMethodLabel(plan.creationLoadMethod)}</dd>
              </>
            ) : null}
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
              <p className="text-gray-600">
                {isAnchorPlan
                  ? 'Not set — choose departures in Coordinator Console.'
                  : 'No airports set'}
              </p>
            )}
          </dl>
        </section>

        <section className="p-4 bg-white rounded-lg border border-gray-200">
          <h3 className="font-semibold text-gray-900">Full flight plan</h3>
          <p className="text-sm text-gray-600 mt-1 mb-3">
            All waypoints in this plan — for G1000 import of the complete route.
            {!departure && isAnchorPlan && (
              <>
                {' '}
                Set departure on a pilot flight plan when crews are ready; coordinator routes use Coordinator Console for airports.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setShowExport(true)}
            disabled={!departure}
            className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
          >
            Export full route (.fpl)
          </button>
          {!departure && isAnchorPlan && (
            <p className="text-xs text-gray-500 mt-2">
              Full-route export needs a departure airport. Use Coordinator Console sortie exports after choosing teams, or
              create a separate pilot flight plan with airports.
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Sortie fragments and ForeFlight content packs are issued from the{' '}
            <strong>Coordinator Console</strong> (Mission Planning in the sidebar). After staffing, email each
            sortie <code className="bg-gray-100 px-0.5 rounded text-xs">.fpl</code> to that aircraft&apos;s
            Mission Pilot.
          </p>
        </section>
        </div>

        <section className="p-4 bg-white rounded-lg border border-gray-200 min-w-0 h-full flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3 shrink-0">
            <h2 className="font-semibold text-gray-900">
              Waypoints ({displayList.length})
            </h2>
            <Link
              to={`/flight-plans/new?edit=${plan.id}`}
              className="px-3 py-1.5 text-sm font-medium text-cap-ultramarine border border-cap-ultramarine/40 rounded-lg hover:bg-cap-ultramarine/5"
            >
              Correct waypoint sequence
            </Link>
          </div>
          {displayList.length === 0 ? (
            <p className="text-gray-500 text-sm">No waypoints</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-4 flex-1 min-h-0 overflow-y-auto">
              {waypointColumns.map((col, colIdx) =>
                col.length === 0 ? null : (
                  <div key={colIdx} className="min-w-0">
                    <WaypointColumnHeaders />
                    <ul className="space-y-1">
                      {col.map((item, j) => {
                        const i = (colIdx === 0 ? 0 : waypointSplit) + j
                        return (
                          <li
                            key={
                              item.type === 'waypoint'
                                ? item.waypoint.id
                                : `pending-${item.pending.code}`
                            }
                            className="text-sm py-1.5"
                          >
                            {item.type === 'waypoint' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-500 w-6 shrink-0">{i + 1}.</span>
                                <span className="min-w-[5rem]">{item.waypoint.originalName}</span>
                                <span className="text-gray-400 w-4 text-center shrink-0">→</span>
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                                  {item.waypoint.g1000Name}
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500 w-6 shrink-0">{i + 1}.</span>
                                  <span className="min-w-[5rem]">{item.pending.code}</span>
                                  <span className="text-gray-400 w-4 text-center shrink-0">→</span>
                                  <span className="px-2 py-0.5 bg-cap-pimento/30 text-cap-pimento rounded text-xs">
                                    {convertWaypointNameToG1000(item.pending.code)}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 pl-8">
                                  Enter degrees and minutes (from ForeFlight)
                                </p>
                                <div className="pl-8 flex items-center gap-2 whitespace-nowrap text-xs">
                                  <span className="text-gray-600">Latitude</span>
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
                                  <span className="text-gray-500">º</span>
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
                                  <span className="text-gray-500">' N</span>
                                  <span className="text-gray-600 ml-1">Longitude</span>
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
                                  <span className="text-gray-500">º</span>
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
                                  <span className="text-gray-500">' W</span>
                                </div>
                                <div className="pl-8">
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
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </div>

      {showExport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <h3 className="font-semibold text-lg mb-4">Export full flight plan</h3>
            <p className="text-gray-600 text-sm mb-4">
              Download the complete G1000 .fpl (all waypoints) for import into your avionics.
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
    </div>
  )
}

