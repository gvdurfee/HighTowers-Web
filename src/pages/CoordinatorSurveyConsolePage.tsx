import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import { fetchMtrWidthTexts } from '@/services/surveyPlanningApi'
import { apiService, type AirportResult } from '@/services/api'
import {
  planSurveyScenario,
  planSingleTeamBothSides,
  planThreeTeamGeographicScenario,
  compareOneVsTwoTeamStaffing,
  compareTwoVsThreeTeamStaffing,
} from '@survey-planning/surveySortiePlanner.js'
import {
  GuidedHintDismissActions,
  GuidedHintTriggerFace,
  guidedHintTriggerClassName,
} from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'

const HINT_COORD_QUICK_REF = 'coordinatorSurvey.quickReference'

/** Match NewFlightPlanPage airport identifier fields. */
const AIRPORT_CODE_INPUT_CLASS =
  'flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent'
const AIRPORT_LOOKUP_BTN_CLASS =
  'px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 whitespace-nowrap shrink-0 focus:outline-none focus:ring-2 focus:ring-cap-ultramarine focus:ring-offset-2'
const AIRPORT_LOOKUP_BTN_IDLE_CLASS = 'opacity-50 cursor-not-allowed'
const AIRPORT_LOOKUP_RESULT_CLASS = 'text-sm text-green-700 mt-1.5 font-medium'

function onAirportCodeInputKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  lookupBtn: HTMLButtonElement | null,
  runLookup: () => void,
  canLookup: boolean
) {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (canLookup) runLookup()
    return
  }
  // Grid layout can skip adjacent buttons in tab order; always visit Look up after the code field.
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    lookupBtn?.focus()
  }
}

function waypointPtIdent(originalName: string): string {
  const parsed = parseWaypointCode(originalName)
  return parsed?.waypointLetter ?? originalName
}

type TeamCount = 1 | 2 | 3

function formatSurveySide(side: string) {
  if (side === 'both') return 'both sides'
  if (side === 'left') return 'inner'
  if (side === 'right') return 'outer'
  return side
}

type RunMode = 'single' | 'compare-1-2' | 'compare-2-3'

type PlannerResult =
  | ReturnType<typeof planSurveyScenario>
  | ReturnType<typeof planThreeTeamGeographicScenario>

type SurveyTeamInput = {
  label: string
  depLat: number
  depLon: number
  side: 'left' | 'right'
}
type Compare12Result = ReturnType<typeof compareOneVsTwoTeamStaffing>
type Compare23Result = ReturnType<typeof compareTwoVsThreeTeamStaffing>
type CompareBundle =
  | { kind: '1-2'; data: Compare12Result }
  | { kind: '2-3'; data: Compare23Result }

function CoordinatorConsoleGuide() {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const { isSeen, markSeen } = useHintsSeen()
  const seen = isSeen(HINT_COORD_QUICK_REF)

  const closeGuide = () => {
    if (detailsRef.current) detailsRef.current.open = false
  }

  return (
    <details
      ref={detailsRef}
      className="mb-6 rounded-xl border border-cap-ultramarine/30 bg-slate-50 open:shadow-sm group"
    >
      <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-cap-ultramarine flex items-center justify-between gap-2">
        <span>Coordinator quick reference &amp; symbology</span>
        <span className={guidedHintTriggerClassName('light', false)}>
          <GuidedHintTriggerFace
            stepNumber={1}
            isSeen={seen}
            title="Coordinator quick reference and symbology"
          />
        </span>
      </summary>
      <div className="px-5 pb-5 text-sm text-gray-800 space-y-5 border-t border-cap-ultramarine/15 pt-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">What this console does</h3>
          <p>
            Wing-level <strong>what-if</strong> planning for Low Level Route tower surveys: given NASR corridor
            width, waypoint geometry, departure airports, and a per-sortie NM budget, estimate sortie count and
            waypoint ranges. Crews still fly corridors in ForeFlight Military Flight Bag.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Planner modes</h3>
          <ul className="space-y-2 list-disc pl-5">
            <li>
              <strong>Single — 1 team:</strong> one aircraft, full corridor, inner then outer passes sequentially.
            </li>
            <li>
              <strong>Single — 2 teams:</strong> parallel staffing — Team 1 inner, Team 2 outer, same geography.
            </li>
            <li>
              <strong>Single — 3 teams:</strong> geographic split — three route segments; each team flies both sides of
              its segment from its own base (summer weather / shorter sorties).
            </li>
            <li>
              <strong>Compare 1 vs 2:</strong> full corridor with one aircraft vs opposite-side parallel staffing.
            </li>
            <li>
              <strong>Compare 2 vs 3:</strong> opposite-side vs geographic split (both full corridor).
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Symbology</h3>
          <table className="min-w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
            <tbody>
              <tr className="border-b border-gray-200 bg-white">
                <th className="py-2 px-3 text-left font-semibold text-gray-700 w-36">Inner / Outer</th>
                <td className="py-2 px-3">
                  Left and right of MTR centerline. On asymmetric spans (e.g. VR114 B→M1: 10 NM inner / 20 NM outer),
                  offset lists differ by side.
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-3 text-left font-semibold text-gray-700">Offsets (e.g. 3, 9)</th>
                <td className="py-2 px-3 font-mono">
                  G1000 parallel-track spacing (NM). Default wing policy: 3 → 9 → 15 → 21 for a 20 NM half-width.
                </td>
              </tr>
              <tr className="border-b border-gray-200 bg-white">
                <th className="py-2 px-3 text-left font-semibold text-gray-700">Sortie budget</th>
                <td className="py-2 px-3">
                  Max NM per sortie (typically 400–500). ~500 NM ≈ 4.5–5 hr with reserve; use for summer morning vs
                  afternoon planning.
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-3 text-left font-semibold text-gray-700">Ferry in / out</th>
                <td className="py-2 px-3">Departure airport ↔ route entry or exit for that sortie.</td>
              </tr>
              <tr className="border-b border-gray-200 bg-white">
                <th className="py-2 px-3 text-left font-semibold text-gray-700">Along route</th>
                <td className="py-2 px-3">
                  Offset legs on the assigned waypoint chain (one directed leg per offset in the sortie).
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-3 text-left font-semibold text-gray-700">⚠ in Total</th>
                <td className="py-2 px-3">Sortie exceeds the NM budget — consider smaller segment or more teams.</td>
              </tr>
              <tr>
                <th className="py-2 px-3 text-left font-semibold text-gray-700">Geographic split</th>
                <td className="py-2 px-3">
                  Boundaries at shared waypoints; optimizer picks segment cuts and which airport serves which segment
                  (fewest sorties, then NM).
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-sm font-bold text-cap-pimento">
          Wing planning aid only. Verify corridors and procedures in ForeFlight Military Flight Bag before flying.
        </p>

        <GuidedHintDismissActions
          className="pt-2"
          onNotNow={closeGuide}
          onGotIt={() => {
            markSeen(HINT_COORD_QUICK_REF)
            closeGuide()
          }}
        />
      </div>
    </details>
  )
}

function SurveyPlannerResults({
  title,
  result,
}: {
  title?: string
  result: PlannerResult
}) {
  return (
    <div className={title ? 'mb-8 last:mb-0' : ''}>
      {title && <h3 className="text-base font-semibold text-gray-900 mb-3">{title}</h3>}
      <p className="text-sm text-gray-600 mb-4">
        Status: <span className="font-mono">{result.status}</span>
        {result.totalSorties != null && (
          <>
            {' '}
            · <strong>{result.totalSorties}</strong> wing sortie
            {result.totalSorties === 1 ? '' : 's'}
          </>
        )}
        {result.totalWingNm != null && (
          <>
            {' '}
            · <strong>{result.totalWingNm}</strong> NM wing total
          </>
        )}
      </p>

      {result.teams.length > 1 && (
        <div className="mb-4 rounded-lg border border-cap-ultramarine/30 bg-slate-50 px-4 py-3 text-sm">
          <p className="font-medium text-gray-900 mb-2">Wing summary</p>
          <ul className="space-y-1 text-gray-700">
            {result.teams.map((t) => (
              <li key={t.label}>
                {t.label} ({formatSurveySide(t.side)}): {t.sortieCount} sortie{t.sortieCount === 1 ? '' : 's'},{' '}
                {t.totalNm} NM
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.teams.map((t) => (
        <div key={t.label} className="mb-6 last:mb-0">
          <p className="text-sm text-gray-700 mb-2">
            <strong>{t.label}</strong> ({formatSurveySide(t.side)}): entry {t.entryWaypoint ?? '—'}, ferry in ~{' '}
            {t.ferryInNm} NM
            {t.sortieCount != null && (
              <>
                {' '}
                · {t.sortieCount} sortie{t.sortieCount === 1 ? '' : 's'}, {t.totalNm} NM total
              </>
            )}
          </p>
          {t.note && (
            <p className="text-sm text-amber-800 mb-2" role="status">
              {t.note}
            </p>
          )}
          {t.sorties.length > 0 && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Range</th>
                  <th className="py-2 pr-3">Start at</th>
                  <th className="py-2 pr-3">Offsets</th>
                  <th className="py-2 pr-3">Ferry in</th>
                  <th className="py-2 pr-3">Along route</th>
                  <th className="py-2 pr-3">Ferry out</th>
                  <th className="py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {t.sorties.map((s) => (
                  <tr
                    key={s.sortieNumber}
                    className={`border-b border-gray-100 ${s.overBudget ? 'bg-amber-50' : ''}`}
                  >
                    <td className="py-2 pr-3 tabular-nums">{s.sortieNumber}</td>
                    <td className="py-2 pr-3 font-mono">
                      {s.waypointFrom}→{s.waypointTo}
                    </td>
                    <td className="py-2 pr-3 font-mono">{s.startAt}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{s.offsets.join(', ')}</td>
                    <td className="py-2 pr-3 tabular-nums">{s.ferryInNm}</td>
                    <td className="py-2 pr-3 tabular-nums">{s.alongRouteNm}</td>
                    <td className="py-2 pr-3 tabular-nums">{s.ferryOutNm}</td>
                    <td className="py-2 tabular-nums font-medium">
                      {s.totalNm}
                      {s.overBudget ? ' ⚠' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}

export function CoordinatorSurveyConsolePage() {
  const [searchParams] = useSearchParams()
  const planId = searchParams.get('plan') ?? ''

  const [runMode, setRunMode] = useState<RunMode>('single')
  const [teamCount, setTeamCount] = useState<TeamCount>(1)
  const [team2Code, setTeam2Code] = useState('')
  const [team2Airport, setTeam2Airport] = useState<AirportResult | null>(null)
  const [team2Err, setTeam2Err] = useState<string | null>(null)
  const [team2Busy, setTeam2Busy] = useState(false)
  const [team3Code, setTeam3Code] = useState('')
  const [team3Airport, setTeam3Airport] = useState<AirportResult | null>(null)
  const [team3Err, setTeam3Err] = useState<string | null>(null)
  const [team3Busy, setTeam3Busy] = useState(false)

  const team2LookupRef = useRef<HTMLButtonElement>(null)
  const team3CodeInputRef = useRef<HTMLInputElement>(null)
  const team3LookupRef = useRef<HTMLButtonElement>(null)

  const [sortieBudgetNm, setSortieBudgetNm] = useState(500)
  const [widthTexts, setWidthTexts] = useState<string[]>([])
  const [widthErr, setWidthErr] = useState<string | null>(null)
  const [widthBusy, setWidthBusy] = useState(false)
  const [plannerResult, setPlannerResult] = useState<PlannerResult | null>(null)
  const [compareBundle, setCompareBundle] = useState<CompareBundle | null>(null)

  const planBundle = useLiveQuery(async () => {
    if (!planId) return null
    const plan = await db.flightPlans.get(planId)
    if (!plan) return null
    const waypoints = await db.waypoints.where('flightPlanId').equals(planId).sortBy('sequence')
    let departure = null
    let destination = null
    if (plan.departureAirportId) {
      departure = await db.airports.get(plan.departureAirportId)
    }
    if (plan.destinationAirportId) {
      destination = await db.airports.get(plan.destinationAirportId)
    }
    return { plan, waypoints, departure, destination }
  }, [planId])

  const routeMeta = useMemo(() => {
    const first = planBundle?.waypoints[0]
    if (!first) return null
    const parsed = parseWaypointCode(first.originalName)
    if (!parsed) return null
    return { routeType: parsed.routeType, routeNumber: parsed.routeNumber }
  }, [planBundle])

  useEffect(() => {
    if (!planBundle) return
    const destId = planBundle.destination?.identifier ?? ''
    const depId = planBundle.departure?.identifier ?? ''
    if (destId && destId !== depId) {
      setTeam2Code(destId)
      setTeam2Airport({
        identifier: planBundle.destination!.identifier,
        name: planBundle.destination!.name,
        latitude: planBundle.destination!.latitude,
        longitude: planBundle.destination!.longitude,
        elevation: planBundle.destination!.elevation,
      })
      setTeam2Err(null)
    }
  }, [planBundle?.plan.id, planBundle?.destination?.identifier, planBundle?.departure?.identifier])

  const loadWidth = useCallback(async () => {
    if (!routeMeta || (routeMeta.routeType !== 'IR' && routeMeta.routeType !== 'VR')) {
      setWidthTexts([])
      setWidthErr('Width data requires an IR or VR route in the loaded flight plan.')
      return
    }
    setWidthBusy(true)
    setWidthErr(null)
    try {
      const data = await fetchMtrWidthTexts(routeMeta.routeType, routeMeta.routeNumber)
      setWidthTexts(data.widthTexts)
    } catch (err) {
      setWidthTexts([])
      setWidthErr(err instanceof Error ? err.message : 'Failed to load width data')
    } finally {
      setWidthBusy(false)
    }
  }, [routeMeta])

  useEffect(() => {
    void loadWidth()
  }, [loadWidth])

  const lookupTeamAirport = async (
    code: string,
    setAirport: (a: AirportResult | null) => void,
    setErr: (e: string | null) => void,
    setBusy: (b: boolean) => void,
    onSuccess?: () => void
  ) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    setErr(null)
    try {
      const airport = await apiService.fetchAirport(trimmed)
      if (!airport) {
        setAirport(null)
        setErr(`Could not find airport: ${trimmed}`)
        return
      }
      setAirport(airport)
      onSuccess?.()
    } catch {
      setAirport(null)
      setErr(`Could not find airport: ${trimmed}`)
    } finally {
      setBusy(false)
    }
  }

  const team2CanLookup = Boolean(team2Code.trim()) && !team2Busy
  const team3CanLookup = Boolean(team3Code.trim()) && !team3Busy

  const runTeam2Lookup = () => {
    if (!team2CanLookup) return
    void lookupTeamAirport(team2Code, setTeam2Airport, setTeam2Err, setTeam2Busy, () => {
      // After Team 2 resolves, move keyboard focus to Team 3 (same pattern as Flight Plans dep → dest).
      queueMicrotask(() => team3CodeInputRef.current?.focus())
    })
  }

  const runTeam3Lookup = () => {
    if (!team3CanLookup) return
    void lookupTeamAirport(team3Code, setTeam3Airport, setTeam3Err, setTeam3Busy)
  }

  const team1Input = () => {
    const dep = planBundle?.departure
    if (!dep) return null
    return {
      label: dep.identifier,
      depLat: dep.latitude,
      depLon: dep.longitude,
      side: 'left' as const,
    }
  }

  const team2Input = () => {
    if (!team2Airport) return null
    return {
      label: team2Airport.identifier,
      depLat: team2Airport.latitude,
      depLon: team2Airport.longitude,
      side: (teamCount === 3 ? 'left' : 'right') as 'left' | 'right',
    }
  }

  const team3Input = () => {
    if (!team3Airport) return null
    return {
      label: team3Airport.identifier,
      depLat: team3Airport.latitude,
      depLon: team3Airport.longitude,
      side: 'left' as const,
    }
  }

  const buildTeamsForSingle = (): SurveyTeamInput[] => {
    const t1 = team1Input()
    if (!t1) return []
    const teams: SurveyTeamInput[] = [t1]
    const t2 = team2Input()
    if (teamCount === 2 && t2) teams.push(t2)
    return teams
  }

  const plannerBaseInput = () => {
    if (!planBundle || !routeMeta) return null
    return {
      routeType: routeMeta.routeType,
      routeNumber: routeMeta.routeNumber,
      waypoints: planBundle.waypoints.map((w) => ({
        ptIdent: waypointPtIdent(w.originalName),
        lat: w.latitude,
        lon: w.longitude,
      })),
      widthTexts,
      sortieBudgetNm,
    }
  }

  const runPlanner = () => {
    const base = plannerBaseInput()
    const t1 = team1Input()
    if (!base || !t1) return

    if (runMode === 'compare-1-2') {
      const t2 = team2Input()
      if (!t2) return
      setPlannerResult(null)
      setCompareBundle({
        kind: '1-2',
        data: compareOneVsTwoTeamStaffing(
          { ...base, teams: [t1] },
          t2,
          {
            team1DepLabel: planBundle?.departure?.identifier ?? 'Team 1',
            team2DepLabel: team2Airport?.identifier ?? 'Team 2',
          }
        ),
      })
      return
    }

    if (runMode === 'compare-2-3') {
      const t2 = team2Input()
      const t3 = team3Input()
      if (!t2 || !t3) return
      setPlannerResult(null)
      setCompareBundle({
        kind: '2-3',
        data: compareTwoVsThreeTeamStaffing(
          { ...base, teams: [t1] },
          t2,
          t3,
          {
            team1DepLabel: planBundle?.departure?.identifier ?? 'Team 1',
            team2DepLabel: team2Airport?.identifier ?? 'Team 2',
            team3DepLabel: team3Airport?.identifier ?? 'Team 3',
          }
        ),
      })
      return
    }

    setCompareBundle(null)
    if (teamCount === 1) {
      setPlannerResult(planSingleTeamBothSides({ ...base, teams: [t1] }))
      return
    }

    if (teamCount === 3) {
      const t2 = team2Input()
      const t3 = team3Input()
      if (!t2 || !t3) return
      setPlannerResult(
        planThreeTeamGeographicScenario({ ...base, teams: [t1, t2, t3] }, [t1, t2, t3])
      )
      return
    }

    const teams = buildTeamsForSingle()
    if (teams.length === 0) return
    setPlannerResult(
      planSurveyScenario({
        ...base,
        teams,
        assignmentModel: 'opposite-side',
      })
    )
  }

  const loading = planId && planBundle === undefined
  const team1Ready = Boolean(planBundle?.departure)
  const needsTeam2 = runMode !== 'single' || teamCount >= 2
  const needsTeam3 = runMode === 'compare-2-3' || (runMode === 'single' && teamCount === 3)
  const team2Ready = !needsTeam2 || Boolean(team2Airport)
  const team3Ready = !needsTeam3 || Boolean(team3Airport)
  const minWaypoints =
    runMode === 'compare-2-3' || (runMode === 'single' && teamCount === 3) ? 4 : 2
  const canRun =
    planBundle &&
    planBundle.waypoints.length >= minWaypoints &&
    widthTexts.length > 0 &&
    !widthBusy &&
    team1Ready &&
    team2Ready &&
    team3Ready

  const legsResult =
    compareBundle?.kind === '1-2'
      ? compareBundle.data.oneTeam
      : compareBundle?.kind === '2-3'
        ? compareBundle.data.twoTeams
        : plannerResult

  return (
    <div className="app-page-shell overflow-auto">
      <div className="app-panel max-w-4xl mx-auto p-6 md:p-8">
        <header className="mb-6">
          <p className="text-sm text-gray-500 mb-1">
            <Link to="/flight-plans" className="text-cap-ultramarine hover:underline">
              ← Flight Plans
            </Link>
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Coordinator Survey Console</h1>
          <p className="text-sm text-gray-600 mt-1">
            What-if sortie planner for wing route surveys. See{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">docs/COORDINATOR_SURVEY_CONSOLE.md</code>.
          </p>
        </header>

        <CoordinatorConsoleGuide />

        {!planId && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-slate-50 p-8 text-center text-gray-600">
            <p className="mb-3">Open this console from a flight plan to load waypoint sequence and departure airport.</p>
            <Link to="/flight-plans" className="text-cap-ultramarine font-medium hover:underline">
              Choose a flight plan →
            </Link>
          </div>
        )}

        {loading && <p className="text-gray-600 text-sm">Loading flight plan…</p>}

        {planId && planBundle === null && (
          <p className="text-cap-pimento text-sm" role="alert">
            Flight plan not found.
          </p>
        )}

        {planBundle && (
          <>
            <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Scenario</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500">Flight plan</dt>
                  <dd className="font-medium text-gray-900">{planBundle.plan.name}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Route</dt>
                  <dd className="font-medium text-gray-900">
                    {routeMeta ? `${routeMeta.routeType}${routeMeta.routeNumber}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Waypoints</dt>
                  <dd className="font-medium text-gray-900">{planBundle.waypoints.length}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Assignment model</dt>
                  <dd className="font-medium text-gray-900">
                    {runMode === 'compare-1-2'
                      ? 'Compare: 1 team sequential vs 2 opposite-side'
                      : runMode === 'compare-2-3'
                        ? 'Compare: 2 opposite-side vs 3 geographic'
                        : teamCount === 1
                        ? 'Single team, both sides sequential'
                        : teamCount === 2
                          ? 'Opposite-side (inner / outer)'
                          : 'Geographic split (3 teams)'}
                  </dd>
                </div>
              </dl>
              <ul className="mt-4 font-mono text-xs text-gray-700 space-y-0.5 max-h-32 overflow-auto">
                {planBundle.waypoints.map((w) => (
                  <li key={w.id}>
                    {w.sequence + 1}. {w.originalName}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Teams & parameters</h2>

              <fieldset className="mb-5">
                <legend className="text-sm font-medium text-gray-700 mb-2">Planner mode</legend>
                <div className="flex flex-col gap-3 text-sm">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="run-mode"
                      checked={runMode === 'single'}
                      onChange={() => setRunMode('single')}
                    />
                    Single scenario
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="run-mode"
                      checked={runMode === 'compare-1-2'}
                      onChange={() => setRunMode('compare-1-2')}
                    />
                    Compare 1 vs 2 teams
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="run-mode"
                      checked={runMode === 'compare-2-3'}
                      onChange={() => setRunMode('compare-2-3')}
                    />
                    Compare 2 vs 3 teams
                  </label>
                </div>
              </fieldset>

              {runMode === 'single' && (
                <fieldset className="mb-5">
                  <legend className="text-sm font-medium text-gray-700 mb-2">Aircraft count</legend>
                  <div className="flex flex-col sm:flex-row gap-3 text-sm">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="team-count"
                        checked={teamCount === 1}
                        onChange={() => setTeamCount(1)}
                      />
                      1 team (both sides, sequential)
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="team-count"
                        checked={teamCount === 2}
                        onChange={() => setTeamCount(2)}
                      />
                      2 teams (opposite sides)
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="team-count"
                        checked={teamCount === 3}
                        onChange={() => setTeamCount(3)}
                      />
                      3 teams (geographic split)
                    </label>
                  </div>
                  {teamCount === 3 && (
                    <p className="text-sm text-gray-600 mt-2">
                      Route is divided into three contiguous segments. Each team flies <strong>both sides</strong> of
                      its segment from its own departure (~{sortieBudgetNm} NM sortie budget ≈ 4.5–5 hr). Segments and
                      team assignments are optimized for fewest wing sorties; unfinished range after weather can be flown
                      on a later sortie from the same base.
                    </p>
                  )}
                </fieldset>
              )}

              {runMode === 'compare-1-2' && (
                <p className="text-sm text-gray-600 mb-5">
                  Runs two what-if scenarios with the same budget: <strong>1 team</strong> flies the full corridor
                  (inner then outer, sequential sorties from Team 1&apos;s departure); <strong>2 teams</strong> split
                  inner and outer in parallel from each departure.
                </p>
              )}

              {runMode === 'compare-2-3' && (
                <p className="text-sm text-gray-600 mb-5">
                  Runs two full-corridor scenarios: <strong>2 teams</strong> opposite-side (inner / outer) vs{' '}
                  <strong>3 teams</strong> geographic split with optimized segment boundaries and airport assignments.
                  Look up all three departures before running.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 text-sm">
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                  <p className="font-medium text-gray-900 mb-1">
                    {runMode === 'compare-2-3' || teamCount === 3
                      ? 'Team 1 — departure'
                      : runMode === 'compare-1-2' || teamCount === 1
                        ? 'Team 1 — both sides, sequential'
                        : 'Team 1 — inner'}
                  </p>
                  <p className="text-gray-600">
                    Departure:{' '}
                    <span className="font-medium text-gray-900">
                      {planBundle.departure?.identifier ?? '— (set on flight plan)'}
                    </span>
                  </p>
                  {!planBundle.departure && (
                    <p className="text-cap-pimento text-xs mt-2">Set a departure airport on the flight plan.</p>
                  )}
                </div>

                {needsTeam2 && (
                  <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                    <p className="font-medium text-gray-900 mb-2">
                      {runMode === 'compare-2-3' || teamCount === 3
                        ? 'Team 2 — departure'
                        : 'Team 2 — outer'}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={team2Code}
                        onChange={(e) => {
                          setTeam2Code(e.target.value.toUpperCase())
                          setTeam2Airport(null)
                          setTeam2Err(null)
                        }}
                        onKeyDown={(e) =>
                          onAirportCodeInputKeyDown(
                            e,
                            team2LookupRef.current,
                            runTeam2Lookup,
                            team2CanLookup
                          )
                        }
                        placeholder="e.g. KROW"
                        className={AIRPORT_CODE_INPUT_CLASS}
                        aria-label="Team 2 departure airport code"
                      />
                      <button
                        ref={team2LookupRef}
                        type="button"
                        onClick={runTeam2Lookup}
                        aria-disabled={!team2CanLookup}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            if (team2CanLookup) runTeam2Lookup()
                            return
                          }
                          if (e.key === 'Tab' && !e.shiftKey && needsTeam3) {
                            e.preventDefault()
                            team3CodeInputRef.current?.focus()
                          }
                        }}
                        className={`${AIRPORT_LOOKUP_BTN_CLASS}${team2CanLookup ? '' : ` ${AIRPORT_LOOKUP_BTN_IDLE_CLASS}`}`}
                      >
                        {team2Busy ? '…' : 'Look up'}
                      </button>
                    </div>
                    {team2Airport && (
                      <p className={AIRPORT_LOOKUP_RESULT_CLASS}>
                        {team2Airport.identifier} — {team2Airport.name}
                      </p>
                    )}
                    {team2Err && (
                      <p className="text-cap-pimento text-xs mt-2" role="alert">
                        {team2Err}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      {runMode === 'compare-2-3' || teamCount === 3
                        ? 'Look up a second departure along or near the route.'
                        : 'Pre-filled from flight plan destination when it differs from departure.'}
                    </p>
                  </div>
                )}

                {needsTeam3 && (
                  <div className="rounded-lg border border-gray-200 bg-slate-50 p-4 sm:col-span-2">
                    <p className="font-medium text-gray-900 mb-2">Team 3 — departure</p>
                    <div className="flex gap-2 max-w-md">
                      <input
                        ref={team3CodeInputRef}
                        type="text"
                        value={team3Code}
                        onChange={(e) => {
                          setTeam3Code(e.target.value.toUpperCase())
                          setTeam3Airport(null)
                          setTeam3Err(null)
                        }}
                        onKeyDown={(e) =>
                          onAirportCodeInputKeyDown(
                            e,
                            team3LookupRef.current,
                            runTeam3Lookup,
                            team3CanLookup
                          )
                        }
                        placeholder="e.g. KROW"
                        className={AIRPORT_CODE_INPUT_CLASS}
                        aria-label="Team 3 departure airport code"
                      />
                      <button
                        ref={team3LookupRef}
                        type="button"
                        onClick={runTeam3Lookup}
                        aria-disabled={!team3CanLookup}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            if (team3CanLookup) runTeam3Lookup()
                          }
                        }}
                        className={`${AIRPORT_LOOKUP_BTN_CLASS}${team3CanLookup ? '' : ` ${AIRPORT_LOOKUP_BTN_IDLE_CLASS}`}`}
                      >
                        {team3Busy ? '…' : 'Look up'}
                      </button>
                    </div>
                    {team3Airport && (
                      <p className={AIRPORT_LOOKUP_RESULT_CLASS}>
                        {team3Airport.identifier} — {team3Airport.name}
                      </p>
                    )}
                    {team3Err && (
                      <p className="text-cap-pimento text-xs mt-2" role="alert">
                        {team3Err}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="max-w-xs">
                <label htmlFor="sortie-budget" className="block text-sm font-medium text-gray-700 mb-1">
                  Sortie distance budget (NM)
                </label>
                <input
                  id="sortie-budget"
                  type="number"
                  min={100}
                  max={800}
                  step={50}
                  value={sortieBudgetNm}
                  onChange={(e) => setSortieBudgetNm(Number(e.target.value) || 500)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              {widthBusy && <p className="text-sm text-gray-500 mt-3">Loading NASR width text…</p>}
              {widthErr && (
                <p className="text-sm text-cap-pimento mt-3" role="alert">
                  {widthErr}
                </p>
              )}
              {!widthBusy && widthTexts.length > 0 && (
                <ul className="mt-3 text-xs text-gray-600 space-y-1">
                  {widthTexts.map((t, i) => (
                    <li key={i} className="font-mono">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              {planBundle.waypoints.length < 2 && (
                <p className="text-sm text-gray-600 mt-3">
                  Need at least two resolved waypoints in the flight plan before running the planner.
                </p>
              )}
              {planBundle.waypoints.length >= 2 && !widthBusy && widthTexts.length === 0 && !widthErr && (
                <p className="text-sm text-gray-600 mt-3">No NASR width lines returned for this route.</p>
              )}
              {planBundle.waypoints.length >= 2 && widthErr && (
                <p className="text-sm text-gray-600 mt-3">
                  Fix the width error above, or confirm{' '}
                  <code className="text-xs bg-gray-100 px-1 rounded">npm run dev:all</code> is running (Node API on port
                  3001 proxies via Vite).
                </p>
              )}
              {(runMode === 'compare-2-3' ||
                (runMode === 'single' && teamCount === 3)) &&
                planBundle.waypoints.length < 4 && (
                <p className="text-sm text-gray-600 mt-3">
                  Three-team geographic split needs at least four waypoints on the flight plan.
                </p>
              )}
              {needsTeam2 && !team2Airport && (
                <p className="text-sm text-gray-600 mt-3">Look up Team 2 departure airport before running.</p>
              )}
              {needsTeam3 && !team3Airport && (
                <p className="text-sm text-gray-600 mt-3">Look up Team 3 departure airport before running.</p>
              )}
              <button
                type="button"
                onClick={runPlanner}
                disabled={!canRun}
                className="mt-4 px-4 py-2.5 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
              >
                {widthBusy
                  ? 'Loading width data…'
                  : runMode === 'compare-1-2'
                    ? 'Compare 1 vs 2 teams'
                    : runMode === 'compare-2-3'
                      ? 'Compare 2 vs 3 teams'
                      : 'Run planner'}
              </button>
            </section>

            {(compareBundle || plannerResult) && legsResult && (
              <section className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Results</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Centerline {legsResult.totalCenterlineNm} NM · Budget {legsResult.sortieBudgetNm} NM
                </p>

                {plannerResult &&
                  'segmentAssignments' in plannerResult &&
                  plannerResult.segmentAssignments &&
                  plannerResult.segmentAssignments.length > 0 && (
                    <div className="mb-8 rounded-lg border-2 border-cap-ultramarine/40 bg-slate-50 p-4">
                      <h3 className="text-base font-semibold text-gray-900 mb-2">Geographic assignment</h3>
                      <p className="text-sm text-gray-700 mb-3">
                        Split boundaries at{' '}
                        <strong>
                          {plannerResult.geographicSplits
                            ?.map((s: { boundaryPt: string }) => s.boundaryPt)
                            .join(' and ') ?? '—'}
                        </strong>
                        . Each segment includes both corridor sides from the assigned departure.
                      </p>
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-300 text-left text-gray-600">
                            <th className="py-2 pr-4">Team</th>
                            <th className="py-2 pr-4">Segment</th>
                            <th className="py-2 pr-4">Sorties</th>
                            <th className="py-2">NM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plannerResult.segmentAssignments.map((a) => (
                              <tr key={`${a.teamLabel}-${a.waypointFrom}-${a.waypointTo}`} className="border-b border-gray-200">
                                <td className="py-2 pr-4 font-medium">{a.teamLabel}</td>
                                <td className="py-2 pr-4 font-mono">
                                  {a.waypointFrom}→{a.waypointTo}
                                </td>
                                <td className="py-2 pr-4 tabular-nums">{a.sortieCount}</td>
                                <td className="py-2 tabular-nums">{a.totalNm}</td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                {compareBundle?.kind === '1-2' && (
                  <div className="mb-8 rounded-lg border-2 border-cap-ultramarine/40 bg-slate-50 p-4">
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Staffing comparison (1 vs 2 teams)</h3>
                    <table className="min-w-full text-sm mb-4">
                      <thead>
                        <tr className="border-b border-gray-300 text-left text-gray-600">
                          <th className="py-2 pr-4">Scenario</th>
                          <th className="py-2 pr-4">Wing sorties</th>
                          <th className="py-2 pr-4">Wing NM</th>
                          <th className="py-2 pr-4">Coverage</th>
                          <th className="py-2">Over budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-200">
                          <td className="py-2 pr-4 font-medium">
                            1 team
                            <span className="block text-xs font-normal text-gray-500">
                              {compareBundle.data.team1DepLabel} · both sides, sequential
                            </span>
                          </td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.oneTeam.totalSorties}</td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.oneTeam.totalWingNm}</td>
                          <td className="py-2 pr-4 text-gray-700">Full corridor (inner then outer)</td>
                          <td className="py-2 tabular-nums">
                            {compareBundle.data.oneTeamOverBudgetSorties > 0
                              ? `${compareBundle.data.oneTeamOverBudgetSorties} sortie(s) ⚠`
                              : '—'}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4 font-medium">
                            2 teams
                            <span className="block text-xs font-normal text-gray-500">
                              {compareBundle.data.team1DepLabel} + {compareBundle.data.team2DepLabel} · inner / outer
                            </span>
                          </td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.twoTeams.totalSorties}</td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.twoTeams.totalWingNm}</td>
                          <td className="py-2 pr-4 text-gray-700">Full corridor (parallel)</td>
                          <td className="py-2 tabular-nums">
                            {compareBundle.data.twoTeamsOverBudgetSorties > 0
                              ? `${compareBundle.data.twoTeamsOverBudgetSorties} sortie(s) ⚠`
                              : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-sm text-gray-800">
                      {compareBundle.data.deltaSorties === 0 ? (
                        <>
                          Both scenarios require <strong>{compareBundle.data.twoTeams.totalSorties} wing sorties</strong>{' '}
                          for full corridor coverage. A second aircraft lets inner and outer passes fly in parallel; wing
                          NM differs by <strong>{compareBundle.data.deltaWingNm} NM</strong> based on each team&apos;s
                          departure geometry.
                        </>
                      ) : compareBundle.data.deltaSorties > 0 ? (
                        <>
                          Two teams adds <strong>{compareBundle.data.deltaSorties} wing sortie(s)</strong> and{' '}
                          <strong>{compareBundle.data.deltaWingNm} NM</strong> versus one aircraft doing both sides
                          sequentially.
                        </>
                      ) : (
                        <>
                          Two teams reduces wing workload by{' '}
                          <strong>{Math.abs(compareBundle.data.deltaSorties)} sortie(s)</strong> and{' '}
                          <strong>{Math.abs(compareBundle.data.deltaWingNm)} NM</strong> versus one aircraft doing both
                          sides sequentially.
                        </>
                      )}
                    </p>
                  </div>
                )}

                {compareBundle?.kind === '2-3' && (
                  <div className="mb-8 rounded-lg border-2 border-cap-ultramarine/40 bg-slate-50 p-4">
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Staffing comparison (2 vs 3 teams)</h3>
                    <table className="min-w-full text-sm mb-4">
                      <thead>
                        <tr className="border-b border-gray-300 text-left text-gray-600">
                          <th className="py-2 pr-4">Scenario</th>
                          <th className="py-2 pr-4">Wing sorties</th>
                          <th className="py-2 pr-4">Wing NM</th>
                          <th className="py-2 pr-4">Coverage</th>
                          <th className="py-2">Over budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-200">
                          <td className="py-2 pr-4 font-medium">
                            2 teams
                            <span className="block text-xs font-normal text-gray-500">
                              {compareBundle.data.team1DepLabel} inner + {compareBundle.data.team2DepLabel} outer
                            </span>
                          </td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.twoTeams.totalSorties}</td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.twoTeams.totalWingNm}</td>
                          <td className="py-2 pr-4 text-gray-700">Full corridor (parallel)</td>
                          <td className="py-2 tabular-nums">
                            {compareBundle.data.twoTeamsOverBudgetSorties > 0
                              ? `${compareBundle.data.twoTeamsOverBudgetSorties} sortie(s) ⚠`
                              : '—'}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4 font-medium">
                            3 teams
                            <span className="block text-xs font-normal text-gray-500">
                              {compareBundle.data.team1DepLabel}, {compareBundle.data.team2DepLabel},{' '}
                              {compareBundle.data.team3DepLabel} · geographic
                            </span>
                          </td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.threeTeams.totalSorties}</td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.threeTeams.totalWingNm}</td>
                          <td className="py-2 pr-4 text-gray-700">Full corridor (3 segments)</td>
                          <td className="py-2 tabular-nums">
                            {compareBundle.data.threeTeamsOverBudgetSorties > 0
                              ? `${compareBundle.data.threeTeamsOverBudgetSorties} sortie(s) ⚠`
                              : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {compareBundle.data.threeTeams.segmentAssignments && (
                      <p className="text-sm text-gray-700 mb-3">
                        3-team split at{' '}
                        <strong>
                          {compareBundle.data.threeTeams.geographicSplits
                            ?.map((s) => s.boundaryPt)
                            .join(' and ') ?? '—'}
                        </strong>
                        .
                      </p>
                    )}
                    <p className="text-sm text-gray-800">
                      {compareBundle.data.deltaSorties === 0 ? (
                        <>
                          Both scenarios require <strong>{compareBundle.data.twoTeams.totalSorties} wing sorties</strong>.
                          Three teams changes wing NM by <strong>{compareBundle.data.deltaWingNm} NM</strong> and
                          shortens per-aircraft geographic segments for weather recovery.
                        </>
                      ) : compareBundle.data.deltaSorties < 0 ? (
                        <>
                          Three teams saves <strong>{Math.abs(compareBundle.data.deltaSorties)} wing sortie(s)</strong>{' '}
                          and <strong>{Math.abs(compareBundle.data.deltaWingNm)} NM</strong> versus two-team
                          opposite-side staffing.
                        </>
                      ) : (
                        <>
                          Three teams adds <strong>{compareBundle.data.deltaSorties} wing sortie(s)</strong> and{' '}
                          <strong>{compareBundle.data.deltaWingNm} NM</strong> versus two-team opposite-side staffing.
                        </>
                      )}
                    </p>
                  </div>
                )}

                <table className="min-w-full text-sm mb-6">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="py-2 pr-3">Leg</th>
                      <th className="py-2 pr-3">Inner / Outer NM</th>
                      <th className="py-2 pr-3">Offsets Inner</th>
                      <th className="py-2 pr-3">Offsets Outer</th>
                      <th className="py-2">Chain NM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legsResult.legs.map((leg) => (
                      <tr key={`${leg.fromPt}-${leg.toPt}`} className="border-b border-gray-100">
                        <td className="py-2 pr-3 font-mono">
                          {leg.fromPt}→{leg.toPt}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {leg.leftNm ?? '—'} / {leg.rightNm ?? '—'}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">{leg.leftOffsets.join(', ') || '—'}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{leg.rightOffsets.join(', ') || '—'}</td>
                        <td className="py-2 tabular-nums">{leg.chainNm.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {compareBundle?.kind === '1-2' ? (
                  <>
                    <SurveyPlannerResults
                      title={`1 team — ${compareBundle.data.team1DepLabel} (both sides, sequential)`}
                      result={compareBundle.data.oneTeam}
                    />
                    <SurveyPlannerResults
                      title={`2 teams — ${compareBundle.data.team1DepLabel} + ${compareBundle.data.team2DepLabel} (inner / outer)`}
                      result={compareBundle.data.twoTeams}
                    />
                  </>
                ) : compareBundle?.kind === '2-3' ? (
                  <>
                    <SurveyPlannerResults
                      title={`2 teams — ${compareBundle.data.team1DepLabel} inner + ${compareBundle.data.team2DepLabel} outer`}
                      result={compareBundle.data.twoTeams}
                    />
                    <SurveyPlannerResults
                      title={`3 teams — geographic (${compareBundle.data.team1DepLabel}, ${compareBundle.data.team2DepLabel}, ${compareBundle.data.team3DepLabel})`}
                      result={compareBundle.data.threeTeams}
                    />
                  </>
                ) : (
                  plannerResult && <SurveyPlannerResults result={plannerResult} />
                )}

                <p className="text-sm font-bold text-cap-pimento mt-4" role="note">
                  {legsResult.disclaimer}
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
