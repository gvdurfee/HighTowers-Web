import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import { fetchMtrWidthTexts } from '@/services/surveyPlanningApi'
import { apiService, type AirportResult } from '@/services/api'
import { planSurveyScenario } from '@survey-planning/surveySortiePlanner.js'

function waypointPtIdent(originalName: string): string {
  const parsed = parseWaypointCode(originalName)
  return parsed?.waypointLetter ?? originalName
}

type TeamCount = 1 | 2

export function CoordinatorSurveyConsolePage() {
  const [searchParams] = useSearchParams()
  const planId = searchParams.get('plan') ?? ''

  const [teamCount, setTeamCount] = useState<TeamCount>(1)
  const [team2Code, setTeam2Code] = useState('')
  const [team2Airport, setTeam2Airport] = useState<AirportResult | null>(null)
  const [team2Err, setTeam2Err] = useState<string | null>(null)
  const [team2Busy, setTeam2Busy] = useState(false)

  const [sortieBudgetNm, setSortieBudgetNm] = useState(500)
  const [widthTexts, setWidthTexts] = useState<string[]>([])
  const [widthErr, setWidthErr] = useState<string | null>(null)
  const [widthBusy, setWidthBusy] = useState(false)
  const [plannerResult, setPlannerResult] = useState<ReturnType<typeof planSurveyScenario> | null>(null)

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

  const lookupTeam2Airport = async () => {
    const code = team2Code.trim()
    if (!code) return
    setTeam2Busy(true)
    setTeam2Err(null)
    try {
      const airport = await apiService.fetchAirport(code)
      if (!airport) {
        setTeam2Airport(null)
        setTeam2Err(`Could not find airport: ${code}`)
        return
      }
      setTeam2Airport(airport)
    } catch {
      setTeam2Airport(null)
      setTeam2Err(`Could not find airport: ${code}`)
    } finally {
      setTeam2Busy(false)
    }
  }

  const buildTeams = () => {
    const dep = planBundle?.departure
    if (!dep) return []
    const teams: {
      label: string
      depLat: number
      depLon: number
      side: 'left' | 'right'
    }[] = [
      {
        label: 'Team 1',
        depLat: dep.latitude,
        depLon: dep.longitude,
        side: 'left',
      },
    ]
    if (teamCount === 2 && team2Airport) {
      teams.push({
        label: 'Team 2',
        depLat: team2Airport.latitude,
        depLon: team2Airport.longitude,
        side: 'right',
      })
    }
    return teams
  }

  const runPlanner = () => {
    if (!planBundle || !routeMeta) return
    const surveyWps = planBundle.waypoints.map((w) => ({
      ptIdent: waypointPtIdent(w.originalName),
      lat: w.latitude,
      lon: w.longitude,
    }))
    const teams = buildTeams()
    if (teams.length === 0) return

    setPlannerResult(
      planSurveyScenario({
        routeType: routeMeta.routeType,
        routeNumber: routeMeta.routeNumber,
        waypoints: surveyWps,
        widthTexts,
        teams,
        sortieBudgetNm,
        assignmentModel: 'opposite-side',
      })
    )
  }

  const loading = planId && planBundle === undefined
  const team1Ready = Boolean(planBundle?.departure)
  const team2Ready = teamCount === 1 || Boolean(team2Airport)
  const canRun =
    planBundle &&
    planBundle.waypoints.length >= 2 &&
    widthTexts.length > 0 &&
    !widthBusy &&
    team1Ready &&
    team2Ready

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

        <div
          className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <strong>Planning aid only.</strong> Corridors and execution remain in ForeFlight Military Flight Bag.
          Opposite-side two-team compare is available; geographic split and third team follow in a later phase.
        </div>

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
                  <dd className="font-medium text-gray-900">Opposite-side (left / right)</dd>
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
                <legend className="text-sm font-medium text-gray-700 mb-2">Aircraft count</legend>
                <div className="flex gap-4 text-sm">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="team-count"
                      checked={teamCount === 1}
                      onChange={() => setTeamCount(1)}
                    />
                    1 team (left / inner only)
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
                </div>
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 text-sm">
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                  <p className="font-medium text-gray-900 mb-1">Team 1 — left (inner)</p>
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

                {teamCount === 2 && (
                  <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                    <p className="font-medium text-gray-900 mb-2">Team 2 — right (outer)</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={team2Code}
                        onChange={(e) => {
                          setTeam2Code(e.target.value.toUpperCase())
                          setTeam2Airport(null)
                          setTeam2Err(null)
                        }}
                        placeholder="e.g. KROW"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
                        aria-label="Team 2 departure airport code"
                      />
                      <button
                        type="button"
                        onClick={() => void lookupTeam2Airport()}
                        disabled={!team2Code.trim() || team2Busy}
                        className="px-3 py-2 bg-gray-200 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-300 disabled:opacity-50"
                      >
                        {team2Busy ? '…' : 'Look up'}
                      </button>
                    </div>
                    {team2Airport && (
                      <p className="text-gray-600 mt-2">
                        {team2Airport.identifier} — {team2Airport.name}
                      </p>
                    )}
                    {team2Err && (
                      <p className="text-cap-pimento text-xs mt-2" role="alert">
                        {team2Err}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Pre-filled from flight plan destination when it differs from departure.
                    </p>
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
              {teamCount === 2 && !team2Airport && (
                <p className="text-sm text-gray-600 mt-3">Look up Team 2 departure airport before running.</p>
              )}
              <button
                type="button"
                onClick={runPlanner}
                disabled={!canRun}
                className="mt-4 px-4 py-2.5 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
              >
                {widthBusy ? 'Loading width data…' : 'Run planner'}
              </button>
            </section>

            {plannerResult && (
              <section className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Results</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Status: <span className="font-mono">{plannerResult.status}</span> · Centerline{' '}
                  {plannerResult.totalCenterlineNm} NM · Budget {plannerResult.sortieBudgetNm} NM
                  {plannerResult.totalSorties != null && (
                    <>
                      {' '}
                      · <strong>{plannerResult.totalSorties}</strong> wing sortie
                      {plannerResult.totalSorties === 1 ? '' : 's'}
                    </>
                  )}
                  {plannerResult.totalWingNm != null && (
                    <>
                      {' '}
                      · <strong>{plannerResult.totalWingNm}</strong> NM wing total
                    </>
                  )}
                </p>

                {plannerResult.teams.length > 1 && (
                  <div className="mb-6 rounded-lg border border-cap-ultramarine/30 bg-slate-50 px-4 py-3 text-sm">
                    <p className="font-medium text-gray-900 mb-2">Wing summary (opposite-side)</p>
                    <ul className="space-y-1 text-gray-700">
                      {plannerResult.teams.map((t) => (
                        <li key={t.label}>
                          {t.label} ({t.side}): {t.sortieCount} sortie{t.sortieCount === 1 ? '' : 's'}, {t.totalNm} NM
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <table className="min-w-full text-sm mb-6">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="py-2 pr-3">Leg</th>
                      <th className="py-2 pr-3">L/R NM</th>
                      <th className="py-2 pr-3">Offsets L</th>
                      <th className="py-2 pr-3">Offsets R</th>
                      <th className="py-2">Chain NM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plannerResult.legs.map((leg) => (
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

                {plannerResult.teams.map((t) => (
                  <div key={t.label} className="mb-6 last:mb-0">
                    <p className="text-sm text-gray-700 mb-2">
                      <strong>{t.label}</strong> ({t.side}): entry {t.entryWaypoint ?? '—'}, ferry in ~{t.ferryInNm}{' '}
                      NM
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
                <p className="text-xs text-gray-500 mt-4">{plannerResult.disclaimer}</p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
