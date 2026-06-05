import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import { fetchMtrWidthTexts } from '@/services/surveyPlanningApi'
import { planSurveyScenario } from '@survey-planning/surveySortiePlanner.js'

function waypointPtIdent(originalName: string): string {
  const parsed = parseWaypointCode(originalName)
  return parsed?.waypointLetter ?? originalName
}

export function CoordinatorSurveyConsolePage() {
  const [searchParams] = useSearchParams()
  const planId = searchParams.get('plan') ?? ''

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
    if (plan.departureAirportId) {
      departure = await db.airports.get(plan.departureAirportId)
    }
    return { plan, waypoints, departure }
  }, [planId])

  const routeMeta = useMemo(() => {
    const first = planBundle?.waypoints[0]
    if (!first) return null
    const parsed = parseWaypointCode(first.originalName)
    if (!parsed) return null
    return { routeType: parsed.routeType, routeNumber: parsed.routeNumber }
  }, [planBundle])

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

  const runPlanner = () => {
    if (!planBundle || !routeMeta) return
    const surveyWps = planBundle.waypoints.map((w) => ({
      ptIdent: waypointPtIdent(w.originalName),
      lat: w.latitude,
      lon: w.longitude,
    }))
    const dep = planBundle.departure
    const teams = dep
      ? [
          {
            label: 'Team 1',
            depLat: dep.latitude,
            depLon: dep.longitude,
            side: 'left' as const,
          },
        ]
      : []

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
            What-if sortie planner for wing route surveys (PR 1 scaffold). See{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">docs/COORDINATOR_SURVEY_CONSOLE.md</code>.
          </p>
        </header>

        <div
          className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <strong>Planning aid only.</strong> Corridors and execution remain in ForeFlight Military Flight Bag. Sortie
          packing and multi-team compare are not implemented yet.
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
                  <dt className="text-gray-500">Team 1 departure</dt>
                  <dd className="font-medium text-gray-900">
                    {planBundle.departure?.identifier ?? '— (set on flight plan)'}
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
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Parameters</h2>
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
                  Fix the width error above, or confirm <code className="text-xs bg-gray-100 px-1 rounded">npm run dev:all</code>{' '}
                  is running (Node API on port 3001 proxies via Vite).
                </p>
              )}
              <button
                type="button"
                onClick={runPlanner}
                disabled={planBundle.waypoints.length < 2 || widthTexts.length === 0 || widthBusy}
                className="mt-4 px-4 py-2.5 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
              >
                {widthBusy ? 'Loading width data…' : 'Run planner (scaffold)'}
              </button>
            </section>

            {plannerResult && (
              <section className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Results</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Status: <span className="font-mono">{plannerResult.status}</span> · Centerline{' '}
                  {plannerResult.totalCenterlineNm} NM · Budget {plannerResult.sortieBudgetNm} NM
                </p>
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
                  <p key={t.label} className="text-sm text-gray-700">
                    <strong>{t.label}</strong> ({t.side}): entry {t.entryWaypoint ?? '—'}, ferry in ~{t.ferryInNm}{' '}
                    NM — {t.note}
                  </p>
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
