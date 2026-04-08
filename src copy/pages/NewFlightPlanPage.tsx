import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { db } from '@/db/schema'
import { generateId } from '@/utils/id'
import { apiService, type AirportResult } from '@/services/api'

type FormData = {
  name: string
  departureCode: string
  destinationCode: string
  waypointSequence: string
}

type RoutePreview = { count: number; routeId: string } | { error: string }

export function NewFlightPlanPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadMethod, setLoadMethod] = useState<'sequence' | 'route'>('route')
  const [routeInput, setRouteInput] = useState('')
  const [entryWaypoint, setEntryWaypoint] = useState('A')
  const [exitWaypoint, setExitWaypoint] = useState('Q')
  const [departureAirport, setDepartureAirport] = useState<AirportResult | null>(null)
  const [destinationAirport, setDestinationAirport] = useState<AirportResult | null>(null)
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null)
  const [fetchingAirport, setFetchingAirport] = useState<'departure' | 'destination' | null>(null)
  const [fetchingRoute, setFetchingRoute] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: '',
      departureCode: '',
      destinationCode: '',
      waypointSequence: '',
    },
  })

  const depCode = watch('departureCode')
  const destCode = watch('destinationCode')

  useEffect(() => {
    setDepartureAirport(null)
  }, [depCode])
  useEffect(() => {
    setDestinationAirport(null)
  }, [destCode])
  useEffect(() => {
    setRoutePreview(null)
  }, [routeInput, entryWaypoint, exitWaypoint])

  const fetchDepartureAirport = async () => {
    const code = depCode?.trim()
    if (!code) return
    setFetchingAirport('departure')
    setError(null)
    try {
      const airport = await apiService.fetchAirport(code)
      setDepartureAirport(airport)
    } catch {
      setDepartureAirport(null)
      setError(`Could not find airport: ${code}`)
    } finally {
      setFetchingAirport(null)
    }
  }

  const fetchDestinationAirport = async () => {
    const code = destCode?.trim()
    if (!code) return
    setFetchingAirport('destination')
    setError(null)
    try {
      const airport = await apiService.fetchAirport(code)
      setDestinationAirport(airport)
    } catch {
      setDestinationAirport(null)
      setError(`Could not find airport: ${code}`)
    } finally {
      setFetchingAirport(null)
    }
  }

  const fetchRoutePreview = async () => {
    const input = routeInput.trim()
    if (!input) return
    const parsed = parseRouteInput(input)
    if (!parsed) {
      setRoutePreview({ error: 'Invalid route format. Use IR111, SR45, or VR108.' })
      return
    }
    setFetchingRoute(true)
    setError(null)
    setRoutePreview(null)
    try {
      const entry = entryWaypoint.trim() || 'A'
      const exit = exitWaypoint.trim() || 'Q'
      const allWps = await apiService.fetchRouteData(
        parsed.routeType,
        parsed.routeNumber,
        entry,
        exit
      )
      if (allWps.length === 0) {
        setRoutePreview({ error: `No waypoints found for ${input}. Check the route ID.` })
      } else {
        const segment = apiService.extractRouteSegment(allWps, entry, exit)
        if (segment.length === 0) {
          setRoutePreview({
            error: `Entry "${entryWaypoint}" to Exit "${exitWaypoint}" produced no waypoints. Check the segment.`,
          })
        } else {
          setRoutePreview({
            count: segment.length,
            routeId: `${input} (${entryWaypoint || 'A'}–${exitWaypoint || 'Q'})`,
          })
        }
      }
    } catch {
      setRoutePreview({ error: 'Failed to fetch route data. Check your connection.' })
    } finally {
      setFetchingRoute(false)
    }
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const planId = generateId()

      let departureAirportId: string | undefined
      let destinationAirportId: string | undefined

      if (data.departureCode.trim()) {
        const dep =
          departureAirport?.identifier?.toUpperCase() === data.departureCode.trim().toUpperCase()
            ? departureAirport
            : await apiService.fetchAirport(data.departureCode.trim())
        if (dep) {
          const depId = generateId()
          await db.airports.add({
            id: depId,
            identifier: dep.identifier,
            name: dep.name,
            latitude: dep.latitude,
            longitude: dep.longitude,
            elevation: dep.elevation,
          })
          departureAirportId = depId
        }
      }
      if (data.destinationCode.trim()) {
        const dest =
          destinationAirport?.identifier?.toUpperCase() === data.destinationCode.trim().toUpperCase()
            ? destinationAirport
            : await apiService.fetchAirport(data.destinationCode.trim())
        if (dest) {
          const destId = generateId()
          await db.airports.add({
            id: destId,
            identifier: dest.identifier,
            name: dest.name,
            latitude: dest.latitude,
            longitude: dest.longitude,
            elevation: dest.elevation,
          })
          destinationAirportId = destId
        }
      }

      const waypoints: { originalName: string; g1000Name: string; lat: number; lon: number; routeType: 'IR' | 'SR' | 'VR'; sequence: number }[] = []
      let skippedWaypoints: string[] = []
      let pendingWithPosition: { code: string; sequence: number }[] = []

      if (loadMethod === 'route' && routeInput.trim()) {
        const parsed = parseRouteInput(routeInput.trim())
        if (parsed) {
          const entry = entryWaypoint.trim() || 'A'
          const exit = exitWaypoint.trim() || 'Q'
          const allRouteWps = await apiService.fetchRouteData(
            parsed.routeType,
            parsed.routeNumber,
            entry,
            exit
          )
          const segment = apiService.extractRouteSegment(allRouteWps, entry, exit)
          for (let i = 0; i < segment.length; i++) {
            waypoints.push({
              originalName: segment[i].originalName,
              g1000Name: segment[i].g1000Name,
              lat: segment[i].latitude,
              lon: segment[i].longitude,
              routeType: parsed.routeType,
              sequence: i,
            })
          }
        } else {
          setError('Invalid route. Use format IR111, SR45, or VR108')
          setLoading(false)
          return
        }
      } else if (loadMethod === 'sequence' && data.waypointSequence.trim()) {
        const parts = data.waypointSequence.split(/[\s,]+/).filter(Boolean)
        const skipped: string[] = []
        for (let i = 0; i < parts.length; i++) {
          const code = parts[i].trim().toUpperCase()
          const parsed = parseWaypointCode(code)
          if (!parsed) {
            skipped.push(code)
            pendingWithPosition.push({ code, sequence: i })
            continue
          }
          const coords = await apiService.fetchWaypointCoordinate(
            parsed.routeType,
            parsed.routeNumber,
            parsed.waypointLetter
          )
          if (coords) {
            waypoints.push({
              originalName: code,
              g1000Name: convertToG1000Name(code),
              lat: coords.latitude,
              lon: coords.longitude,
              routeType: parsed.routeType,
              sequence: i,
            })
          } else {
            skipped.push(code)
            pendingWithPosition.push({ code, sequence: i })
          }
        }
        skippedWaypoints = skipped
      }

      await db.flightPlans.add({
        id: planId,
        name: data.name || 'Untitled Flight Plan',
        dateCreated: now,
        dateModified: now,
        departureAirportId,
        destinationAirportId,
        isActive: false,
        pendingWaypoints:
          pendingWithPosition.length > 0 ? pendingWithPosition : undefined,
      })

      for (const wp of waypoints) {
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

      if (loadMethod === 'route' && waypoints.length === 0) {
        setError('No waypoints found for that route. Check the route ID (e.g. IR111, VR108).')
      } else {
        navigate(`/flight-plans/${planId}`, {
          state: skippedWaypoints.length > 0
            ? {
                skippedWaypoints,
                message:
                  `Could not find ${skippedWaypoints.length} waypoint(s) in the database: ${skippedWaypoints.join(', ')}. ` +
                  'The MTR database may be incomplete compared to current AP/1B.',
              }
            : undefined,
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create flight plan')
    } finally {
      setLoading(false)
    }
  }

  const isRoutePreviewFailed =
    loadMethod === 'route' &&
    !!routeInput.trim() &&
    routePreview !== null &&
    'error' in routePreview

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => navigate('/flight-plans')}
          className="text-cap-ultramarine hover:underline"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">New Flight Plan</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            {...register('name', { required: 'Name is required' })}
            placeholder="e.g. IR111 Survey"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent"
          />
          {errors.name && (
            <p className="text-cap-scarlet text-sm mt-1">{errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Departure (ICAO)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                {...register('departureCode')}
                placeholder="e.g. KABQ"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent uppercase"
              />
              <button
                type="button"
                onClick={fetchDepartureAirport}
                disabled={!depCode?.trim() || fetchingAirport !== null}
                className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50 whitespace-nowrap"
              >
                {fetchingAirport === 'departure' ? '...' : 'Fetch'}
              </button>
            </div>
            {departureAirport && (
              <p className="text-sm text-green-700 mt-1.5 font-medium">
                {departureAirport.name}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination (ICAO)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                {...register('destinationCode')}
                placeholder="e.g. KPRZ"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent uppercase"
              />
              <button
                type="button"
                onClick={fetchDestinationAirport}
                disabled={!destCode?.trim() || fetchingAirport !== null}
                className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50 whitespace-nowrap"
              >
                {fetchingAirport === 'destination' ? '...' : 'Fetch'}
              </button>
            </div>
            {destinationAirport && (
              <p className="text-sm text-green-700 mt-1.5 font-medium">
                {destinationAirport.name}
              </p>
            )}
          </div>
        </div>

        <div>
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={loadMethod === 'sequence'}
                onChange={() => setLoadMethod('sequence')}
              />
              Waypoint sequence
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={loadMethod === 'route'}
                onChange={() => setLoadMethod('route')}
              />
              Load full route
            </label>
          </div>
          {loadMethod === 'route' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Route ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={routeInput}
                    onChange={(e) => setRouteInput(e.target.value.toUpperCase())}
                    placeholder="e.g. IR111, SR45, VR108"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent uppercase"
                  />
                  <button
                    type="button"
                    onClick={fetchRoutePreview}
                    disabled={!routeInput.trim() || fetchingRoute}
                    className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50 whitespace-nowrap"
                  >
                    {fetchingRoute ? '...' : 'Fetch'}
                  </button>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entry waypoint
                  </label>
                  <input
                    type="text"
                    value={entryWaypoint}
                    onChange={(e) => setEntryWaypoint(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
                    placeholder="e.g. A"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent uppercase"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Exit waypoint
                  </label>
                  <input
                    type="text"
                    value={exitWaypoint}
                    onChange={(e) => setExitWaypoint(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))}
                    placeholder="e.g. Q"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent uppercase"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Loads the segment from Entry to Exit (e.g. A–Q for IR111 primary route)
              </p>
              {routePreview && (
                <p
                  className={`text-sm mt-1.5 font-medium ${
                    'error' in routePreview ? 'text-cap-scarlet' : 'text-green-700'
                  }`}
                >
                  {'error' in routePreview ? (
                    routePreview.error
                  ) : (
                    <>✓ {routePreview.count} waypoints found for {routePreview.routeId}</>
                  )}
                </p>
              )}
            </div>
          )}
          {loadMethod === 'sequence' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Waypoints (comma or space separated)
              </label>
              <input
                type="text"
                {...register('waypointSequence')}
                placeholder="e.g. IR111A, VR108EK"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Format: IR/SR/VR + number + letter(s), e.g. IR107A, VR108EK. If a waypoint is
                not found (e.g. in AP/1B but missing from our database), it will be skipped and
                you&apos;ll see a warning on the flight plan.
              </p>
            </div>
          )}
        </div>

        {error && (
          <p className="text-cap-scarlet text-sm">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || isRoutePreviewFailed}
            className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Flight Plan'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/flight-plans')}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function parseRouteInput(
  input: string
): { routeType: 'IR' | 'SR' | 'VR'; routeNumber: string } | null {
  const upper = input.toUpperCase().trim()
  const match = upper.match(/^(IR|SR|VR)(\d+)$/)
  if (!match) return null
  return {
    routeType: match[1] as 'IR' | 'SR' | 'VR',
    routeNumber: match[2],
  }
}

function parseWaypointCode(
  code: string
): { routeType: 'IR' | 'SR' | 'VR'; routeNumber: string; waypointLetter: string } | null {
  const upper = code.toUpperCase().trim()
  let routeType: 'IR' | 'SR' | 'VR' | null = null
  if (upper.startsWith('IR')) routeType = 'IR'
  else if (upper.startsWith('SR')) routeType = 'SR'
  else if (upper.startsWith('VR')) routeType = 'VR'
  if (!routeType) return null
  const rest = upper.slice(2)
  const match = rest.match(/^(\d+)([A-Z]+)$/)
  if (!match) return null
  return {
    routeType,
    routeNumber: match[1],
    waypointLetter: match[2],
  }
}

function convertToG1000Name(original: string): string {
  const upper = original.toUpperCase()
  const match = upper.match(/^(IR|SR|VR)(\d+)([A-Z]+)$/)
  if (!match) return original.slice(0, 8).replace(/[^A-Z0-9]/g, '')
  const [, , num, suffix] = match
  const combined = suffix + num
  return combined.slice(0, 8)
}
