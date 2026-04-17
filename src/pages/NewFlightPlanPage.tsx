import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { db } from '@/db/schema'
import { generateId } from '@/utils/id'
import { convertWaypointNameToG1000 } from '@/utils/g1000WaypointName'
import { apiService, type AirportResult } from '@/services/api'
import { FlightPlanLoadMethodHelpModal } from '@/components/FlightPlanLoadMethodHelpModal'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'

const HINT_FP_NAME = 'flightPlans.new.planName'
const HINT_FP_AIRPORTS = 'flightPlans.new.airports'
const HINT_FP_LOAD = 'flightPlans.new.loadMethod'
const HINT_FP_CREATE = 'flightPlans.new.create'

type FormData = {
  name: string
  departureCode: string
  destinationCode: string
  /** e.g. IR109 — combined with suffix-only sequence tokens as IR109-AM */
  routeIdentifier: string
  waypointSequence: string
}

type RoutePreview =
  | { count: number; routeId: string; resolvedCount?: number; totalTokens?: number }
  | { error: string }

type LoadMethod = 'route' | 'sequence' | 'sequenceLibrary'

export function NewFlightPlanPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadMethod, setLoadMethod] = useState<LoadMethod>('route')
  const [routeInput, setRouteInput] = useState('')
  const [entryWaypoint, setEntryWaypoint] = useState('A')
  const [exitWaypoint, setExitWaypoint] = useState('Q')
  const [departureAirport, setDepartureAirport] = useState<AirportResult | null>(null)
  const [destinationAirport, setDestinationAirport] = useState<AirportResult | null>(null)
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null)
  const [fetchingAirport, setFetchingAirport] = useState<'departure' | 'destination' | null>(null)
  const [fetchingRoute, setFetchingRoute] = useState(false)
  const [sequencePreview, setSequencePreview] = useState<RoutePreview | null>(null)
  const [fetchingSequence, setFetchingSequence] = useState(false)
  const [showFlightPlanHelp, setShowFlightPlanHelp] = useState(false)
  const { isSeen, markSeen, resetAll } = useHintsSeen()
  const destinationCodeInputRef = useRef<HTMLInputElement | null>(null)

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: '',
      departureCode: '',
      destinationCode: '',
      routeIdentifier: '',
      waypointSequence: '',
    },
  })

  const depCode = watch('departureCode')
  const destCode = watch('destinationCode')
  const routeIdentifierWatch = watch('routeIdentifier')
  const waypointSequenceWatch = watch('waypointSequence')

  const normalizeFlightPlanNameInput = (value: string): string => {
    // Uppercase IR / VR / SR for MTR-style names as soon as the prefix is typed (before digits too),
    // when it looks like a route id (not a substring like "iron": require digit, space, or end next).
    return value.replace(/(^|[\s(])(ir|vr|sr)(?=\d|\s|$)/gi, (_, sep: string, code: string) => {
      return `${sep}${code.toUpperCase()}`
    })
  }

  const nameField = register('name', { required: 'Name is required' })
  const destinationCodeField = register('destinationCode')

  useEffect(() => {
    setDepartureAirport(null)
  }, [depCode])
  useEffect(() => {
    setDestinationAirport(null)
  }, [destCode])
  useEffect(() => {
    setRoutePreview(null)
  }, [routeInput, entryWaypoint, exitWaypoint])

  useEffect(() => {
    setSequencePreview(null)
  }, [routeIdentifierWatch, waypointSequenceWatch, loadMethod])

  const fetchDepartureAirport = async () => {
    const code = depCode?.trim()
    if (!code) return
    setFetchingAirport('departure')
    setError(null)
    try {
      const airport = await apiService.fetchAirport(code)
      setDepartureAirport(airport)
      // Fetch disables the button and drops focus; move keyboard users to destination next.
      queueMicrotask(() => destinationCodeInputRef.current?.focus())
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

  const fetchSequencePreview = async () => {
    const seq = waypointSequenceWatch?.trim()
    if (!seq) {
      setSequencePreview({ error: 'Enter at least one waypoint suffix or full waypoint ID.' })
      return
    }
    const routeId = routeIdentifierWatch?.trim() ?? ''
    if (routeId && !parseRouteInput(routeId)) {
      setSequencePreview({ error: 'Invalid route identifier. Use IR109, SR45, or VR108.' })
      return
    }
    setFetchingSequence(true)
    setError(null)
    setSequencePreview(null)
    try {
      const parts = seq.split(/[\s,]+/).filter(Boolean)

      if (loadMethod === 'sequenceLibrary') {
        const seenG1000 = new Set<string>()
        const duplicateLabels: string[] = []
        const uniqueResolved: { resolved: string; g1000: string }[] = []
        for (const part of parts) {
          const resolved = resolveWaypointToken(routeId || undefined, part)
          if (!resolved) continue
          const g1000 = convertWaypointNameToG1000(resolved)
          if (seenG1000.has(g1000)) {
            duplicateLabels.push(`${part.trim().toUpperCase()} → ${g1000}`)
            continue
          }
          seenG1000.add(g1000)
          uniqueResolved.push({ resolved, g1000 })
        }
        if (uniqueResolved.length === 0) {
          setSequencePreview({
            error:
              duplicateLabels.length > 0
                ? 'Every token duplicates an earlier G1000 waypoint name. List each unique point only once.'
                : 'No waypoints resolved. Set Route identifier and suffixes, or use full waypoint IDs.',
          })
          return
        }
        let found = 0
        for (const { resolved } of uniqueResolved) {
          const parsed = parseWaypointCode(resolved)
          if (!parsed) continue
          const coords = await apiService.fetchWaypointCoordinate(
            parsed.routeType,
            parsed.routeNumber,
            parsed.waypointLetter
          )
          if (coords) found++
        }
        if (found === 0) {
          setSequencePreview({
            error:
              'No waypoints found in the database for your unique list. Check identifiers and the MTR database.',
          })
        } else {
          setSequencePreview({
            count: found,
            routeId: `${found} unique in DB / ${uniqueResolved.length} unique / ${parts.length} tokens${
              duplicateLabels.length ? ` (${duplicateLabels.length} duplicate G1000 names skipped)` : ''
            }`,
          })
        }
        return
      }

      let found = 0
      for (const part of parts) {
        const resolved = resolveWaypointToken(routeId || undefined, part)
        if (!resolved) continue
        const parsed = parseWaypointCode(resolved)
        if (!parsed) continue
        const coords = await apiService.fetchWaypointCoordinate(
          parsed.routeType,
          parsed.routeNumber,
          parsed.waypointLetter
        )
        if (coords) found++
      }
      if (found === 0) {
        setSequencePreview({
          error:
            'No waypoints found. Check route identifier and suffixes (e.g. IR109 + AM, P1, AQ), or use full IDs like IR109-AM.',
        })
      } else {
        setSequencePreview({
          count: found,
          resolvedCount: found,
          totalTokens: parts.length,
          routeId: `${found}/${parts.length} resolved`,
        })
      }
    } catch {
      setSequencePreview({ error: 'Failed to fetch waypoint data. Check your connection.' })
    } finally {
      setFetchingSequence(false)
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
      let postCreateDuplicateMessage = ''

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
      } else if (
        (loadMethod === 'sequence' || loadMethod === 'sequenceLibrary') &&
        data.waypointSequence.trim()
      ) {
        const routeId = data.routeIdentifier.trim()
        if (routeId && !parseRouteInput(routeId)) {
          setError('Invalid route identifier. Use IR109, SR45, or VR108.')
          setLoading(false)
          return
        }
        if (loadMethod === 'sequenceLibrary') {
          const d = data.departureCode.trim().toUpperCase()
          const dst = data.destinationCode.trim().toUpperCase()
          if (!d || !dst) {
            setError(
              'G1000 user waypoint library requires both departure and destination (ICAO or FAA location ID / NASR identifier), and they must be different.'
            )
            setLoading(false)
            return
          }
          if (d === dst) {
            setError(
              'G1000 user waypoint library cannot be used for round-robin flights (same departure and destination). Use standard Waypoint sequence or Load full route for that case.'
            )
            setLoading(false)
            return
          }
        }
        const parts = data.waypointSequence.split(/[\s,]+/).filter(Boolean)
        const skipped: string[] = []
        const duplicateSkipped: string[] = []
        const seenG1000Library = new Set<string>()
        for (let i = 0; i < parts.length; i++) {
          const raw = parts[i]
          const resolved = resolveWaypointToken(routeId || undefined, raw)
          if (!resolved) {
            const label = raw.trim().toUpperCase()
            skipped.push(label)
            pendingWithPosition.push({ code: label, sequence: i })
            continue
          }
          const parsed = parseWaypointCode(resolved)
          if (!parsed) {
            skipped.push(resolved)
            pendingWithPosition.push({ code: resolved, sequence: i })
            continue
          }
          const g1000Name = convertWaypointNameToG1000(resolved)
          if (loadMethod === 'sequenceLibrary' && seenG1000Library.has(g1000Name)) {
            duplicateSkipped.push(`${raw.trim().toUpperCase()} (${g1000Name})`)
            continue
          }
          const coords = await apiService.fetchWaypointCoordinate(
            parsed.routeType,
            parsed.routeNumber,
            parsed.waypointLetter
          )
          if (coords) {
            if (loadMethod === 'sequenceLibrary') {
              seenG1000Library.add(g1000Name)
            }
            waypoints.push({
              originalName: resolved,
              g1000Name,
              lat: coords.latitude,
              lon: coords.longitude,
              routeType: parsed.routeType,
              sequence: loadMethod === 'sequenceLibrary' ? waypoints.length : i,
            })
          } else {
            skipped.push(resolved)
            pendingWithPosition.push({ code: resolved, sequence: i })
          }
        }
        skippedWaypoints = skipped
        if (duplicateSkipped.length > 0) {
          postCreateDuplicateMessage =
            `Omitted ${duplicateSkipped.length} duplicate token(s) (same G1000 name as an earlier point): ${duplicateSkipped.join(', ')}. `
        }
      }

      const creationLoadMethod =
        loadMethod === 'route'
          ? 'route'
          : loadMethod === 'sequenceLibrary'
            ? 'sequenceLibrary'
            : 'sequence'

      await db.flightPlans.add({
        id: planId,
        name: data.name || 'Untitled Flight Plan',
        dateCreated: now,
        dateModified: now,
        departureAirportId,
        destinationAirportId,
        isActive: false,
        creationLoadMethod,
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
      } else if (
        (loadMethod === 'sequence' || loadMethod === 'sequenceLibrary') &&
        data.waypointSequence.trim() &&
        waypoints.length === 0
      ) {
        setError(
          'No waypoints resolved. Set Route identifier (e.g. IR109) and suffixes (AM, P1, AQ), or enter full IDs like IR109-AM.'
        )
      } else {
        const skipMessage =
          skippedWaypoints.length > 0
            ? `Could not find ${skippedWaypoints.length} waypoint(s) in the database: ${skippedWaypoints.join(', ')}. The MTR database may be incomplete compared to current AP/1B.`
            : ''
        const combinedMessage = [postCreateDuplicateMessage.trim(), skipMessage].filter(Boolean).join(' ')
        const showPostCreateInfo =
          postCreateDuplicateMessage.length > 0 || skippedWaypoints.length > 0
        navigate(`/flight-plans/${planId}`, {
          state: showPostCreateInfo
            ? {
                skippedWaypoints:
                  skippedWaypoints.length > 0 ? skippedWaypoints : undefined,
                message: combinedMessage || undefined,
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

  const isSequencePreviewFailed =
    (loadMethod === 'sequence' || loadMethod === 'sequenceLibrary') &&
    !!waypointSequenceWatch?.trim() &&
    sequencePreview !== null &&
    'error' in sequencePreview

  const librarySequenceInvalid =
    loadMethod === 'sequenceLibrary' &&
    (!depCode?.trim() ||
      !destCode?.trim() ||
      depCode.trim().toUpperCase() === destCode.trim().toUpperCase())

  return (
    <div className="app-page-shell overflow-auto">
      <div className="app-panel max-w-2xl mx-auto p-6 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => navigate('/flight-plans')}
          className="text-cap-ultramarine hover:underline shrink-0"
        >
          ← Back
        </button>
        <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">New Flight Plan</h1>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={resetAll}
              className="px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
              aria-label="Reset guided tour hints"
            >
              Reset hints
            </button>
            <button
              type="button"
              onClick={() => setShowFlightPlanHelp(true)}
              className="p-2 text-cap-pimento hover:bg-red-50 rounded-full"
              aria-label="Help: waypoint loading options"
            >
              ❓
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="flight-plan-name">
              Name
            </label>
            <GuidedHint
              hintId={HINT_FP_NAME}
              stepNumber={1}
              title="Flight plan name"
              body="Use a name that matches what you use in ForeFlight so the plan and export stay easy to recognize. For MTR-style IDs, IR, VR, and SR are uppercased as you type (before the digits)."
              isSeen={isSeen(HINT_FP_NAME)}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
          <input
            id="flight-plan-name"
            type="text"
            {...nameField}
            onChange={(e) => {
              const el = e.target as HTMLInputElement
              el.value = normalizeFlightPlanNameInput(el.value)
              void nameField.onChange(e)
            }}
            placeholder="e.g. IR111 Survey"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent"
          />
          {errors.name && (
            <p className="text-cap-pimento text-sm mt-1">{errors.name.message}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-medium text-gray-700">Departure &amp; destination</span>
            <GuidedHint
              hintId={HINT_FP_AIRPORTS}
              stepNumber={2}
              title="Airport identifiers"
              body="Enter ICAO or FAA location / NASR identifiers, then tap Fetch for each field. You need both airports resolved (green confirmation) before creating the plan—the app uses them for the G1000 flight plan header and for some load modes."
              isSeen={isSeen(HINT_FP_AIRPORTS)}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Departure (ICAO or FAA location ID / NASR identifier)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                {...register('departureCode')}
                placeholder="e.g. KABQ or 0E0"
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
              Destination (ICAO or FAA location ID / NASR identifier)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                {...destinationCodeField}
                ref={(el) => {
                  destinationCodeField.ref(el)
                  destinationCodeInputRef.current = el
                }}
                placeholder="e.g. KPRZ or 0E0"
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
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-medium text-gray-700">Waypoint loading</span>
            <GuidedHint
              hintId={HINT_FP_LOAD}
              stepNumber={3}
              title="How waypoints are loaded"
              body="Load full route: segment between entry and exit on one published route. Waypoint sequence: type tokens (suffixes or full IDs) for one or blended routes. G1000 user waypoint library: import-focused list with unique G1000 names—requires two different airport identifiers (not round-robin). Use the ? help for full detail."
              isSeen={isSeen(HINT_FP_LOAD)}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
          <div className="flex flex-col gap-2 mb-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={loadMethod === 'route'}
                onChange={() => setLoadMethod('route')}
              />
              Load full route
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={loadMethod === 'sequence'}
                onChange={() => setLoadMethod('sequence')}
              />
              Waypoint sequence
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="mt-1"
                checked={loadMethod === 'sequenceLibrary'}
                onChange={() => setLoadMethod('sequenceLibrary')}
              />
              <span>
                <span className="font-medium">G1000 user waypoint library</span>
                <span className="block text-xs text-gray-600 font-normal mt-0.5">
                  Unique G1000 names only—good for importing a clean waypoint list into the avionics.
                  Requires <strong>different</strong> departure and destination identifiers (ICAO
                  or FAA location ID / NASR—not round-robin).
                </span>
              </span>
            </label>
          </div>
          {librarySequenceInvalid && loadMethod === 'sequenceLibrary' && (
            <p className="text-sm text-cap-pimento mb-2">
              Enter two different airport identifiers (ICAO or FAA location ID / NASR identifier).
              Round-robin (same airport both ends) is not available for this mode—use Waypoint
              sequence or Load full route instead.
            </p>
          )}
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
                    'error' in routePreview ? 'text-cap-pimento' : 'text-green-700'
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
          {(loadMethod === 'sequence' || loadMethod === 'sequenceLibrary') && (
            <div className="space-y-3">
              {loadMethod === 'sequenceLibrary' && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-950">
                  <p className="font-medium mb-1">Import-focused list</p>
                  <p>
                    Duplicate tokens that resolve to the same G1000 name are skipped. After import,
                    you can delete this flight plan from the G1000 catalog; user waypoints typically
                    remain until you remove them. Clear survey-specific user waypoints at end of
                    season—fixes can change next year.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Route identifier (optional) — Leave blank for blended routes
                </label>
                <input
                  type="text"
                  {...register('routeIdentifier')}
                  placeholder="e.g. IR109"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent uppercase"
                />
                <p className="text-xs text-gray-500 mt-1">
                  If set, list only <strong>waypoint suffixes</strong> below (e.g.{' '}
                  <code className="bg-gray-100 px-0.5 rounded">AM, P1, AQ</code>
                  ). The app resolves{' '}
                  <code className="bg-gray-100 px-0.5 rounded">IR109-AM</code>, fetches coordinates
                  like full-route mode, then builds G1000 names (
                  <code className="bg-gray-100 px-0.5 rounded">AM109</code>,{' '}
                  <code className="bg-gray-100 px-0.5 rounded">P1109</code>, …). For a{' '}
                  <strong>blended</strong> sequence that mixes two or more routes (e.g. SR213 and
                  SR214), leave this blank and enter each point as a full waypoint ID below (
                  <code className="bg-gray-100 px-0.5 rounded">SR213A</code>,{' '}
                  <code className="bg-gray-100 px-0.5 rounded">SR214D</code>, …). You can also leave
                  blank for a single route if you prefer typing full IDs (
                  <code className="bg-gray-100 px-0.5 rounded">IR109-AM</code>,{' '}
                  <code className="bg-gray-100 px-0.5 rounded">VR108EK</code>).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Waypoint sequence (comma or space separated)
                </label>
                <div className="flex gap-2">
                  <Controller
                    name="waypointSequence"
                    control={control}
                    render={({ field }) => (
                      <input
                        type="text"
                        ref={field.ref}
                        name={field.name}
                        onBlur={field.onBlur}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        placeholder="With route ID: AM, P1 — full or blended: IR109-AM, SR213A, SR214D"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent"
                      />
                    )}
                  />
                  <button
                    type="button"
                    onClick={fetchSequencePreview}
                    disabled={!waypointSequenceWatch?.trim() || fetchingSequence}
                    className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50 whitespace-nowrap"
                  >
                    {fetchingSequence ? '...' : 'Fetch'}
                  </button>
                </div>
                {sequencePreview && (
                  <p
                    className={`text-sm mt-1.5 font-medium ${
                      'error' in sequencePreview ? 'text-cap-pimento' : 'text-green-700'
                    }`}
                  >
                    {'error' in sequencePreview ? (
                      sequencePreview.error
                    ) : (
                      <>
                        ✓ {sequencePreview.count} waypoint(s) found ({sequencePreview.routeId})
                        {typeof sequencePreview.resolvedCount === 'number' &&
                          typeof sequencePreview.totalTokens === 'number' &&
                          sequencePreview.resolvedCount < sequencePreview.totalTokens && (
                            <>
                              {' '}
                              <strong>
                                <em>add coordinates on page after “Create Flight Plan”</em>
                              </strong>
                            </>
                          )}
                      </>
                    )}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  <strong>Blended routes</strong> (waypoints on more than one published route): leave
                  Route identifier blank and enter each waypoint in full (
                  <code className="bg-gray-100 px-0.5 rounded">SR213A</code>,{' '}
                  <code className="bg-gray-100 px-0.5 rounded">SR214D</code>, …)—suffix-only tokens
                  are not enough because they assume one route. <strong>Single route:</strong> either
                  set Route identifier and use suffixes, or leave it blank and use full IDs (
                  <code className="bg-gray-100 px-0.5 rounded">IR107A</code>,{' '}
                  <code className="bg-gray-100 px-0.5 rounded">IR109-P1</code>). Missing points are
                  listed on the flight plan for manual coordinates.
                </p>
                {loadMethod === 'sequence' && (
                  <p className="text-xs text-gray-500 mt-2">
                    Repeating the same waypoint in this list is allowed when departure and
                    destination differ. The exported <code className="bg-gray-100 px-0.5">.fpl</code>{' '}
                    deduplicates the waypoint <em>table</em> for the G1000 while keeping your full
                    route order.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-cap-pimento text-sm">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <GuidedHint
            hintId={HINT_FP_CREATE}
            stepNumber={4}
            title="Create Flight Plan"
            body="Creates the plan in this device’s database and opens the flight plan detail page. If any waypoints are missing coordinates, you can fill them there, then export a .fpl for the G1000 when ready."
            isSeen={isSeen(HINT_FP_CREATE)}
            onDismiss={markSeen}
            surface="light"
          />
          <button
            type="submit"
            disabled={
              loading ||
              librarySequenceInvalid ||
              isRoutePreviewFailed ||
              isSequencePreviewFailed
            }
            className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Flight Plan'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/flight-plans')}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900"
          >
            Cancel
          </button>
        </div>
      </form>
      </div>

      <FlightPlanLoadMethodHelpModal
        isOpen={showFlightPlanHelp}
        onClose={() => setShowFlightPlanHelp(false)}
      />
    </div>
  )
}

/**
 * Build full MTR id (e.g. IR109-AM) from optional route identifier + token.
 * If token is already a full waypoint id, it is returned unchanged.
 */
function resolveWaypointToken(
  routeIdentifier: string | undefined,
  token: string
): string | null {
  const t = token.trim().toUpperCase()
  if (!t) return null

  if (parseWaypointCode(t)) {
    return t
  }

  const rid = (routeIdentifier ?? '').trim().toUpperCase()
  if (!rid) return null

  const route = parseRouteInput(rid)
  if (!route) return null

  const suffix = t.replace(/^-+/, '')
  if (!suffix || !/^[A-Z0-9]+$/.test(suffix)) return null

  return `${route.routeType}${route.routeNumber}-${suffix}`
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
  // Optional hyphen after route number (IR111-A) or concatenated (IR111A)
  const match = rest.match(/^(\d+)(?:-)?([A-Z0-9]+)$/)
  if (!match) return null
  return {
    routeType,
    routeNumber: match[1],
    waypointLetter: match[2],
  }
}
