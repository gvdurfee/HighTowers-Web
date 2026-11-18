import { useEffect, useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { generateId } from '@/utils/id'
import type {
  FlightPlanRecord,
  WaypointRecord,
  AirportRecord,
  PendingWaypoint,
  FlightPlanCreationLoadMethod,
} from '@/db/schema'
import { singleAircrewFullRouteFilename } from '@survey-planning/g1000Names.js'
import { G1000Service } from '@/services/g1000'
import { assignG1000WaypointNames } from '@/utils/g1000WaypointName'
import { sortie2Explanation } from '@/services/offsetRouteFpl'
import { downloadSortieFpl } from '@/services/sortieFplExport'
import {
  assessSavedOffsetPlan,
  freshnessForSavedPlan,
  formatOffsetSavedAt,
  RESAVE_IN_MAP_VIEW,
  type SavedOffsetPlan,
} from '@/services/offsetPlanRecord'
import {
  lateralFor,
  oppositeSideSentence,
  sideOfRouteLabel,
  soloSortieDownload,
  soloSortiePanel,
} from '@/services/soloSortieExport'
import { SpurPlanNotice } from '@/components/SpurPlanNotice'
import { offsetSortieFilesHint } from '@/content/spurHints'
import { handledSpurTipIndexes } from '@/services/singleAircrewSpur'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import { routeCurveSide } from '@survey-planning/offsetRoutePlan.js'

function creationLoadMethodLabel(m: FlightPlanCreationLoadMethod): string {
  switch (m) {
    case 'route':
      return 'Load full route'
    case 'sequenceLibrary':
      return 'G1000 user waypoint library'
    case 'coordinatorSurvey':
      return 'Team Dispatch'
    default:
      return 'Waypoint sequence'
  }
}
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'
import { isCoordinatorSurveyAnchor } from '@/utils/coordinatorSurveyPlan'
import { showFullFlightPlanSection, isSingleAircrewPlan } from '@/services/singleAircrewMap'

const HINT_FP_WAYPOINTS = 'flightPlans.detail.waypoints'
const HINT_FP_EXPORT_FULL = 'flightPlans.detail.exportFullRoute'

type LocationState = { skippedWaypoints?: string[]; message?: string } | null

type DisplayItem =
  | { type: 'waypoint'; sequence: number; waypoint: WaypointRecord }
  | { type: 'pending'; sequence: number; pending: PendingWaypoint }

function orderedPlanItems(waypoints: WaypointRecord[], pending: PendingWaypoint[]): DisplayItem[] {
  const displayList: DisplayItem[] = []
  const wpBySeq = new Map(waypoints.map((w) => [w.sequence, w]))
  const pendingBySeq = new Map(pending.map((p) => [p.sequence, p]))
  const allSeqs = [...new Set([...wpBySeq.keys(), ...pendingBySeq.keys()])].sort((a, b) => a - b)
  for (const seq of allSeqs) {
    const wp = wpBySeq.get(seq)
    const pend = pendingBySeq.get(seq)
    if (wp) displayList.push({ type: 'waypoint', sequence: seq, waypoint: wp })
    else if (pend) displayList.push({ type: 'pending', sequence: seq, pending: pend })
  }
  return displayList
}

function g1000NamesFor(items: DisplayItem[]) {
  return assignG1000WaypointNames(
    items.map((item) => ({
      originalName: item.type === 'waypoint' ? item.waypoint.originalName : item.pending.code,
    }))
  )
}

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

type DegMinFields = { latDeg: string; latMin: string; lonDeg: string; lonMin: string }

const emptyDegMin: DegMinFields = { latDeg: '', latMin: '', lonDeg: '', lonMin: '' }

function decimalToDegMin(lat: number, lon: number): DegMinFields {
  const latAbs = Math.abs(lat)
  const lonAbs = Math.abs(lon)
  const latDeg = Math.floor(latAbs)
  const lonDeg = Math.floor(lonAbs)
  return {
    latDeg: String(latDeg),
    latMin: ((latAbs - latDeg) * 60).toFixed(2),
    lonDeg: String(lonDeg),
    lonMin: ((lonAbs - lonDeg) * 60).toFixed(2),
  }
}

function parseDegMinFields(fields: DegMinFields): { latitude: number; longitude: number } | null {
  const latDeg = parseFloat(fields.latDeg)
  const latMin = parseFloat(fields.latMin)
  const lonDeg = parseFloat(fields.lonDeg)
  const lonMin = parseFloat(fields.lonMin)
  if (
    Number.isNaN(latDeg) ||
    Number.isNaN(latMin) ||
    Number.isNaN(lonDeg) ||
    Number.isNaN(lonMin)
  ) {
    return null
  }
  const latitude = latDeg + latMin / 60
  const longitude = -(lonDeg + lonMin / 60)
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

function fieldsComplete(fields: DegMinFields | undefined): boolean {
  if (!fields) return false
  return (
    !!fields.latDeg.trim() &&
    !!fields.latMin.trim() &&
    !!fields.lonDeg.trim() &&
    !!fields.lonMin.trim()
  )
}

function DegMinEditor({
  fields,
  onChange,
}: {
  fields: DegMinFields
  onChange: (field: keyof DegMinFields, value: string) => void
}) {
  return (
    <>
      <p className="text-xs text-gray-500 pl-8">
        Enter degrees and minutes (from ForeFlight)
      </p>
      <div className="pl-8 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-600">Latitude</span>
        <input
          type="text"
          inputMode="numeric"
          value={fields.latDeg}
          onChange={(e) => onChange('latDeg', e.target.value)}
          placeholder="34"
          className="w-12 px-2 py-1 border border-gray-300 rounded text-xs text-center"
        />
        <span className="text-gray-500">º</span>
        <input
          type="text"
          inputMode="decimal"
          value={fields.latMin}
          onChange={(e) => onChange('latMin', e.target.value)}
          placeholder="48.50"
          className="w-14 px-2 py-1 border border-gray-300 rounded text-xs text-center"
        />
        <span className="text-gray-500">' N</span>
        <span className="text-gray-600 ml-1">Longitude</span>
        <input
          type="text"
          inputMode="numeric"
          value={fields.lonDeg}
          onChange={(e) => onChange('lonDeg', e.target.value)}
          placeholder="106"
          className="w-12 px-2 py-1 border border-gray-300 rounded text-xs text-center"
        />
        <span className="text-gray-500">º</span>
        <input
          type="text"
          inputMode="decimal"
          value={fields.lonMin}
          onChange={(e) => onChange('lonMin', e.target.value)}
          placeholder="33.00"
          className="w-14 px-2 py-1 border border-gray-300 rounded text-xs text-center"
        />
        <span className="text-gray-500">' W</span>
      </div>
    </>
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
  const [coordsByPending, setCoordsByPending] = useState<Record<string, DegMinFields>>({})
  const [supplyingCode, setSupplyingCode] = useState<string | null>(null)
  const [editingWaypointId, setEditingWaypointId] = useState<string | null>(null)
  const [savedOffset, setSavedOffset] = useState<SavedOffsetPlan | undefined>(undefined)
  const [sortieDownloadNote, setSortieDownloadNote] = useState<string | null>(null)
  const { isSeen, markSeen, resetAll: resetAllHints } = useHintsSeen()
  const savedTeamPlan = useLiveQuery(
    async () => {
      if (!id) return null
      return (await db.teamPlans.get(id)) ?? null
    },
    [id]
  )

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
          setSavedOffset(await db.offsetPlans.get(id))
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
    const items = orderedPlanItems(waypoints, plan.pendingWaypoints ?? [])
    const named = g1000NamesFor(items)
    if (named.error) return
    const nameById = new Map<string, string>()
    items.forEach((item, index) => {
      if (item.type === 'waypoint') nameById.set(item.waypoint.id, named.names[index].g1000Name)
    })
    const xml = G1000Service.generateFlightPlan({
      ...plan,
      departureAirport: dep,
      destinationAirport: dest,
      waypoints: waypoints.map((w) => ({
        id: w.id,
        originalName: w.originalName,
        g1000Name: nameById.get(w.id) ?? '',
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
    a.download = singleAircrewFullRouteFilename(
      departure?.identifier ?? 'UNK',
      plan.name,
      destination?.identifier ?? 'UNK'
    )
    a.click()
    URL.revokeObjectURL(url)
    setShowExport(false)
  }

  async function saveSortie1Side(side: 'inner' | 'outer') {
    if (!plan) return
    const dateModified = new Date().toISOString()
    await db.flightPlans.update(plan.id, { sortie1Side: side, dateModified })
    setPlan({ ...plan, sortie1Side: side, dateModified })
  }

  function downloadSoloSortie(sortieNumber: 1 | 2) {
    if (!plan || (plan.sortie1Side !== 'inner' && plan.sortie1Side !== 'outer') || !savedOffset) return
    const decision = assessSavedOffsetPlan(savedOffset, offsetFreshness)
    if (decision.status !== 'match') return
    if (!departure || !destination) return
    const file = soloSortieDownload({
      routeLabel: plan.name,
      sortieNumber,
      sortie1Side: plan.sortie1Side,
      plan: decision.plan,
      departure,
      destination,
      singleAircrew: savedTeamPlan !== undefined && isSingleAircrewPlan(plan, savedTeamPlan),
      centerline: [...waypoints]
        .sort((a, b) => a.sequence - b.sequence)
        .map((waypoint) => ({
          lat: waypoint.latitude,
          lon: waypoint.longitude,
          originalName: waypoint.originalName,
          ptIdent: waypoint.g1000Name,
        })),
    })
    downloadSortieFpl(file.xml, file.filename)
    setSortieDownloadNote(`Downloaded ${file.filename}.`)
  }

  const setCoordForPending = (
    code: string,
    field: keyof DegMinFields,
    value: string
  ) => {
    setCoordsByPending((prev) => ({
      ...prev,
      [code]: {
        ...(prev[code] ?? emptyDegMin),
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
  const displayList = orderedPlanItems(waypoints, pendingWaypoints)
  const g1000Named = g1000NamesFor(displayList)
  const g1000Names = g1000Named.names
  const g1000NameError = g1000Named.error

  const waypointSplit = Math.ceil(displayList.length / 2)
  const waypointColumns = [
    displayList.slice(0, waypointSplit),
    displayList.slice(waypointSplit),
  ]

  const beginEditWaypoint = (wp: WaypointRecord) => {
    setEditingWaypointId(wp.id)
    setCoordsByPending((prev) => ({
      ...prev,
      [wp.id]: decimalToDegMin(wp.latitude, wp.longitude),
    }))
  }

  const cancelEditWaypoint = (id: string) => {
    setEditingWaypointId(null)
    setCoordsByPending((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const saveWaypointCoordinates = async (wp: WaypointRecord) => {
    if (!plan) return
    const parsed = parseDegMinFields(coordsByPending[wp.id] ?? emptyDegMin)
    if (!parsed) return
    setSupplyingCode(wp.id)
    try {
      await db.waypoints.update(wp.id, {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      })
      await db.flightPlans.update(plan.id, { dateModified: new Date().toISOString() })
      const updated = await db.flightPlans.get(plan.id)
      if (updated) setPlan(updated)
      const wps = await db.waypoints
        .where('flightPlanId')
        .equals(plan.id)
        .sortBy('sequence')
      setWaypoints(wps)
      cancelEditWaypoint(wp.id)
    } finally {
      setSupplyingCode(null)
    }
  }

  const supplyCoordinates = async (code: string, sequence: number) => {
    if (!plan) return
    const parsed = parseDegMinFields(coordsByPending[code] ?? emptyDegMin)
    if (!parsed) return
    const { latitude, longitude } = parsed
    setSupplyingCode(code)
    try {
      const name = code.trim().toUpperCase()
      const named = assignG1000WaypointNames([{ originalName: name }])
      const g1000Name = named.names[0]?.g1000Name ?? ''
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
  const orderedWaypoints = [...waypoints].sort((a, b) => a.sequence - b.sequence)
  const offsetFreshness = freshnessForSavedPlan({
    waypoints: orderedWaypoints.map((waypoint) => ({
      originalName: waypoint.originalName,
      lat: waypoint.latitude,
      lon: waypoint.longitude,
    })),
    saved: savedOffset,
    sortie1Side: plan.sortie1Side,
    departureIdent: departure?.identifier ?? null,
    destinationIdent: destination?.identifier ?? null,
  })
  const sortieCurve = routeCurveSide(
    [...waypoints]
      .sort((a, b) => a.sequence - b.sequence)
      .map((waypoint) => ({
        lat: waypoint.latitude,
        lon: waypoint.longitude,
        ptIdent:
          parseWaypointCode(waypoint.originalName)?.waypointLetter ??
          waypoint.g1000Name ??
          waypoint.originalName,
      }))
  )
  const sortiePanel = soloSortiePanel({
    isAnchorPlan,
    saved: savedOffset,
    freshness: offsetFreshness,
    sortie1Side: plan.sortie1Side,
    curve: { innerSide: sortieCurve.innerSide, outerSide: sortieCurve.outerSide },
    departureIdent: departure?.identifier ?? null,
    destinationIdent: destination?.identifier ?? null,
    singleAircrew: savedTeamPlan !== undefined && isSingleAircrewPlan(plan, savedTeamPlan),
    centerline: [...waypoints]
      .sort((a, b) => a.sequence - b.sequence)
      .map((waypoint) => ({
        lat: waypoint.latitude,
        lon: waypoint.longitude,
        originalName: waypoint.originalName,
        ptIdent: waypoint.g1000Name,
      })),
  })
  const teamKnown = savedTeamPlan !== undefined
  const singleAircrew = teamKnown && isSingleAircrewPlan(plan, savedTeamPlan)
  const spurCenterline = orderedWaypoints.map((waypoint) => ({
    ptIdent:
      parseWaypointCode(waypoint.originalName)?.waypointLetter ??
      waypoint.g1000Name ??
      waypoint.originalName,
    originalName: waypoint.originalName,
    lat: waypoint.latitude,
    lon: waypoint.longitude,
  }))
  const hasSingleAircrewSpur = singleAircrew && handledSpurTipIndexes(spurCenterline).length > 0
  const spurWidths = savedOffset
    ? savedOffset.widths.map((width, index) => {
        const track = savedOffset.trackOffsets?.[index]
        return {
          leftNm: width.leftNm,
          rightNm: width.rightNm,
          trackLeftNm: track?.leftMode === 'explicit' ? track.leftNm : null,
          trackRightNm: track?.rightMode === 'explicit' ? track.rightNm : null,
        }
      })
    : null
  const innerChoice = sideOfRouteLabel('inner', lateralFor('inner', sortieCurve))
  const outerChoice = sideOfRouteLabel('outer', lateralFor('outer', sortieCurve))

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
            <strong>Team Dispatch</strong> in the sidebar (Mission Planning).
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

      <div className="grid gap-6 lg:grid-cols-[minmax(16rem,18rem)_minmax(0,1fr)] xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:items-stretch">
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
                  ? 'Not set — choose departures in Team Dispatch.'
                  : 'No airports set'}
              </p>
            )}
          </dl>
        </section>

        <section
          className={`p-4 bg-white rounded-lg border ${plan.sortie1Side ? 'border-gray-200' : 'border-cap-yellow'}`}
        >
          <fieldset>
            <legend className="font-semibold text-gray-900 mb-2">Choose the side flown first</legend>
            <p className="text-sm text-gray-700 mb-3">
              This is the side for Sortie 1. {oppositeSideSentence(plan.sortie1Side, sortieCurve)}
            </p>
            {!plan.sortie1Side && (
              <p className="text-sm text-gray-800 mb-3">Choose a side before downloading a sortie file.</p>
            )}
            <div className="flex flex-col gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="sortie1Side"
                  className="accent-cap-ultramarine"
                  checked={plan.sortie1Side === 'inner'}
                  onChange={() => void saveSortie1Side('inner')}
                />
                {innerChoice}
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="sortie1Side"
                  className="accent-cap-ultramarine"
                  checked={plan.sortie1Side === 'outer'}
                  onChange={() => void saveSortie1Side('outer')}
                />
                {outerChoice}
              </label>
            </div>
          </fieldset>
          {waypoints.length >= 2 && sortieCurve.note && (
            <p className="text-sm text-gray-700 mt-2">{sortieCurve.note}</p>
          )}
          <p className="text-sm text-cap-ultramarine mt-2">{sortie2Explanation(departure?.identifier)}</p>
        </section>

        {sortiePanel.status !== 'hidden' && (
          <section className="p-4 bg-white rounded-lg border border-gray-200" aria-labelledby="offset-sortie-files">
            <h2 id="offset-sortie-files" className="font-semibold text-gray-900">Offset sortie files</h2>
            <p className="text-sm text-gray-600 mt-1 mb-3">
              {offsetSortieFilesHint(hasSingleAircrewSpur)}
            </p>
            {sortiePanel.status === 'none' && (
              <p className="text-sm text-gray-800">
                Map View has not saved an offset plan for this route.{' '}
                <Link to="/map" className="text-cap-ultramarine font-medium hover:underline">
                  Open Map View
                </Link>{' '}
                and save the offset plan. Downloads stay off until that geometry is saved.
              </p>
            )}
            {sortiePanel.status === 'stale' && (
              <p className="text-sm text-gray-800">
                {RESAVE_IN_MAP_VIEW}{' '}
                {sortiePanel.reason === 'sequence'
                  ? 'The saved offset plan is for a different waypoint list'
                  : 'The saved coordinates do not match the current corridor, track offset, and airports'}
                {sortiePanel.savedAt ? ` (saved ${formatOffsetSavedAt(sortiePanel.savedAt)})` : ''}.{' '}
                <Link to="/map" className="text-cap-ultramarine font-medium hover:underline">
                  Open Map View
                </Link>
              </p>
            )}
            {sortiePanel.status === 'choose-side' && (
              <p className="text-sm text-gray-800">
                Choose the side flown first. Both downloads stay off until you choose a side.
              </p>
            )}
            {sortiePanel.status !== 'none' && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {sortiePanel.cards.map((card) => (
                  <article key={card.sortieNumber} className="rounded-lg border border-gray-200 p-3">
                    <h3 className="font-medium text-gray-900">Sortie {card.sortieNumber}</h3>
                    <p className="text-sm text-gray-800 mt-1">{card.label}</p>
                    {card.fromIdent && card.toIdent ? (
                      <p className="text-sm text-gray-700 mt-1">
                        {card.fromIdent} → {card.toIdent}
                      </p>
                    ) : null}
                    {card.order.length > 0 ? (
                      <p className="text-sm text-gray-700 mt-1">
                        <span className="text-gray-500">Waypoint order: </span>
                        {card.order.join(' → ')}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="mt-3 px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
                      disabled={!card.enabled}
                      onClick={() => downloadSoloSortie(card.sortieNumber)}
                    >
                      {`Download Sortie ${card.sortieNumber}${sortiePanel.status === 'ready' ? ` (${card.role})` : ''} (.fpl)`}
                    </button>
                    {!card.enabled && card.disabledReason ? (
                      <p className="text-sm text-gray-700 mt-2">{card.disabledReason}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
            {sortieDownloadNote ? (
              <p className="text-sm text-gray-800 mt-3" role="status">
                {sortieDownloadNote}
              </p>
            ) : null}
          </section>
        )}

        <SpurPlanNotice
          teamKnown={teamKnown}
          singleAircrew={singleAircrew}
          isAnchorPlan={isAnchorPlan}
          waypoints={spurCenterline}
          legWidths={spurWidths}
          sortie1Side={plan.sortie1Side === 'inner' || plan.sortie1Side === 'outer' ? plan.sortie1Side : null}
        />

        {showFullFlightPlanSection(plan, savedTeamPlan) && (
        <section className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900">Full flight plan</h3>
            <GuidedHint
              hintId={HINT_FP_EXPORT_FULL}
              stepNumber={6}
              title="Export full route"
              body={
                <>
                  <strong>Export full route</strong> downloads the complete G1000{' '}
                  <code className="bg-gray-100 px-0.5 rounded text-xs">.fpl</code> — every waypoint
                  in the plan. Follow the G1000 Pilot&apos;s Guide for importing user flight plans from
                  the SD card. Eject the card before you remove it from the reader so the file is not
                  corrupted.
                </>
              }
              isSeen={isSeen(HINT_FP_EXPORT_FULL)}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
          <p className="text-sm text-gray-600 mt-1 mb-3">
            All waypoints in this plan — for G1000 import of the complete route.
            {!departure && isAnchorPlan && (
              <>
                {' '}
                Set departure on a pilot flight plan when crews are ready; coordinator routes use Team Dispatch for airports.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setShowExport(true)}
            disabled={!departure || Boolean(g1000NameError)}
            className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
          >
            Export full route (.fpl)
          </button>
          {g1000NameError ? (
            <p className="text-sm text-cap-pimento mt-2">{g1000NameError}</p>
          ) : null}
          {!departure && isAnchorPlan && (
            <p className="text-xs text-gray-500 mt-2">
              Full-route export needs a departure airport. Use Team Dispatch sortie exports after choosing teams, or
              create a separate pilot flight plan with airports.
            </p>
          )}
          {isAnchorPlan ? (
            <p className="text-xs text-gray-500 mt-2">
              Sortie fragments and ForeFlight content packs are issued from the{' '}
              <strong>Team Dispatch</strong> (Mission Planning in the sidebar). After staffing, email each
              sortie <code className="bg-gray-100 px-0.5 rounded text-xs">.fpl</code> to that aircraft&apos;s
              Mission Pilot.
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-2">
              Email each sortie <code className="bg-gray-100 px-0.5 rounded text-xs">.fpl</code> to that
              aircraft&apos;s Mission Pilot.
            </p>
          )}
        </section>
        )}
        </div>

        <section className="p-4 bg-white rounded-lg border border-gray-200 min-w-0 h-full flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-semibold text-gray-900">
                Waypoints ({displayList.length})
              </h2>
              <GuidedHint
                hintId={HINT_FP_WAYPOINTS}
                stepNumber={5}
                title="ForeFlight and G1000 names"
                body={
                  <>
                    This list shows ForeFlight-style names beside G1000 names so you can cross-check
                    the chart and the navigator. If the ForeFlight plan starts with a blend-in (for
                    example Golf, Sierra Romeo 214 Hotel, Golf) that is missing here, do not delete
                    the plan and start over. Use <strong>Correct waypoint sequence</strong>.
                  </>
                }
                isSeen={isSeen(HINT_FP_WAYPOINTS)}
                onDismiss={markSeen}
                surface="light"
              />
            </div>
            <Link
              to={`/flight-plans/new?edit=${plan.id}`}
              className="px-3 py-1.5 text-sm font-medium text-cap-ultramarine border border-cap-ultramarine/40 rounded-lg hover:bg-cap-ultramarine/5"
            >
              Correct waypoint sequence
            </Link>
          </div>
          {g1000NameError ? (
            <p className="text-sm text-cap-pimento mb-3">{g1000NameError}</p>
          ) : null}
          {displayList.length === 0 ? (
            <p className="text-gray-500 text-sm">No waypoints</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-4 flex-1 min-h-0 overflow-y-auto">
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
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-gray-500 w-6 shrink-0">{i + 1}.</span>
                                  <span className="min-w-[5rem]">{item.waypoint.originalName}</span>
                                  <span className="text-gray-400 w-4 text-center shrink-0">→</span>
                                  <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                                    {g1000NameError ? '—' : g1000Names[i]?.g1000Name}
                                  </span>
                                  {editingWaypointId !== item.waypoint.id ? (
                                    <button
                                      type="button"
                                      onClick={() => beginEditWaypoint(item.waypoint)}
                                      className="ml-1 px-2 py-0.5 text-xs font-medium text-cap-ultramarine border border-cap-ultramarine/40 rounded hover:bg-cap-ultramarine/5 shrink-0"
                                    >
                                      Edit coordinates
                                    </button>
                                  ) : null}
                                </div>
                                {editingWaypointId === item.waypoint.id ? (
                                  <>
                                    <DegMinEditor
                                      fields={coordsByPending[item.waypoint.id] ?? emptyDegMin}
                                      onChange={(field, value) =>
                                        setCoordForPending(item.waypoint.id, field, value)
                                      }
                                    />
                                    <div className="pl-8 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => saveWaypointCoordinates(item.waypoint)}
                                        disabled={
                                          supplyingCode === item.waypoint.id ||
                                          !fieldsComplete(coordsByPending[item.waypoint.id])
                                        }
                                        className="px-3 py-1 bg-cap-ultramarine text-white rounded text-xs font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
                                      >
                                        {supplyingCode === item.waypoint.id ? '...' : 'Save coordinates'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => cancelEditWaypoint(item.waypoint.id)}
                                        disabled={supplyingCode === item.waypoint.id}
                                        className="px-3 py-1 border border-gray-300 rounded text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-gray-500 w-6 shrink-0">{i + 1}.</span>
                                  <span className="min-w-[5rem]">{item.pending.code}</span>
                                  <span className="text-gray-400 w-4 text-center shrink-0">→</span>
                                  <span className="px-2 py-0.5 bg-cap-pimento/30 text-cap-pimento rounded text-xs">
                                    {g1000NameError ? '—' : g1000Names[i]?.g1000Name}
                                  </span>
                                </div>
                                <DegMinEditor
                                  fields={coordsByPending[item.pending.code] ?? emptyDegMin}
                                  onChange={(field, value) =>
                                    setCoordForPending(item.pending.code, field, value)
                                  }
                                />
                                <div className="pl-8">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      supplyCoordinates(item.pending.code, item.sequence)
                                    }
                                    disabled={
                                      supplyingCode === item.pending.code ||
                                      !fieldsComplete(coordsByPending[item.pending.code])
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

