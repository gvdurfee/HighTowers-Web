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
    default:
      return 'Waypoint sequence'
  }
}
import { G1000Service } from '@/services/g1000'
import { convertWaypointNameToG1000 } from '@/utils/g1000WaypointName'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import {
  buildManualSortieFromPtIdents,
  exportSortieFplDownload,
  parseOffsetsInput,
  type SortieFplPilotBrief,
} from '@/services/sortieFplExport'
import { SortiePilotCard } from '@/components/SortiePilotCard'
import { FlightPlanContentPackCard } from '@/components/FlightPlanContentPackCard'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'

const HINT_FP_SORTIE_EXPORT = 'flightPlan.sortieExport'

type LocationState = { skippedWaypoints?: string[]; message?: string } | null

type DisplayItem =
  | { type: 'waypoint'; sequence: number; waypoint: WaypointRecord }
  | { type: 'pending'; sequence: number; pending: PendingWaypoint }

function waypointPtIdent(originalName: string): string {
  const parsed = parseWaypointCode(originalName)
  return parsed?.waypointLetter ?? originalName
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
  const [showSortieExport, setShowSortieExport] = useState(false)
  const [sortieFromPt, setSortieFromPt] = useState('')
  const [sortieToPt, setSortieToPt] = useState('')
  const [sortieStartAt, setSortieStartAt] = useState('')
  const [sortieOffsets, setSortieOffsets] = useState('3, 9, 15, 21')
  const [sortieExportErr, setSortieExportErr] = useState<string | null>(null)
  const [pilotBrief, setPilotBrief] = useState<SortieFplPilotBrief | null>(null)
  const [coordsByPending, setCoordsByPending] = useState<
    Record<string, { latDeg: string; latMin: string; lonDeg: string; lonMin: string }>
  >({})
  const [supplyingCode, setSupplyingCode] = useState<string | null>(null)
  const { isSeen, markSeen, resetAll: resetAllHints } = useHintsSeen()

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
    !dismissedSkippedWarning &&
    (!!navState?.message?.trim() || pendingWaypoints.length > 0)

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

  const waypointPtIdents = waypoints.map((w) => waypointPtIdent(w.originalName))
  const sortieEndpointOptions = (() => {
    if (!sortieFromPt || !sortieToPt) return [] as string[]
    const lo = waypointPtIdents.indexOf(sortieFromPt)
    const hi = waypointPtIdents.indexOf(sortieToPt)
    if (lo < 0 || hi < 0 || lo === hi) return []
    const a = waypointPtIdents[Math.min(lo, hi)]
    const b = waypointPtIdents[Math.max(lo, hi)]
    return [a, b]
  })()

  const handleSortieExport = () => {
    if (!departure) {
      setSortieExportErr('Set a departure airport on this flight plan first.')
      return
    }
    setSortieExportErr(null)
    try {
      const offsets = parseOffsetsInput(sortieOffsets)
      const sortie = buildManualSortieFromPtIdents({
        waypoints,
        fromPt: sortieFromPt,
        toPt: sortieToPt,
        startAt: sortieStartAt,
        offsets,
        teamDeparture: departure,
        routeLabel: plan.name.replace(/\s+/g, ''),
      })
      const brief = exportSortieFplDownload({
        waypoints,
        sortie,
        teamDeparture: departure,
        routeLabel: plan.name.replace(/\s+/g, ''),
        teamLabel: departure.identifier,
        side: 'manual fragment',
      })
      setPilotBrief(brief)
      setShowSortieExport(false)
    } catch (e) {
      setSortieExportErr(e instanceof Error ? e.message : 'Failed to export sortie .fpl')
    }
  }

  const toggleSortieExport = () => {
    setShowSortieExport((v) => !v)
    setSortieExportErr(null)
    if (!sortieFromPt && waypointPtIdents.length >= 2) {
      setSortieFromPt(waypointPtIdents[0])
      setSortieToPt(waypointPtIdents[waypointPtIdents.length - 1])
      setSortieStartAt(waypointPtIdents[0])
    }
  }

  return (
    <div className="app-page-shell overflow-auto">
      {pilotBrief && (
        <SortiePilotCard brief={pilotBrief} isOpen onClose={() => setPilotBrief(null)} />
      )}
      <div className="app-panel max-w-3xl mx-auto p-6 md:p-8">
      {showPostCreateBanner && (
        <div className="mb-4 p-4 bg-cap-yellow/20 border border-cap-yellow rounded-lg flex items-start justify-between gap-3">
          <div className="text-sm text-gray-800 space-y-2">
            {navState?.message?.trim() ? <p>{navState.message}</p> : null}
            {pendingWaypoints.length > 0 ? (
              <p>
                Supply coordinates below for pending waypoints:{' '}
                {pendingWaypoints.map((p) => p.code).join(', ')} (e.g. from ForeFlight or AP/1B).
              </p>
            ) : null}
          </div>
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
        <h1 className="text-2xl font-bold text-gray-900 flex-1 min-w-0">{plan.name}</h1>
        <Link
          to={`/coordinator/survey?plan=${plan.id}`}
          className="px-3 py-1.5 text-sm font-medium text-cap-ultramarine border border-cap-ultramarine/40 rounded-lg hover:bg-cap-ultramarine/5 flex-shrink-0"
        >
          Survey planner
        </Link>
        <button
          type="button"
          onClick={resetAllHints}
          className="px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 flex-shrink-0"
          aria-label="Reset guided tour hints"
        >
          Reset hints
        </button>
      </div>

      <div className="space-y-6">
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
            <>
              {/* Column headers illustrate the ForeFlight → G1000 name translation. */}
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 pb-1.5 mb-1 border-b border-gray-200">
                <span className="w-6" aria-hidden />
                <span className="min-w-[5rem]">ForeFlight</span>
                <span className="w-4" aria-hidden />
                <span>G1000</span>
              </div>
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
                      <span className="min-w-[5rem]">{item.waypoint.originalName}</span>
                      <span className="text-gray-400 w-4 text-center">→</span>
                      <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                        {item.waypoint.g1000Name}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-[5rem]">{item.pending.code}</span>
                      <span className="text-gray-400 w-4 text-center">→</span>
                      <span className="px-2 py-0.5 bg-cap-pimento/30 text-cap-pimento rounded text-xs">
                        {convertWaypointNameToG1000(item.pending.code)}
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
            </>
          )}
        </section>

        <FlightPlanContentPackCard waypoints={waypoints} />

        {waypoints.length >= 2 && (
          <section className="p-4 bg-white rounded-lg border border-gray-200">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={toggleSortieExport}
                className="flex-1 min-w-0 text-left"
                aria-expanded={showSortieExport}
              >
                <span className="font-semibold text-gray-900 block">Export sortie fragment (.fpl)</span>
                {!showSortieExport && (
                  <span className="text-gray-500 text-sm font-normal mt-0.5 block">
                    One sortie&apos;s serpentine legs — not the full plan
                  </span>
                )}
              </button>
              <GuidedHint
                hintId={HINT_FP_SORTIE_EXPORT}
                stepNumber={2}
                title="Sortie fragment vs full route"
                body={
                  <>
                    Use <strong>Export sortie .fpl</strong> here for one coordinator sortie: a serpentine
                    sub-route between your From/To waypoints with parallel-track offsets. Use{' '}
                    <strong>Export full route (.fpl)</strong> below when you need every waypoint in this
                    plan. Copy the file to the SD card root, eject before removing the card, then import on
                    the G1000.
                  </>
                }
                isSeen={isSeen(HINT_FP_SORTIE_EXPORT)}
                onDismiss={markSeen}
                surface="light"
              />
              <button
                type="button"
                onClick={toggleSortieExport}
                className="text-gray-500 text-sm font-normal shrink-0 px-1 py-0.5 hover:bg-gray-100 rounded"
                aria-label={showSortieExport ? 'Collapse sortie export' : 'Expand sortie export'}
              >
                {showSortieExport ? '−' : '+'}
              </button>
            </div>
            {showSortieExport && (
              <div className="mt-4 space-y-3 text-sm">
                <p className="text-gray-600">
                  Build a serpentine G1000 route for one coordinator sortie: team departure, waypoint
                  sub-range, and parallel-track offsets. Uses plan departure (
                  {departure?.identifier ?? 'not set'}) for ferry legs.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-gray-700 font-medium">From</span>
                    <select
                      value={sortieFromPt}
                      onChange={(e) => {
                        setSortieFromPt(e.target.value)
                        setSortieStartAt(e.target.value)
                      }}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Select…</option>
                      {waypointPtIdents.map((pt) => (
                        <option key={`from-${pt}`} value={pt}>
                          {pt}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-gray-700 font-medium">To</span>
                    <select
                      value={sortieToPt}
                      onChange={(e) => setSortieToPt(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Select…</option>
                      {waypointPtIdents.map((pt) => (
                        <option key={`to-${pt}`} value={pt}>
                          {pt}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-gray-700 font-medium">Start at (first leg)</span>
                  <select
                    value={sortieStartAt}
                    onChange={(e) => setSortieStartAt(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Select…</option>
                    {sortieEndpointOptions.map((pt) => (
                      <option key={`start-${pt}`} value={pt}>
                        {pt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-gray-700 font-medium">Offsets (NM)</span>
                  <input
                    type="text"
                    value={sortieOffsets}
                    onChange={(e) => setSortieOffsets(e.target.value)}
                    placeholder="3, 9, 15, 21"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono"
                  />
                </label>
                {sortieExportErr && (
                  <p className="text-red-700" role="alert">
                    {sortieExportErr}
                  </p>
                )}
                <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
                  <strong className="font-medium text-gray-700">Sortie only</strong> — serpentine sub-route
                  for the From/To range above. For{' '}
                  <strong className="font-medium text-gray-700">every waypoint in this plan</strong>, use{' '}
                  <strong className="font-medium text-gray-700">Export full route (.fpl)</strong> below.
                </p>
                <button
                  type="button"
                  onClick={handleSortieExport}
                  className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90"
                >
                  Export sortie .fpl
                </button>
              </div>
            )}
          </section>
        )}

        <section className="p-4 bg-white rounded-lg border border-gray-200">
          <h3 className="font-semibold text-gray-900">Full flight plan</h3>
          <p className="text-sm text-gray-600 mt-1 mb-3">
            All waypoints in this plan — for G1000 import of the complete route.
          </p>
          <button
            type="button"
            onClick={() => setShowExport(true)}
            className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90"
          >
            Export full route (.fpl)
          </button>
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

