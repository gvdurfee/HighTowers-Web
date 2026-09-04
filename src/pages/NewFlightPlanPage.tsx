import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { db } from '@/db/schema'
import type { FlightPlanRecord, WaypointRecord, FlightPlanCreationLoadMethod } from '@/db/schema'
import { generateId } from '@/utils/id'
import { convertWaypointNameToG1000 } from '@/utils/g1000WaypointName'
import { apiService, type AirportResult } from '@/services/api'
import { FlightPlanLoadMethodHelpModal } from '@/components/FlightPlanLoadMethodHelpModal'
import { parseWaypointCode, waypointIdentityKey } from '@/utils/mtrWaypointCode'
import {
  normalizeWaypointToken,
  parseRouteInput,
  resolveWaypointToken,
} from '@/utils/mtrRouteInput'
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
  /** e.g. IR109 — combined with suffix-only sequence waypoints as IR109-AM */
  routeIdentifier: string
  waypointSequence: string
}

type RoutePreview =
  | { count: number; routeId: string; resolvedCount?: number; totalListedWaypoints?: number }
  | { error: string }

type LoadMethod = 'route' | 'sequence'

export function NewFlightPlanPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editPlanId = searchParams.get('edit')
  const isEditing = Boolean(editPlanId)
  const [loading, setLoading] = useState(false)
  const [hydrating, setHydrating] = useState(Boolean(editPlanId))
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
    setValue,
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
    if (!editPlanId) {
      setHydrating(false)
      return
    }
    let cancelled = false
    const hydrate = async () => {
      setHydrating(true)
      setError(null)
      try {
        const plan = await db.flightPlans.get(editPlanId)
        if (!plan) {
          if (!cancelled) {
            setError('Flight plan not found. Return to Flight Plans and open the plan again.')
            setHydrating(false)
          }
          return
        }
        const wps = await db.waypoints.where('flightPlanId').equals(editPlanId).sortBy('sequence')
        const method: LoadMethod =
          plan.creationLoadMethod === 'route' ? 'route' : 'sequence'
        if (cancelled) return
        setLoadMethod(method)
        setValue('name', plan.name)
        if (plan.departureAirportId) {
          const dep = await db.airports.get(plan.departureAirportId)
          if (dep && !cancelled) {
            setValue('departureCode', dep.identifier)
            setDepartureAirport({
              identifier: dep.identifier,
              name: dep.name,
              latitude: dep.latitude,
              longitude: dep.longitude,
              elevation: dep.elevation,
            })
          }
        }
        if (plan.destinationAirportId) {
          const dest = await db.airports.get(plan.destinationAirportId)
          if (dest && !cancelled) {
            setValue('destinationCode', dest.identifier)
            setDestinationAirport({
              identifier: dest.identifier,
              name: dest.name,
              latitude: dest.latitude,
              longitude: dest.longitude,
              elevation: dest.elevation,
            })
          }
        }
        if (method === 'route') {
          const inferred = inferFullRouteFields(plan, wps)
          setRouteInput(inferred.routeInput)
          setEntryWaypoint(inferred.entry)
          setExitWaypoint(inferred.exit)
        } else {
          const inferred = inferSequenceFields(plan, wps)
          setValue('routeIdentifier', inferred.routeIdentifier)
          setValue('waypointSequence', inferred.waypointSequence)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load this flight plan for correction.')
        }
      } finally {
        if (!cancelled) setHydrating(false)
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [editPlanId, setValue])

  useEffect(() => {
    setDepartureAirport((prev) => {
      if (prev && depCode?.trim().toUpperCase() === prev.identifier.toUpperCase()) return prev
      return null
    })
  }, [depCode])
  useEffect(() => {
    setDestinationAirport((prev) => {
      if (prev && destCode?.trim().toUpperCase() === prev.identifier.toUpperCase()) return prev
      return null
    })
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
      const parts = seq
        .split(/[\s,]+/)
        .map(normalizeWaypointToken)
        .filter(Boolean)

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
            'No waypoints found. For IR/VR: check the route ID and that the local FAA server is running. For SR: confirm the sequence/route identifier (e.g. SR213 + G, or SR214H). Suffix-only entries need a route identifier.',
        })
      } else {
        setSequencePreview({
          count: found,
          resolvedCount: found,
          totalListedWaypoints: parts.length,
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
      const existingPlan = editPlanId ? await db.flightPlans.get(editPlanId) : undefined
      if (editPlanId && !existingPlan) {
        setError('Flight plan not found. Return to Flight Plans and open the plan again.')
        setLoading(false)
        return
      }
      const planId = existingPlan?.id ?? generateId()

      let departureAirportId: string | undefined
      let destinationAirportId: string | undefined

      if (data.departureCode.trim()) {
        departureAirportId = await resolveAirportRecordId({
          code: data.departureCode.trim(),
          fetched: departureAirport,
          existingAirportId: existingPlan?.departureAirportId,
        })
      }
      if (data.destinationCode.trim()) {
        destinationAirportId = await resolveAirportRecordId({
          code: data.destinationCode.trim(),
          fetched: destinationAirport,
          existingAirportId: existingPlan?.destinationAirportId,
        })
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
        const routeId = data.routeIdentifier.trim()
        if (routeId && !parseRouteInput(routeId)) {
          setError('Invalid route identifier. Use IR109, SR45, or VR108.')
          setLoading(false)
          return
        }
        const parts = data.waypointSequence
          .split(/[\s,]+/)
          .map(normalizeWaypointToken)
          .filter(Boolean)
        const skipped: string[] = []
        for (let i = 0; i < parts.length; i++) {
          const raw = parts[i]
          const resolved = resolveWaypointToken(routeId || undefined, raw)
          if (!resolved) {
            const label = raw.trim().toUpperCase()
            skipped.push(label)
            pendingWithPosition.push({
              code: label,
              sequence: i,
            })
            continue
          }
          const parsed = parseWaypointCode(resolved)
          if (!parsed) {
            skipped.push(resolved)
            pendingWithPosition.push({
              code: resolved,
              sequence: i,
            })
            continue
          }
          const g1000Name = convertWaypointNameToG1000(resolved)
          const coords = await apiService.fetchWaypointCoordinate(
            parsed.routeType,
            parsed.routeNumber,
            parsed.waypointLetter
          )
          if (coords) {
            waypoints.push({
              originalName: resolved,
              g1000Name,
              lat: coords.latitude,
              lon: coords.longitude,
              routeType: parsed.routeType,
              sequence: i,
            })
          } else {
            skipped.push(resolved)
            pendingWithPosition.push({
              code: resolved,
              sequence: i,
            })
          }
        }
        skippedWaypoints = skipped
      }

      if (existingPlan) {
        const priorWps = await db.waypoints.where('flightPlanId').equals(planId).toArray()
        const priorByKey = new Map(
          priorWps.map((w) => [waypointIdentityKey(w.originalName), w] as const)
        )
        const stillPending: { code: string; sequence: number }[] = []
        for (const pending of pendingWithPosition) {
          const prior = priorByKey.get(waypointIdentityKey(pending.code))
          if (prior) {
            waypoints.push({
              originalName: prior.originalName,
              g1000Name: prior.g1000Name,
              lat: prior.latitude,
              lon: prior.longitude,
              routeType: prior.routeType,
              sequence: pending.sequence,
            })
          } else {
            stillPending.push(pending)
          }
        }
        pendingWithPosition = stillPending
        skippedWaypoints = stillPending.map((p) => p.code)
      }

      const triedToLoadWaypoints =
        (loadMethod === 'route' && Boolean(routeInput.trim())) ||
        (loadMethod === 'sequence' && Boolean(data.waypointSequence.trim()))
      if (triedToLoadWaypoints && waypoints.length === 0 && pendingWithPosition.length === 0) {
        setError(
          loadMethod === 'route'
            ? 'No waypoints found for that route. Check the route ID (e.g. IR111, VR108).'
            : 'No waypoints resolved. Set Route identifier (e.g. IR109) and suffixes (AM, P1, AQ), or enter full IDs like IR109-AM.'
        )
        setLoading(false)
        return
      }

      const creationLoadMethod: FlightPlanCreationLoadMethod =
        loadMethod === 'route' ? 'route' : 'sequence'

      const snapshot = {
        creationLoadMethod,
        creationRouteIdentifier:
          loadMethod === 'route' ? undefined : data.routeIdentifier.trim() || undefined,
        creationWaypointSequence:
          loadMethod === 'route' ? undefined : data.waypointSequence.trim() || undefined,
        creationRouteInput: loadMethod === 'route' ? routeInput.trim() || undefined : undefined,
        creationEntryWaypoint: loadMethod === 'route' ? entryWaypoint.trim() || undefined : undefined,
        creationExitWaypoint: loadMethod === 'route' ? exitWaypoint.trim() || undefined : undefined,
      }

      if (existingPlan) {
        await db.waypoints.where('flightPlanId').equals(planId).delete()
        const nextPlan: FlightPlanRecord = {
          id: existingPlan.id,
          name: data.name || existingPlan.name,
          dateCreated: existingPlan.dateCreated,
          dateModified: now,
          isActive: existingPlan.isActive,
          departureAirportId,
          destinationAirportId,
          pendingWaypoints:
            pendingWithPosition.length > 0 ? pendingWithPosition : undefined,
          ...snapshot,
        }
        await db.flightPlans.put(nextPlan)
      } else {
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
          ...snapshot,
        })
      }

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

      const skipMessage =
        skippedWaypoints.length > 0
          ? `Could not find ${skippedWaypoints.length} waypoint(s) in the database: ${skippedWaypoints.join(', ')}. The MTR database may be incomplete compared to current AP/1B.`
          : ''
      const showPostCreateInfo = skippedWaypoints.length > 0
      const detailState = showPostCreateInfo
        ? {
            skippedWaypoints:
              skippedWaypoints.length > 0 ? skippedWaypoints : undefined,
            message: skipMessage || undefined,
          }
        : undefined
      navigate(`/flight-plans/${planId}`, { state: detailState })
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
    loadMethod === 'sequence' &&
    !!waypointSequenceWatch?.trim() &&
    sequencePreview !== null &&
    'error' in sequencePreview

  return (
    <div className="app-page-shell overflow-auto">
      <div className="app-panel max-w-2xl mx-auto p-6 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => navigate(isEditing && editPlanId ? `/flight-plans/${editPlanId}` : '/flight-plans')}
          className="text-cap-ultramarine hover:underline shrink-0"
        >
          ← Back
        </button>
        <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">
            {isEditing ? 'Correct Flight Plan' : 'New Flight Plan'}
          </h1>
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

      {hydrating && (
        <p className="text-sm text-gray-600 mb-4">Loading saved plan…</p>
      )}
      {isEditing && !hydrating && (
        <p className="text-sm text-gray-700 rounded-lg border border-cap-ultramarine/25 bg-slate-50 px-4 py-3 mb-6">
          Correct the waypoint loading for this saved plan, then press <strong>Update Flight Plan</strong>.
          Coordinates you already supplied are kept when that waypoint is still in the list. You return to
          the same detail page to finish.
        </p>
      )}

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
              body="Load full route: segment between entry and exit on one published route. Waypoint sequence: type waypoints (suffixes or full IDs) for one or blended routes. Use the ? help for full detail."
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
          {loadMethod === 'sequence' && (
            <div className="space-y-3">
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
                          typeof sequencePreview.totalListedWaypoints === 'number' &&
                          sequencePreview.resolvedCount < sequencePreview.totalListedWaypoints && (
                            <>
                              {' '}
                              <strong>
                                <em>add coordinates on the page after you save</em>
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
                  <code className="bg-gray-100 px-0.5 rounded">SR214D</code>, …)—suffix-only waypoints
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
            title={isEditing ? 'Update Flight Plan' : 'Create Flight Plan'}
            body={
              isEditing ? (
                <>
                  Rebuilds the waypoint list on this same plan and opens the detail page again. Coordinates you
                  already entered for a waypoint are kept if that point is still in the sequence. You must press{' '}
                  <strong>Update Flight Plan</strong> to save the correction.
                </>
              ) : (
                <>
                  Creates the plan in this device’s database and opens the flight plan detail page. You{' '}
                  <strong><em>must</em></strong> press Create Flight Plan to save before moving to another
                  function, otherwise the flight plan will need to be recreated. If a waypoint is missing or
                  extra on the next page, use <strong>Correct waypoint sequence</strong> instead of starting
                  over. If any waypoints are missing coordinates, fill them on the detail page, then export a
                  .fpl for the G1000 to your SD card when ready. When importing into the G1000, insert the SD
                  card into the top slot of the MFD <strong>before</strong> you power up the MFD. Otherwise, you
                  may see an error saying there is no flight plan to import.
                </>
              )
            }
            isSeen={isSeen(HINT_FP_CREATE)}
            onDismiss={markSeen}
            surface="light"
          />
          <button
            type="submit"
            disabled={
              loading ||
              hydrating ||
              isRoutePreviewFailed ||
              isSequencePreviewFailed
            }
            className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
          >
            {loading
              ? isEditing
                ? 'Updating...'
                : 'Creating...'
              : isEditing
                ? 'Update Flight Plan'
                : 'Create Flight Plan'}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEditing && editPlanId ? `/flight-plans/${editPlanId}` : '/flight-plans')}
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

function orderedOriginalNames(plan: FlightPlanRecord, wps: WaypointRecord[]): string[] {
  const pending = plan.pendingWaypoints ?? []
  const wpBySeq = new Map(wps.map((w) => [w.sequence, w.originalName]))
  const pendingBySeq = new Map(pending.map((p) => [p.sequence, p.code]))
  const seqs = [...new Set([...wpBySeq.keys(), ...pendingBySeq.keys()])].sort((a, b) => a - b)
  return seqs.map((seq) => wpBySeq.get(seq) ?? pendingBySeq.get(seq) ?? '').filter(Boolean)
}

function inferSequenceFields(
  plan: FlightPlanRecord,
  wps: WaypointRecord[]
): { routeIdentifier: string; waypointSequence: string } {
  if (plan.creationWaypointSequence?.trim()) {
    return {
      routeIdentifier: plan.creationRouteIdentifier?.trim() ?? '',
      waypointSequence: plan.creationWaypointSequence.trim(),
    }
  }
  const names = orderedOriginalNames(plan, wps)
  const storedRoute = plan.creationRouteIdentifier?.trim() ?? ''
  const parsed = names.map((n) => parseWaypointCode(n)).filter(Boolean) as NonNullable<
    ReturnType<typeof parseWaypointCode>
  >[]
  const commonRoute =
    storedRoute ||
    (parsed.length > 0 &&
    parsed.every(
      (p) => p.routeType === parsed[0].routeType && p.routeNumber === parsed[0].routeNumber
    )
      ? `${parsed[0].routeType}${parsed[0].routeNumber}`
      : '')
  if (!commonRoute) {
    return { routeIdentifier: '', waypointSequence: names.join(', ') }
  }
  const route = parseRouteInput(commonRoute)
  const tokens = names.map((n) => {
    const p = parseWaypointCode(n)
    if (p && route && p.routeType === route.routeType && p.routeNumber === route.routeNumber) {
      return p.waypointLetter
    }
    return n
  })
  return { routeIdentifier: commonRoute, waypointSequence: tokens.join(', ') }
}

function inferFullRouteFields(
  plan: FlightPlanRecord,
  wps: WaypointRecord[]
): { routeInput: string; entry: string; exit: string } {
  if (plan.creationRouteInput?.trim()) {
    return {
      routeInput: plan.creationRouteInput.trim(),
      entry: plan.creationEntryWaypoint?.trim() || 'A',
      exit: plan.creationExitWaypoint?.trim() || 'Q',
    }
  }
  const names = orderedOriginalNames(plan, wps)
  const first = names[0] ? parseWaypointCode(names[0]) : null
  const last = names[names.length - 1] ? parseWaypointCode(names[names.length - 1]) : null
  return {
    routeInput: first ? `${first.routeType}${first.routeNumber}` : '',
    entry: first?.waypointLetter || 'A',
    exit: last?.waypointLetter || 'Q',
  }
}

async function resolveAirportRecordId(input: {
  code: string
  fetched: AirportResult | null
  existingAirportId?: string
}): Promise<string | undefined> {
  const code = input.code.trim().toUpperCase()
  if (input.existingAirportId) {
    const existing = await db.airports.get(input.existingAirportId)
    if (existing && existing.identifier.toUpperCase() === code) {
      return existing.id
    }
  }
  const dep =
    input.fetched?.identifier?.toUpperCase() === code
      ? input.fetched
      : await apiService.fetchAirport(input.code.trim())
  if (!dep) return undefined
  const id = generateId()
  await db.airports.add({
    id,
    identifier: dep.identifier,
    name: dep.name,
    latitude: dep.latitude,
    longitude: dep.longitude,
    elevation: dep.elevation,
  })
  return id
}

