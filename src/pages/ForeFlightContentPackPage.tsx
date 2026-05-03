import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { ContentPackUpdater } from '@/components/ContentPackUpdater'

export function ForeFlightContentPackPage() {
  const missions = useLiveQuery(() =>
    db.missions.toArray().then((a) => a.sort((x, y) => y.date.localeCompare(x.date)))
  )

  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)

  const selectedMission = selectedMissionId
    ? (missions ?? []).find((m) => m.id === selectedMissionId)
    : null

  return (
    <div className="app-page-shell overflow-auto">
      <div className="app-panel max-w-2xl mx-auto p-6 md:p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">ForeFlight Content Pack Update</h1>
        <p className="text-gray-600 mb-6">
          Select a Content Pack (ZIP or folder in Chrome/Edge), append <strong>new tower locations</strong>{' '}
          from a mission’s reports, then <strong>download an updated ZIP</strong> to unzip and import into
          ForeFlight for next year’s survey crews.
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
