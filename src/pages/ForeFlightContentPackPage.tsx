import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { ContentPackUpdater } from '@/components/ContentPackUpdater'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'

export function ForeFlightContentPackPage() {
  const missions = useLiveQuery(() =>
    db.missions.toArray().then((a) => a.sort((x, y) => y.date.localeCompare(x.date)))
  )

  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const { isSeen, markSeen, resetAll } = useHintsSeen()

  const selectedMission = selectedMissionId
    ? (missions ?? []).find((m) => m.id === selectedMissionId)
    : null

  return (
    <div className="app-page-shell overflow-auto">
      <div className="app-panel max-w-2xl mx-auto p-6 md:p-8">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">ForeFlight Content Pack Update</h1>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={resetAll}
              className="px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
              aria-label="Reset guided tour hints"
            >
              Reset hints
            </button>
            <GuidedHint
              hintId="contentPackPage.overview"
              stepNumber={1}
              title="What this page does"
              body={
                <>
                  During <strong>mission close-out</strong>, apply this mission’s saved tower
                  locations to the route’s shared content pack on the server. Coordinate
                  refinements update existing waypoints; previously-unreported towers are appended
                  as new ones. When next year’s crew preps for the same route, they download the
                  latest pack from the <strong>Flight Plan</strong> detail page.
                </>
              }
              isSeen={isSeen('contentPackPage.overview')}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
        </div>
        <p className="text-gray-600 mb-6">
          During mission close-out, apply this mission’s <strong>tower locations</strong> to the route’s shared content
          pack. Refinements (≤30&nbsp;m) update existing waypoint coordinates; previously-unknown towers are appended as
          new waypoints. Next year’s survey crews download the latest pack from the Flight Plan page when they prep for
          their flight.
        </p>

        {(missions ?? []).length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Mission</label>
            <select
              value={selectedMissionId ?? ''}
              onChange={(e) => setSelectedMissionId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Choose a mission…</option>
              {(missions ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1.5">
              Waypoint names use the flight plan’s primary route number (e.g. 112A, 112B). The mission must
              be linked to a flight plan with waypoints.
            </p>
          </div>
        )}

        {selectedMission && <ContentPackUpdater selectedMission={selectedMission} />}

        {(missions ?? []).length === 0 && (
          <p className="text-sm text-gray-600">Create a mission and add tower reports first.</p>
        )}
      </div>
    </div>
  )
}
