import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { WaypointRecord } from '@/db/schema'
import { primaryRouteNumberFromWaypoints } from '@/utils/contentPackWaypoints'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'

type Props = {
  waypoints: WaypointRecord[]
}

/**
 * Coordinator guidance for ForeFlight content packs (Wing folder workflow).
 * Pack updates after a survey happen on Export Reported Data, not here.
 */
export function FlightPlanContentPackCard({ waypoints }: Props) {
  const routeNumber = useMemo(() => primaryRouteNumberFromWaypoints(waypoints), [waypoints])
  const { isSeen, markSeen } = useHintsSeen()

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h2 className="font-semibold text-gray-900">ForeFlight content pack</h2>
        <GuidedHint
          hintId="flightPlan.contentPackCard"
          stepNumber={4}
          title="Baseline pack for this route"
          body={
            <>
              Before the survey, issue the route&apos;s pack from the Wing{' '}
              <strong>Content Packs for Flight Planning</strong> folder so crews import the same
              towers in ForeFlight. After mission close-out, if crews added towers or refined
              coordinates, update the pack on <strong>Export Reported Data</strong> and file the
              ZIP for next season.
            </>
          }
          isSeen={isSeen('flightPlan.contentPackCard')}
          onDismiss={markSeen}
          surface="light"
        />
      </div>

      {routeNumber ? (
        <p className="text-sm text-gray-700">
          Route <strong>{routeNumber}</strong>. Issue the baseline pack for this MTR from Wing
          storage when crews build the matching flight plan in ForeFlight.
        </p>
      ) : (
        <p className="text-sm text-gray-600">
          Add MTR-style waypoints (e.g. <code className="text-xs bg-gray-100 px-1 rounded">112A</code>
          ) so the app can identify the route number for content-pack naming at close-out.
        </p>
      )}

      <p className="text-sm text-gray-600 mt-3">
        After the survey, open{' '}
        <Link to="/export" className="text-cap-ultramarine font-medium hover:underline">
          Export Reported Data
        </Link>{' '}
        to download the customer PDF and, when needed, an updated content pack ZIP.
      </p>
    </section>
  )
}
