import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '@/db/schema'
import { generateId } from '@/utils/id'
import { parseRouteInput } from '@/utils/mtrRouteInput'
import {
  loadWaypointsFromFullRoute,
  loadWaypointsFromSequence,
} from '@/utils/loadMtrWaypoints'
import { apiService } from '@/services/api'

type LoadMethod = 'route' | 'sequence'

type RoutePreview = { count: number; label: string } | { error: string }

type SavedPlanOption = { id: string; name: string }

type Props = {
  savedPlans: SavedPlanOption[]
  onLoaded: (planId: string) => void
}

export function CoordinatorRouteLoadForm({ savedPlans, onLoaded }: Props) {
  const [name, setName] = useState('')
  const [loadMethod, setLoadMethod] = useState<LoadMethod>('route')
  const [routeInput, setRouteInput] = useState('')
  const [entryWaypoint, setEntryWaypoint] = useState('A')
  const [exitWaypoint, setExitWaypoint] = useState('Q')
  const [routeIdentifier, setRouteIdentifier] = useState('')
  const [waypointSequence, setWaypointSequence] = useState('')
  const [preview, setPreview] = useState<RoutePreview | null>(null)
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openPlanId, setOpenPlanId] = useState('')

  const suggestedName = useMemo(() => {
    const rid =
      loadMethod === 'route' ? routeInput.trim().toUpperCase() : routeIdentifier.trim().toUpperCase()
    return rid ? `${rid} survey` : ''
  }, [loadMethod, routeInput, routeIdentifier])

  const fetchPreview = async () => {
    setError(null)
    setPreview(null)
    setFetching(true)
    try {
      if (loadMethod === 'route') {
        const parsed = parseRouteInput(routeInput.trim())
        if (!parsed) {
          setPreview({ error: 'Invalid route format. Use IR111, SR45, or VR108.' })
          return
        }
        const entry = entryWaypoint.trim() || 'A'
        const exit = exitWaypoint.trim() || 'Q'
        const allWps = await apiService.fetchRouteData(
          parsed.routeType,
          parsed.routeNumber,
          entry,
          exit
        )
        const segment = apiService.extractRouteSegment(allWps, entry, exit)
        if (segment.length === 0) {
          setPreview({
            error: `Entry "${entry}" to Exit "${exit}" produced no waypoints. Check the segment.`,
          })
        } else {
          setPreview({
            count: segment.length,
            label: `${routeInput.trim().toUpperCase()} (${entry}–${exit})`,
          })
        }
      } else {
        const result = await loadWaypointsFromSequence({
          routeIdentifier,
          waypointSequence,
        })
        if (result.error && result.waypoints.length === 0) {
          setPreview({ error: result.error })
        } else {
          const total =
            waypointSequence.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean).length
          setPreview({
            count: result.waypoints.length,
            label: `${result.waypoints.length}/${total || result.waypoints.length} resolved`,
          })
        }
      }
    } catch {
      setPreview({ error: 'Failed to fetch waypoint data. Check your connection.' })
    } finally {
      setFetching(false)
    }
  }

  const saveRoute = async () => {
    setError(null)
    setSaving(true)
    try {
      const planName = name.trim() || suggestedName || 'Survey route'
      const loaded =
        loadMethod === 'route'
          ? await loadWaypointsFromFullRoute({
              routeInput,
              entry: entryWaypoint,
              exit: exitWaypoint,
            })
          : await loadWaypointsFromSequence({
              routeIdentifier,
              waypointSequence,
            })
      if (loaded.error && loaded.waypoints.length === 0) {
        setError(loaded.error)
        return
      }
      if (loaded.waypoints.length === 0 && loaded.pending.length === 0) {
        setError('No waypoints found. Check the route ID or sequence.')
        return
      }

      const now = new Date().toISOString()
      const planId = generateId()
      await db.flightPlans.add({
        id: planId,
        name: planName,
        dateCreated: now,
        dateModified: now,
        isActive: false,
        creationLoadMethod: 'coordinatorSurvey',
        creationRouteIdentifier:
          loadMethod === 'sequence' ? routeIdentifier.trim() || undefined : undefined,
        creationWaypointSequence:
          loadMethod === 'sequence' ? waypointSequence.trim() || undefined : undefined,
        creationRouteInput: loadMethod === 'route' ? routeInput.trim() || undefined : undefined,
        creationEntryWaypoint: loadMethod === 'route' ? entryWaypoint.trim() || undefined : undefined,
        creationExitWaypoint: loadMethod === 'route' ? exitWaypoint.trim() || undefined : undefined,
        pendingWaypoints: loaded.pending.length > 0 ? loaded.pending : undefined,
      })
      for (const wp of loaded.waypoints) {
        await db.waypoints.add({
          id: generateId(),
          flightPlanId: planId,
          originalName: wp.originalName,
          g1000Name: wp.g1000Name,
          latitude: wp.lat,
          longitude: wp.lon,
          routeType: wp.routeType,
          sequence: wp.sequence,
        })
      }
      onLoaded(planId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save survey route')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Load the published route</h2>
        <p className="text-sm text-gray-600 mt-1">
          Start with the full MTR the wing will survey. Same waypoint lookup as Flight Plans. Team
          airports and Mission Pilot assignments come next, when you know who can fly.
        </p>
      </div>

      {savedPlans.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-gray-900 mb-2">Continue a saved survey route</p>
          <div className="flex flex-wrap gap-2 min-w-0">
            <select
              value={openPlanId}
              onChange={(e) => setOpenPlanId(e.target.value)}
              className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              aria-label="Saved survey route"
            >
              <option value="">Select…</option>
              {savedPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!openPlanId}
              onClick={() => openPlanId && onLoaded(openPlanId)}
              className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50 shrink-0"
            >
              Open
            </button>
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-gray-700">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={suggestedName || 'e.g. VR114 survey'}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-gray-700 mb-2">Waypoint loading</legend>
        <div className="flex flex-col gap-2 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={loadMethod === 'route'}
              onChange={() => {
                setLoadMethod('route')
                setPreview(null)
              }}
            />
            Load full route
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={loadMethod === 'sequence'}
              onChange={() => {
                setLoadMethod('sequence')
                setPreview(null)
              }}
            />
            Waypoint sequence
          </label>
        </div>
      </fieldset>

      {loadMethod === 'route' ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Route ID</span>
            <input
              type="text"
              value={routeInput}
              onChange={(e) => {
                setRouteInput(e.target.value.toUpperCase())
                setPreview(null)
              }}
              placeholder="e.g. VR114"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Entry</span>
              <input
                type="text"
                value={entryWaypoint}
                onChange={(e) => {
                  setEntryWaypoint(e.target.value.toUpperCase())
                  setPreview(null)
                }}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Exit</span>
              <input
                type="text"
                value={exitWaypoint}
                onChange={(e) => {
                  setExitWaypoint(e.target.value.toUpperCase())
                  setPreview(null)
                }}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Route identifier (optional)</span>
            <input
              type="text"
              value={routeIdentifier}
              onChange={(e) => {
                setRouteIdentifier(e.target.value.toUpperCase())
                setPreview(null)
              }}
              placeholder="e.g. SR213"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Waypoint sequence</span>
            <input
              type="text"
              value={waypointSequence}
              onChange={(e) => {
                setWaypointSequence(e.target.value)
                setPreview(null)
              }}
              placeholder="A, B, C, D or SR213A, SR214H"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void fetchPreview()}
          disabled={fetching}
          className="px-4 py-2 border border-cap-ultramarine/40 text-cap-ultramarine rounded-lg text-sm font-medium hover:bg-cap-ultramarine/5 disabled:opacity-50"
        >
          {fetching ? 'Fetching…' : 'Fetch'}
        </button>
        <button
          type="button"
          onClick={() => void saveRoute()}
          disabled={saving}
          className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Load route into console'}
        </button>
      </div>
      {preview && 'error' in preview && (
        <p className="text-sm text-cap-pimento" role="alert">
          {preview.error}
        </p>
      )}
      {preview && 'count' in preview && (
        <p className="text-sm text-green-700">
          ✓ {preview.count} waypoints found for {preview.label}
        </p>
      )}
      {error && (
        <p className="text-sm text-cap-pimento" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-gray-500">
        Solo aircrew flight plans (airports + full-route G1000 export) stay under{' '}
        <Link to="/flight-plans" className="text-cap-ultramarine font-medium hover:underline">
          Flight Plans
        </Link>
        .
      </p>
    </section>
  )
}
