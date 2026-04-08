import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { FlightPlanRecord } from '@/db/schema'

type PlanWithCount = FlightPlanRecord & { waypointCount: number }

export function FlightPlanListPage() {
  const plans = useLiveQuery(
    async () => {
      const all = await db.flightPlans.toArray()
      const withCounts: PlanWithCount[] = await Promise.all(
        all.map(async (p) => {
          const count = await db.waypoints.where('flightPlanId').equals(p.id).count()
          return { ...p, waypointCount: count }
        })
      )
      return withCounts.sort((a, b) => b.dateModified.localeCompare(a.dateModified))
    },
    []
  )

  const deletePlan = async (id: string) => {
    if (!confirm('Delete this flight plan? This cannot be undone.')) return
    const plan = await db.flightPlans.get(id)
    if (!plan) return
    const waypoints = await db.waypoints.where('flightPlanId').equals(id).toArray()
    await db.transaction('rw', db.waypoints, db.flightPlans, async () => {
      for (const wp of waypoints) await db.waypoints.delete(wp.id)
      await db.flightPlans.delete(id)
    })
  }

  const loading = plans === undefined
  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Loading flight plans...</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Flight Plans</h1>
        <Link
          to="/flight-plans/new"
          className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90"
        >
          New Flight Plan
        </Link>
      </div>
      {plans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-600 mb-4">No flight plans yet.</p>
          <Link
            to="/flight-plans/new"
            className="text-cap-ultramarine font-medium hover:underline"
          >
            Create your first flight plan →
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {(plans ?? []).map((plan) => (
              <li
                key={plan.id}
                className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 hover:border-cap-ultramarine/30"
              >
                <Link
                  to={`/flight-plans/${plan.id}`}
                  className="flex-1 min-w-0"
                >
                  <h2 className="font-semibold text-gray-900">{plan.name}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Modified {new Date(plan.dateModified).toLocaleDateString()}
                  </p>
                </Link>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {plan.waypointCount} waypoint{plan.waypointCount !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => deletePlan(plan.id)}
                    className="p-2 text-cap-scarlet hover:bg-red-50 rounded"
                    aria-label="Delete flight plan"
                  >
                    🗑️
                  </button>
                  <Link
                    to={`/flight-plans/${plan.id}`}
                    className="px-3 py-1.5 text-sm font-medium text-cap-ultramarine hover:bg-cap-ultramarine/10 rounded"
                  >
                    View
                  </Link>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
