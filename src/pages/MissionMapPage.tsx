import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Map, MapRef, Source, Layer, Marker, NavigationControl } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { FlightPlanRecord, WaypointRecord, AirportRecord } from '@/db/schema'
import { apiConfig } from '@/config/apiConfig'
import { nearestWaypointInfo } from '@/utils/towerWaypointGeometry'
import { parseWaypointCode, publishedPointLabel } from '@/utils/mtrWaypointCode'
import { TowerLeaderMarker, TOWER_MAP_COLOR } from '@/components/TowerLeaderMarker'
import { GuidedHint } from '@/components/GuidedHint'
import { SortieProgressPanel } from '@/components/SortieProgressPanel'
import { MapViewCrewControls } from '@/components/MapViewCrewControls'
import { ShowAllSortieOverlaysButton } from '@/components/ShowAllSortieOverlaysButton'
import { OffsetRoutePanel, type OffsetMapGeometry } from '@/components/OffsetRoutePanel'
import { confirmLeaveOffsetPlan } from '@/services/offsetPlanLeaveGuard'
import { teamDispatchHasUnsaved, teamSortiesAreStale } from '@/services/teamDispatchUnsaved'
import { planIdFromMapSearch, teamPlanAwaitingSave } from '@/services/teamDispatchReview'
import type { OffsetLegWidth } from '@survey-planning/offsetRoutePlan.js'
import { expandPlanningRoute } from '@survey-planning/planComparison.js'
import { isSingleAircrewPlan, mapEmptyPathNotice, singleAircrewSortieHint } from '@/services/singleAircrewMap'
import {
  drawSavedTeam,
  formatSortieHeader,
  laneTurnSentence,
  legacySortieNote,
  mapSortieButtons,
  maxCourseChangeDeg,
  NO_TEAM_PLAN_NOTE,
  progressSummaryLines,
  teamProgressCatalog,
  teamSortieOffsetRoute,
} from '@/services/teamPlanRecord'
import { COVERED_LINE, coverageLines, REMAINING_LINE, type SortieProgress } from '@/services/teamPlanProgress'
import { crewOverlayColor, crewOverlayGroups, overlayFitCoordinates, type OverlayCrew } from '@/services/teamOverlayDisplay'
import { useHintsSeen } from '@/hooks/useHintsSeen'
import {
  emptyCrewOverlay,
  selectedCrewOverlay,
  serpentineFromTracks,
  sortieWaypointLine,
  type CrewOverlayId,
  type CrewSerpentine,
} from '@/services/crewSerpentineOverlay'
import { singleAircrewSortieTrack } from '@/services/singleAircrewSpur'
import {
  airportsForSortie,
  buildSerpentineDisplay,
  crewAirportNotes,
  DEFAULT_MAP_SORTIE,
  sortieNumberAfterCrewChange,
  labelPixelOffset,
  labelPlacement,
  markerPlacementAway,
  legArrowSizePx,
  MAP_ROUTE_BLUE,
  passesForSortie,
  SERPENTINE_YELLOW,
  type LonLat,
  type MapSortieNumber,
  type TransitAirport,
} from '@/services/serpentineDisplay'

type TowerOverlayItem = {
  id: string
  towerLat: number
  towerLon: number
  waypointLat: number
  waypointLon: number
  label: string
}

type PlanWithData = {
  plan: FlightPlanRecord
  waypoints: WaypointRecord[]
  departure: AirportRecord | null
  destination: AirportRecord | null
}

function buildRouteCoordinates(
  departure: AirportRecord | null,
  waypoints: WaypointRecord[],
  destination: AirportRecord | null
): [number, number][] {
  const coords: [number, number][] = []
  const pushIfFinite = (lon: number, lat: number) => {
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      coords.push([lon, lat])
    }
  }
  if (departure) {
    pushIfFinite(departure.longitude, departure.latitude)
  }
  const ordered = [...waypoints].sort((a, b) => a.sequence - b.sequence)
  for (const wp of ordered) {
    pushIfFinite(wp.longitude, wp.latitude)
  }
  if (destination) {
    pushIfFinite(destination.longitude, destination.latitude)
  }
  return coords
}

function lineFromPoints(points: { lon: number; lat: number }[] | undefined) {
  if (!points || points.length < 2) return null
  return lineFromCoordinates(points.map((point) => [point.lon, point.lat]))
}

function lineFromCoordinates(coordinates: [number, number][]) {
  if (coordinates.length < 2) return null
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates,
    },
  }
}

function shadeCollection(rings: LonLat[][]) {
  return {
    type: 'FeatureCollection' as const,
    features: rings
      .filter((ring) => ring.length >= 3)
      .map((ring) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...ring, ring[0]]],
        },
      })),
  }
}

function lineCollection(lines: LonLat[][]) {
  return {
    type: 'FeatureCollection' as const,
    features: lines
      .filter((line) => line.length >= 2)
      .map((coordinates) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates },
      })),
  }
}

function FlowArrow(props: {
  lon: number
  lat: number
  bearing: number
  label: string
  small?: boolean
}) {
  const [ox, oy] = labelPixelOffset(props.bearing)
  return (
    <Marker longitude={props.lon} latitude={props.lat} anchor="center">
      <div className="relative pointer-events-none">
        <span
          className="block leading-none font-black"
          style={{
            color: MAP_ROUTE_BLUE,
            fontSize: props.small ? 15 : 22,
            transform: `rotate(${props.bearing}deg)`,
            textShadow: '0 0 2px #fff, 0 0 3px #fff',
          }}
        >
          ▲
        </span>
        <span
          className="absolute whitespace-nowrap rounded bg-cap-yellow px-1 text-[10px] font-semibold text-cap-ultramarine shadow"
          style={{
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`,
          }}
        >
          {props.label}
        </span>
      </div>
    </Marker>
  )
}

const MAP_DETAILS_KEY = 'htw.map.detailsOpen'
const MAP_DETAILS_HINT_KEY = 'htw.map.detailsHintSeen'
const MAP_DETAILS_HINT =
  'Fold away the notes and corridor table to give the map more room. Click again to bring them back.'

function readMapDetailsOpen(): boolean {
  try {
    return localStorage.getItem(MAP_DETAILS_KEY) !== '0'
  } catch {
    return true
  }
}

function readMapDetailsHintSeen(): boolean {
  try {
    return localStorage.getItem(MAP_DETAILS_HINT_KEY) === '1'
  } catch {
    return false
  }
}

function computeBounds(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null
  const lngs = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  const padding = 0.02
  return [
    [Math.min(...lngs) - padding, Math.min(...lats) - padding],
    [Math.max(...lngs) + padding, Math.max(...lats) + padding],
  ]
}

export function MissionMapPage() {
  const navigate = useNavigate()
  const mapRef = useRef<MapRef>(null)
  const [searchParams] = useSearchParams()
  const planFromUrl = planIdFromMapSearch(searchParams.toString())
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(planFromUrl)
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [offsetGeometry, setOffsetGeometry] = useState<OffsetMapGeometry | null>(null)
  const [legWidths, setLegWidths] = useState<OffsetLegWidth[] | null>(null)
  const [selectedCrew, setSelectedCrew] = useState<CrewOverlayId>('team1')
  const [selectedSortie, setSelectedSortie] = useState<MapSortieNumber>(DEFAULT_MAP_SORTIE)
  const [mapZoom, setMapZoom] = useState(7)
  const [detailsOpen, setDetailsOpen] = useState(readMapDetailsOpen)
  const [showAllOverlays, setShowAllOverlays] = useState(false)
  const [detailsHintSeen, setDetailsHintSeen] = useState(readMapDetailsHintSeen)
  const [unsavedSeen, setUnsavedSeen] = useState(0)
  const bellowsLock = useRef(false)
  const skipNextFit = useRef(false)
  const { isSeen, markSeen } = useHintsSeen()

  const plans = useLiveQuery(
    () =>
      db.flightPlans.toArray().then((a) =>
        a.sort((x, y) => y.dateModified.localeCompare(x.dateModified))
      ),
    []
  )

  const planData = useLiveQuery(
    async (): Promise<PlanWithData | null> => {
      if (!selectedPlanId) return null
      const plan = await db.flightPlans.get(selectedPlanId)
      if (!plan) return null
      const waypoints = await db.waypoints
        .where('flightPlanId')
        .equals(selectedPlanId)
        .sortBy('sequence')
      const departure = plan.departureAirportId
        ? await db.airports.get(plan.departureAirportId)
        : null
      const destination = plan.destinationAirportId
        ? await db.airports.get(plan.destinationAirportId)
        : null
      return {
        plan,
        waypoints,
        departure: departure ?? null,
        destination: destination ?? null,
      }
    },
    [selectedPlanId]
  )

  const missionsForPlan = useLiveQuery(
    async () => {
      if (!selectedPlanId) return []
      const all = await db.missions.toArray()
      return all
        .filter((m) => m.flightPlanId === selectedPlanId)
        .sort((a, b) => {
          const an = a.missionNumber ?? ''
          const bn = b.missionNumber ?? ''
          if (an && bn) {
            const byMissionNumber = bn.localeCompare(an)
            if (byMissionNumber !== 0) return byMissionNumber
          }
          return b.date.localeCompare(a.date)
        })
    },
    [selectedPlanId]
  )

  const towerOverlayData = useLiveQuery(
    async (): Promise<TowerOverlayItem[]> => {
      if (!selectedMissionId || !selectedPlanId) return []
      const waypoints = await db.waypoints
        .where('flightPlanId')
        .equals(selectedPlanId)
        .sortBy('sequence')
      if (waypoints.length === 0) return []
      const reports = await db.towerReports
        .where('missionId')
        .equals(selectedMissionId)
        .sortBy('reportDate')
      const result: TowerOverlayItem[] = []
      for (let i = 0; i < reports.length; i++) {
        const r = reports[i]
        const loc = await db.towerLocations.get(r.towerLocationId)
        if (!loc) continue
        const info = nearestWaypointInfo(loc.latitude, loc.longitude, waypoints)
        if (!info) continue
        result.push({
          id: r.id,
          towerLat: loc.latitude,
          towerLon: loc.longitude,
          waypointLat: info.waypoint.latitude,
          waypointLon: info.waypoint.longitude,
          label: `T${i + 1}`,
        })
      }
      return result
    },
    [selectedMissionId, selectedPlanId]
  )

  const towerLinesGeoJSON = useMemo(() => {
    const items = towerOverlayData ?? []
    if (items.length === 0) return null
    return {
      type: 'FeatureCollection' as const,
      features: items.map((item) => ({
        type: 'Feature' as const,
        properties: { label: item.label },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [item.waypointLon, item.waypointLat],
            [item.towerLon, item.towerLat],
          ],
        },
      })),
    }
  }, [towerOverlayData])

  const routeCoords = useMemo(
    () =>
      planData
        ? buildRouteCoordinates(
            planData.departure,
            planData.waypoints,
            planData.destination
          )
        : [],
    [planData]
  )

  useEffect(() => {
    setSelectedCrew('team1')
    setSelectedSortie(DEFAULT_MAP_SORTIE)
  }, [selectedPlanId])

  const savedTeamPlan = useLiveQuery(
    async () => {
      if (!selectedPlanId) return null
      return (await db.teamPlans.get(selectedPlanId)) ?? null
    },
    [selectedPlanId]
  )
  const singleAircrew =
    savedTeamPlan !== undefined && isSingleAircrewPlan(planData?.plan ?? null, savedTeamPlan)

  useEffect(() => {
    if (!savedTeamPlan || savedTeamPlan.teams.length === 0) return
    if (savedTeamPlan.teams.some((team) => team.id === selectedCrew)) return
    setSelectedCrew(savedTeamPlan.teams[0].id)
  }, [savedTeamPlan, selectedCrew])

  const routePoints = useMemo(
    () =>
      (planData?.waypoints ?? []).map((waypoint) => ({
        ptIdent: parseWaypointCode(waypoint.originalName)?.waypointLetter ?? waypoint.originalName,
        originalName: waypoint.originalName,
        lat: waypoint.latitude,
        lon: waypoint.longitude,
        g1000Name: waypoint.g1000Name,
      })),
    [planData]
  )

  const planningRoute = useMemo(() => {
    const expanded = expandPlanningRoute(routePoints, legWidths ?? [], savedTeamPlan?.routeInsert ?? null)
    return {
      points: expanded.points.map((point) => ({
        ptIdent: point.ptIdent,
        originalName: point.originalName || point.ptIdent,
        lat: point.lat,
        lon: point.lon,
        g1000Name: point.g1000Name,
      })),
      widths: expanded.widths,
    }
  }, [routePoints, legWidths, savedTeamPlan])

  const routeLabel = useMemo(() => {
    const parsed = planData?.waypoints[0] ? parseWaypointCode(planData.waypoints[0].originalName) : null
    if (parsed) return `${parsed.routeType}${parsed.routeNumber}`
    return planData?.plan.name.replace(/\s+/g, '') ?? ''
  }, [planData])

  const teamDraws = useMemo(() => {
    if (!savedTeamPlan || savedTeamPlan.flightPlanId !== selectedPlanId) return null
    return savedTeamPlan.teams.map((team) =>
      drawSavedTeam({
        team,
        points: planningRoute.points,
        legWidths: legWidths ? planningRoute.widths : legWidths,
        firstOffsetNm: savedTeamPlan.firstOffsetNm,
        stepNm: savedTeamPlan.stepNm,
        homes: savedTeamPlan.teams.map((item) => item.departure?.identifier ?? '').filter(Boolean),
      })
    )
  }, [savedTeamPlan, selectedPlanId, planningRoute, legWidths])

  const progressCatalog = useMemo(() => {
    if (!savedTeamPlan || savedTeamPlan.flightPlanId !== selectedPlanId) return []
    return teamProgressCatalog({
      plan: savedTeamPlan,
      points: planningRoute.points,
      legWidths: legWidths ? planningRoute.widths : null,
    })
  }, [savedTeamPlan, selectedPlanId, planningRoute, legWidths])

  const crewOverlays = useMemo(() => {
    if (teamDraws) return teamDraws.map((draw) => draw.overlay)
    const centerline = [...(planData?.waypoints ?? [])]
      .sort((a, b) => a.sequence - b.sequence)
      .map((wp) => ({
        lat: wp.latitude,
        lon: wp.longitude,
        originalName: wp.originalName,
        ptIdent: parseWaypointCode(wp.originalName)?.waypointLetter ?? wp.g1000Name,
      }))
    const crewLabel = singleAircrew ? 'Sortie 1' : 'Team 1'
    const team1 =
      offsetGeometry && planData?.plan.sortie1Side
        ? serpentineFromTracks({
            id: 'team1' as const,
            label: crewLabel,
            sortie1Side: planData.plan.sortie1Side,
            inner: offsetGeometry.inner,
            outer: offsetGeometry.outer,
            departure: planData.departure,
            destination: planData.destination,
            centerline,
          })
        : { ...emptyCrewOverlay('team1', crewLabel), airport: planData?.departure?.identifier ?? null }
    if (singleAircrew && offsetGeometry && planData?.plan.sortie1Side && team1.passes.length > 0) {
      team1.passes = team1.passes.map((pass) => {
        const track = singleAircrewSortieTrack({
          centerline,
          inner: offsetGeometry.inner,
          outer: offsetGeometry.outer,
          sortie1Side: planData.plan.sortie1Side as 'inner' | 'outer',
          sortieNumber: pass.number,
        })
        const same =
          track.waypoints.length === pass.waypoints.length &&
          track.waypoints.every(
            (point, index) =>
              point.lat === pass.waypoints[index].lat &&
              point.lon === pass.waypoints[index].lon &&
              (point.g1000Name || point.ptIdent) === pass.waypoints[index].name
          )
        if (same) return pass
        const start = pass.number === 1 ? planData.departure : planData.destination
        const end = pass.number === 1 ? planData.destination : planData.departure
        const coordinates: [number, number][] = []
        if (start) coordinates.push([start.longitude, start.latitude])
        for (const point of track.waypoints) coordinates.push([point.lon, point.lat])
        if (end) coordinates.push([end.longitude, end.latitude])
        return {
          ...pass,
          side: track.side,
          names: track.waypoints.map((point) => point.g1000Name || point.ptIdent),
          coordinates,
          surveySide: track.waypoints.find((point) => point.surveySide)?.surveySide ?? pass.surveySide,
          waypoints: track.waypoints.map((point) => ({
            lat: point.lat,
            lon: point.lon,
            name: point.g1000Name || point.ptIdent,
            surveySide: point.surveySide,
          })),
        }
      })
    }
    return [
      team1,
      emptyCrewOverlay('team2', 'Team 2'),
      emptyCrewOverlay('team3', 'Team 3'),
    ] satisfies CrewSerpentine[]
  }, [teamDraws, offsetGeometry, planData, singleAircrew])

  const activeOverlay = selectedCrewOverlay(crewOverlays, selectedCrew)
  const selectorSorties = useMemo(() => {
    if (savedTeamPlan && savedTeamPlan.flightPlanId === selectedPlanId) {
      const team = savedTeamPlan.teams.find((item) => item.id === selectedCrew)
      if (team?.packedSorties && team.packedSorties.length > 0) return team.packedSorties
      if (team) return team.sorties
    }
    const passes = activeOverlay?.passes ?? []
    if (passes.some((pass) => pass.number === 1) && passes.some((pass) => pass.number === 2)) {
      return [{ number: 1 }, { number: 2 }]
    }
    return null
  }, [savedTeamPlan, selectedPlanId, selectedCrew, activeOverlay])
  const drawnSortie: MapSortieNumber =
    selectorSorties && mapSortieButtons(selectorSorties).some((button) => button.number === selectedSortie && button.enabled)
      ? selectedSortie
      : selectorSorties
        ? DEFAULT_MAP_SORTIE
        : selectedSortie
  const shownPasses = useMemo(
    () => passesForSortie(activeOverlay?.passes ?? [], drawnSortie),
    [activeOverlay, drawnSortie]
  )
  const shownSortie: MapSortieNumber = shownPasses.length === 1 ? shownPasses[0].number : drawnSortie
  const activeSortie =
    teamDraws?.find((draw) => draw.overlay.id === selectedCrew)?.sorties.find((sortie) => sortie.number === shownSortie) ??
    null
  const headerRefuelIdent = (() => {
    const refuel = savedTeamPlan?.teams.find((team) => team.id === selectedCrew)?.refuelStop?.identifier
    if (!refuel) return null
    if (!activeSortie?.includesFerry) return refuel
    const touches = [activeSortie.departureIdent, activeSortie.landingIdent].some(
      (ident) => ident?.toUpperCase() === refuel.toUpperCase()
    )
    return touches ? refuel : null
  })()
  const crewAirports = useMemo(() => {
    const toAirport = (airport: { identifier: string; latitude: number; longitude: number } | null): TransitAirport | null =>
      airport
        ? { identifier: airport.identifier, latitude: airport.latitude, longitude: airport.longitude }
        : null
    const savedTeam = savedTeamPlan?.teams.find((team) => team.id === selectedCrew)
    if (savedTeam) {
      const refuel = toAirport(savedTeam.refuelStop ?? null)
      return {
        departure: toAirport(savedTeam.departure),
        landing: refuel ?? toAirport(savedTeam.landing),
      }
    }
    if (selectedCrew !== 'team1' || !planData) return { departure: null, landing: null }
    return {
      departure: toAirport(planData.departure),
      landing: toAirport(planData.destination),
    }
  }, [selectedCrew, planData, savedTeamPlan])
  const sortieAirports = useMemo(() => {
    const savedTeam = savedTeamPlan?.teams.find((team) => team.id === selectedCrew)
    const refuelIdent = savedTeam?.refuelStop?.identifier
    const byIdent = (ident: string | null | undefined): TransitAirport | null => {
      if (!ident || !savedTeam) return null
      const match = [savedTeam.departure, savedTeam.refuelStop, savedTeam.landing].find(
        (airport) => airport && airport.identifier.toUpperCase() === ident.toUpperCase()
      )
      return match
        ? { identifier: match.identifier, latitude: match.latitude, longitude: match.longitude }
        : null
    }
    const packedEnds =
      activeSortie?.departureIdent
        ? { departure: byIdent(activeSortie.departureIdent), landing: byIdent(activeSortie.landingIdent) }
        : null
    const ends = packedEnds ?? airportsForSortie(shownSortie, crewAirports)
    const mark = (airport: TransitAirport | null): TransitAirport | null => {
      if (!airport || !refuelIdent || airport.identifier.toUpperCase() !== refuelIdent.toUpperCase()) return airport
      return { ...airport, caption: `${airport.identifier} — refuel` }
    }
    return { departure: mark(ends.departure), landing: mark(ends.landing) }
  }, [shownSortie, crewAirports, savedTeamPlan, selectedCrew, activeSortie])
  const overlayCrews = useMemo((): OverlayCrew[] => {
    if (!teamDraws || !savedTeamPlan) return []
    return teamDraws.map((draw) => {
      const team = savedTeamPlan.teams.find((item) => item.id === draw.overlay.id)
      return {
        id: draw.overlay.id,
        passes: draw.overlay.passes.map((pass) => ({ number: pass.number, coordinates: pass.coordinates })),
        airports: [team?.departure, team?.refuelStop, team?.landing],
      }
    })
  }, [teamDraws, savedTeamPlan])
  const backgroundOverlays = useMemo(
    () =>
      crewOverlayGroups({
        crews: overlayCrews,
        selectedCrewId: selectedCrew,
        selectedSortie: shownSortie,
        showAll: showAllOverlays,
      }),
    [overlayCrews, selectedCrew, shownSortie, showAllOverlays]
  )
  const serpentine = useMemo(() => {
    if (shownPasses.length === 0) return null
    return buildSerpentineDisplay(
      shownPasses,
      {
        left: offsetGeometry?.corridorLeft,
        right: offsetGeometry?.corridorRight,
      },
      sortieAirports
    )
  }, [shownPasses, offsetGeometry, sortieAirports])
  const [sortieProgress, setSortieProgress] = useState<Record<string, SortieProgress>>({})
  const progressRef = useRef<Record<string, SortieProgress>>({})
  const progressWrites = useRef(0)
  const progressQueue = useRef(Promise.resolve())
  useEffect(() => {
    if (progressWrites.current > 0) return
    progressRef.current = savedTeamPlan?.progress ?? {}
    setSortieProgress(progressRef.current)
  }, [savedTeamPlan])
  const progressLines = useMemo(
    () => progressSummaryLines(progressCatalog, sortieProgress),
    [progressCatalog, sortieProgress]
  )
  const sortieTurnDeg = useMemo(() => {
    const team = savedTeamPlan?.teams.find((item) => item.id === selectedCrew)
    const widths = legWidths && planningRoute ? planningRoute.widths : null
    if (!savedTeamPlan || !planningRoute || !team || !widths) return null
    const route = teamSortieOffsetRoute({
      team,
      points: planningRoute.points,
      legWidths: widths,
      sortieNumber: shownSortie,
      firstOffsetNm: savedTeamPlan.firstOffsetNm,
      stepNm: savedTeamPlan.stepNm,
      homeIdent: team.departure?.identifier,
      homes: savedTeamPlan.teams.map((item) => item.departure?.identifier ?? '').filter(Boolean),
    })
    if (!('waypoints' in route) || route.waypoints.length < 2) return null
    return maxCourseChangeDeg([
      { lat: route.departure.latitude, lon: route.departure.longitude },
      ...route.waypoints.map((point) => ({ lat: point.lat, lon: point.lon })),
      { lat: route.landing.latitude, lon: route.landing.longitude },
    ])
  }, [savedTeamPlan, selectedCrew, planningRoute, legWidths, shownSortie])
  const shownProgress = progressCatalog.find((row) => row.teamId === selectedCrew && row.number === shownSortie)
  const shownCoverage = shownProgress ? coverageLines(shownProgress.stops, sortieProgress[shownProgress.id]) : null
  const saveSortieProgress = (id: string, mark: SortieProgress | null) => {
    if (!savedTeamPlan) return
    const progress = { ...progressRef.current }
    if (!mark) delete progress[id]
    else progress[id] = mark
    progressRef.current = progress
    setSortieProgress(progress)
    const flightPlanId = savedTeamPlan.flightPlanId
    progressWrites.current += 1
    progressQueue.current = progressQueue.current
      .then(async () => {
        await db.teamPlans.update(flightPlanId, { progress, progressNotice: null })
      })
      .finally(() => {
        progressWrites.current -= 1
      })
  }
  const airportNotes = !planData
    ? []
    : (serpentine?.airportNotes ?? (teamDraws ? [] : crewAirportNotes(sortieAirports)))

  const allCoords = useMemo(() => {
    const c = [...routeCoords]
    for (const item of towerOverlayData ?? []) {
      c.push([item.towerLon, item.towerLat])
    }
    for (const track of [
      offsetGeometry?.inner,
      offsetGeometry?.outer,
      offsetGeometry?.corridorLeft,
      offsetGeometry?.corridorRight,
    ]) {
      for (const point of track ?? []) {
        c.push([point.lon, point.lat])
      }
    }
    for (const line of serpentine?.flows ?? []) {
      for (const coord of line) c.push(coord)
    }
    for (const leg of serpentine?.airportLegs ?? []) {
      for (const coord of leg.coordinates) c.push(coord)
    }
    if (showAllOverlays) {
      for (const coord of overlayFitCoordinates(overlayCrews)) c.push(coord)
    }
    return c
  }, [routeCoords, towerOverlayData, offsetGeometry, serpentine, showAllOverlays, overlayCrews])

  const bounds = useMemo(
    () =>
      allCoords.length > 0
        ? computeBounds(allCoords)
        : routeCoords.length > 0
          ? computeBounds(routeCoords)
          : null,
    [allCoords, routeCoords],
  )

  const fitMapToRoute = useCallback(() => {
    if (!mapRef.current || !bounds) return
    mapRef.current.resize()
    mapRef.current.fitBounds(bounds, {
      padding: 24,
      duration: 800,
      maxZoom: 12,
    })
  }, [bounds])

  useEffect(() => {
    const w = window as unknown as {
      __htMapFlyTo?: (lng: number, lat: number, zoom: number, durationMs: number) => void
    }
    w.__htMapFlyTo = (lng, lat, zoom, durationMs) => {
      mapRef.current?.flyTo({
        center: [lng, lat],
        zoom,
        duration: durationMs,
        essential: true,
      })
    }
    return () => {
      delete w.__htMapFlyTo
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !bounds) return
    const map = mapRef.current
    if (!map) return
    const fit = () => {
      map.resize()
      map.fitBounds(bounds, {
        padding: 24,
        duration: 0,
        maxZoom: 12,
      })
    }
    fit()
    const observer = new ResizeObserver(() => {
      if (bellowsLock.current) return
      map.resize()
      if (skipNextFit.current) {
        skipNextFit.current = false
        return
      }
      map.fitBounds(bounds, {
        padding: 24,
        duration: 0,
        maxZoom: 12,
      })
    })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [mapReady, bounds])

  const dismissDetailsHint = () => {
    setDetailsHintSeen(true)
    try {
      localStorage.setItem(MAP_DETAILS_HINT_KEY, '1')
    } catch {
      /* The tip stays dismissed for this visit when storage is unavailable. */
    }
  }

  const toggleDetails = () => {
    dismissDetailsHint()
    const next = !detailsOpen
    setDetailsOpen(next)
    try {
      localStorage.setItem(MAP_DETAILS_KEY, next ? '1' : '0')
    } catch {
      /* The map still toggles when storage is unavailable. */
    }
    bellowsLock.current = true
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => {
      bellowsLock.current = false
      skipNextFit.current = true
      mapRef.current?.resize()
    }, reduced ? 0 : 320)
  }

  useEffect(() => {
    const refresh = () => setUnsavedSeen((value) => value + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  useEffect(() => {
    if (planFromUrl) setSelectedPlanId(planFromUrl)
  }, [planFromUrl])

  useEffect(() => {
    if (plans && plans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(plans[0].id)
    }
  }, [plans, selectedPlanId])

  useEffect(() => {
    setSelectedMissionId(null)
  }, [selectedPlanId])

  useEffect(() => {
    const missions = missionsForPlan ?? []
    if (missions.length > 0 && !selectedMissionId && selectedPlanId) {
      const mission = missions[0]
      if (mission.flightPlanId === selectedPlanId) {
        setSelectedMissionId(mission.id)
      }
    }
  }, [missionsForPlan, selectedMissionId, selectedPlanId])

  const token = apiConfig.mapboxAccessToken

  if (!token || (token && token === 'your_mapbox_token_here')) {
    return (
      <div className="app-page-shell overflow-auto">
        <div className="app-panel max-w-xl mx-auto p-6 md:p-8">
          <h1 className="text-2xl font-bold text-cap-ultramarine mb-2">Map View</h1>
          <p className="text-cap-pimento">
            Mapbox access token not configured. Set VITE_MAPBOX_ACCESS_TOKEN in your .env file.
          </p>
        </div>
      </div>
    )
  }

  const emptyPathNotice =
    planData && activeOverlay
      ? mapEmptyPathNotice({
          singleAircrew,
          teamPlanKnown: savedTeamPlan !== undefined,
          teamDraws: Boolean(teamDraws),
          overlayId: activeOverlay.id,
          overlayLabel: activeOverlay.label,
          sortie1Side: planData.plan.sortie1Side,
          passCount: activeOverlay.passes.length,
        })
      : null

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full min-h-[320px]">
      <div className="shrink-0 p-4 border-b border-white/15 bg-black/25 backdrop-blur-sm flex items-center gap-4 flex-wrap text-white">
        <h1 className="text-xl font-bold text-white tracking-tight">Map View</h1>
        <GuidedHint
          hintId="mapView.routeCheck"
          stepNumber={1}
          title="Compare with ForeFlight"
          body={
            <>
              Compare this graphical flight plan with your ForeFlight map. If the two pictures match,
              you have a visual confirmation that the waypoint list is right. If you see a mistake,
              press <strong>Return to Flight Plan</strong> and use{' '}
              <strong>Correct waypoint sequence</strong>. With details open, and after the offset plan
              is saved, download both sortie files here.
            </>
          }
          isSeen={isSeen('mapView.routeCheck')}
          onDismiss={markSeen}
          surface="dark"
        />
        {(towerOverlayData ?? []).length > 0 && (
          <GuidedHint
            hintId="mapView.towerMarkers"
            stepNumber={2}
            title="Tower markers and zoom"
            body={
              <>
                With the map fit to the route, each surveyed tower appears as a{' '}
                <strong>red circle</strong> on the line from the nearest route waypoint.{' '}
                <strong>Zoom in</strong> on a tower: the line stays tied to that waypoint, an{' '}
                <strong>arrowhead</strong> locks onto the tower base, and the label slides back so
                you can confirm the tip points at the structure. That check is worth doing before you{' '}
                <strong>export reported data</strong> for the customer.
              </>
            }
            isSeen={isSeen('mapView.towerMarkers')}
            onDismiss={markSeen}
            surface="dark"
          />
        )}
        <select
          value={selectedPlanId ?? ''}
          onChange={(e) => {
            const next = e.target.value || null
            if (next === selectedPlanId) return
            if (!confirmLeaveOffsetPlan()) return
            setSelectedPlanId(next)
          }}
          className="px-3 py-2 border border-white/25 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-cap-yellow focus:border-cap-yellow max-w-xs shadow-sm"
        >
          <option value="">Select flight plan</option>
          {(plans ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (!confirmLeaveOffsetPlan()) return
            if (selectedPlanId) navigate(`/flight-plans/${selectedPlanId}`)
            else navigate('/flight-plans')
          }}
          disabled={!selectedPlanId}
          className="px-3 py-2 text-sm font-medium rounded-lg bg-cap-yellow text-cap-ultramarine hover:bg-cap-yellow/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Return to Flight Plan
        </button>
        {(missionsForPlan ?? []).length > 0 && (
          <select
            value={selectedMissionId ?? ''}
            onChange={(e) => setSelectedMissionId(e.target.value || null)}
            aria-label="Select mission to show towers"
            className="px-3 py-2 border border-white/25 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-cap-yellow focus:border-cap-yellow max-w-xs shadow-sm"
          >
            <option value="">Select mission (towers)</option>
            {(missionsForPlan ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {bounds && (
          <button
            type="button"
            onClick={fitMapToRoute}
            className="px-3 py-2 text-sm border border-white/40 rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
            Fit display to route
          </button>
        )}
        {planData && (
          <div className="flex w-full items-center gap-2">
            <MapViewCrewControls
              singleAircrew={singleAircrew}
              crews={crewOverlays}
              selectedCrew={selectedCrew}
              onSelectCrew={(id) => {
                setSelectedSortie((current) => sortieNumberAfterCrewChange(selectedCrew, id, current))
                setSelectedCrew(id)
              }}
              sorties={selectorSorties}
              selectedSortie={drawnSortie}
              onSelectSortie={setSelectedSortie}
              departure={planData.departure?.identifier ?? null}
              destination={planData.destination?.identifier ?? null}
              sortie1Side={planData.plan.sortie1Side ?? null}
              showNoTeamPlan={false}
              hint={singleAircrew ? singleAircrewSortieHint() : null}
            />
            <div className="ml-auto flex items-center gap-2">
              {!detailsHintSeen && (
                <p className="max-w-[18rem] text-xs text-white">
                  Tip: Hide details folds the notes and corridor table away so you can see more of the map.{' '}
                  <button type="button" className="font-medium underline" onClick={dismissDetailsHint}>
                    Got it
                  </button>
                </p>
              )}
              <ShowAllSortieOverlaysButton
                visible={Boolean(teamDraws) && !singleAircrew}
                pressed={showAllOverlays}
                onToggle={() => setShowAllOverlays((open) => !open)}
              />
              <button
                type="button"
                className="inline-flex items-center gap-1 px-2 py-2 text-sm text-white rounded-lg border border-white/40 hover:bg-white/15"
                aria-expanded={detailsOpen}
                aria-controls="map-view-details"
                aria-label={MAP_DETAILS_HINT}
                title={MAP_DETAILS_HINT}
                onClick={toggleDetails}
              >
                <span>{detailsOpen ? 'Hide details' : 'Show details'}</span>
                <span aria-hidden="true" className={`inline-block transition-transform ${detailsOpen ? '' : 'rotate-180'}`}>
                  ⌃
                </span>
              </button>
            </div>
          </div>
        )}
        {!planData && <p className="text-sm text-white/80">Select a flight plan to view the route</p>}
      </div>

      {selectedPlanId && teamSortiesAreStale(selectedPlanId) && (
        <p className="shrink-0 px-4 py-2 text-sm text-white bg-black/40 border-b border-white/15">
          Saved sorties are out of date. Re-run and save in Team Dispatch to show every planned sortie.
        </p>
      )}

      {selectedPlanId && teamDispatchHasUnsaved(selectedPlanId) && unsavedSeen >= 0 && (
        <p className="shrink-0 px-4 py-2 text-sm text-white bg-black/40 border-b border-white/15">
          Team Dispatch has unsaved changes for this plan. The map shows the last saved version.{' '}
          <Link to={`/coordinator/survey?plan=${selectedPlanId}`} className="underline font-medium text-cap-yellow">
            Open Team Dispatch
          </Link>
        </p>
      )}

      <div id="map-view-details" className="map-bellows" data-open={detailsOpen ? 'true' : 'false'}>
        <div className="map-bellows-inner">
        {!singleAircrew && savedTeamPlan && progressCatalog.some((row) => row.teamId === selectedCrew) && (
          <div>
            <div className="px-4 pt-2">
              <GuidedHint
                hintId="mapView.crewProgress"
                stepNumber={3}
                title="Where a crew stopped"
                body="Mark where a crew stopped so everyone can see what's covered and what's left. The flight plan files don't change."
                isSeen={isSeen('mapView.crewProgress')}
                onDismiss={markSeen}
                surface="dark"
              />
            </div>
            <SortieProgressPanel
              rows={progressCatalog
                .filter((row) => row.teamId === selectedCrew)
                .map((row) => ({
                  id: row.id,
                  number: row.number,
                  stops: row.stops,
                  mark: sortieProgress[row.id],
                }))}
              crewLines={progressLines.crews}
              planLine={progressLines.plan}
              notice={savedTeamPlan.progressNotice ?? null}
              onChange={saveSortieProgress}
            />
            {shownCoverage && (
              <p className="px-4 pb-2 text-sm text-white/90 flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-8 border-t-4 border-[#0072B2]" />
                  Covered — solid blue
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block w-8 border-t-4 border-dashed border-[#E69F00]" />
                  Still to fly — dashed orange
                </span>
              </p>
            )}
          </div>
        )}
        {!singleAircrew && savedTeamPlan === null && teamPlanAwaitingSave(selectedPlanId ?? '') && (
          <p className="px-4 pt-2 text-sm text-white/80">
            This team plan hasn&apos;t been saved yet.{' '}
            <Link to={`/coordinator/survey?plan=${selectedPlanId}`} className="underline font-medium text-cap-yellow">
              Save it in Team Dispatch
            </Link>{' '}
            to see it here.
          </p>
        )}
        {!singleAircrew && savedTeamPlan === null && !teamPlanAwaitingSave(selectedPlanId ?? '') && (
          <p className="px-4 pt-2 text-sm text-white/80">{NO_TEAM_PLAN_NOTE}</p>
        )}
        {!singleAircrew &&
          savedTeamPlan &&
          legacySortieNote(savedTeamPlan.teams.find((team) => team.id === selectedCrew)) && (
            <p className="px-4 pt-2 text-sm text-white/80">
              {legacySortieNote(savedTeamPlan.teams.find((team) => team.id === selectedCrew))}
            </p>
          )}
        {teamDraws
          ?.find((draw) => draw.overlay.id === selectedCrew)
          ?.notes.map((note) => (
            <p key={note} className="px-4 pt-2 text-sm text-white/80">
              {note}
            </p>
          ))}
        {airportNotes.map((note) => (
          <p key={note} className="px-4 pt-2 text-sm text-white/80">
            {note}
          </p>
        ))}
        {emptyPathNotice && <p className="px-4 pt-2 text-sm text-white/80">{emptyPathNotice}</p>}
        {planData && activeSortie && (activeSortie.lanes > 0 || activeSortie.includesFerry) ? (
          <p className="px-4 py-2 text-sm text-white/80">
            {formatSortieHeader(activeSortie, headerRefuelIdent)}
            {savedTeamPlan ? (
              <span className="block">
                {laneTurnSentence(sortieTurnDeg)}
              </span>
            ) : null}
          </p>
        ) : planData && !teamDraws ? (
          <p className="px-4 py-2 text-sm text-white/80">
            {`${planData.waypoints.length} waypoints${planData.departure || planData.destination ? ' • Airports connected' : ''}${(towerOverlayData ?? []).length > 0 ? ` • ${(towerOverlayData ?? []).length} towers` : ''}`}
          </p>
        ) : null}

      {planData && planData.waypoints.length >= 2 && (
        <OffsetRoutePanel
          key={planData.plan.id}
          flightPlanId={planData.plan.id}
          waypoints={planData.waypoints.map((wp) => ({
            originalName: wp.originalName,
            g1000Name: wp.g1000Name,
            lat: wp.latitude,
            lon: wp.longitude,
          }))}
          departure={planData.departure}
          destination={planData.destination}
          sortie1Side={planData.plan.sortie1Side ?? null}
          creationLoadMethod={planData.plan.creationLoadMethod ?? null}
          savedTeamPlan={savedTeamPlan}
          onGeometry={setOffsetGeometry}
          onLegWidths={setLegWidths}
          teamPlanDownload={
            savedTeamPlan && savedTeamPlan.flightPlanId === selectedPlanId
              ? (() => {
                  const team = savedTeamPlan.teams.find((item) => item.id === selectedCrew)
                  if (!team) return null
                  const records =
                    savedTeamPlan.routeInsert == null
                      ? planData.waypoints
                      : planningRoute.points.map((point, index) => ({
                          id: `wp-${point.ptIdent}`,
                          flightPlanId: planData.plan.id,
                          originalName: point.originalName || point.ptIdent,
                          g1000Name: point.g1000Name || point.ptIdent,
                          latitude: point.lat,
                          longitude: point.lon,
                          routeType: planData.waypoints[0]?.routeType ?? 'VR',
                          sequence: index,
                        }))
                  return {
                    team,
                    routeLabel,
                    waypoints: records,
                    points: planningRoute.points,
                    legWidths: legWidths ? planningRoute.widths : null,
                    policy: {
                      firstOffsetNm: savedTeamPlan.firstOffsetNm,
                      stepNm: savedTeamPlan.stepNm,
                    },
                  }
                })()
              : null
          }
        />
      )}
        </div>
      </div>

      <div className="flex-1 min-h-[240px] relative">
        <Map
          ref={mapRef}
          mapboxAccessToken={token}
          initialViewState={{
            longitude: -106.65,
            latitude: 35.08,
            zoom: 7,
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
          onLoad={() => setMapReady(true)}
          onMoveEnd={(event) => setMapZoom(event.viewState.zoom)}
        >
          {teamDraws && serpentine && serpentine.shades.length > 0 && (
            <Source id="serpentine-shade" type="geojson" data={shadeCollection(serpentine.shades)}>
              <Layer
                id="serpentine-shade-fill"
                type="fill"
                paint={{ 'fill-color': SERPENTINE_YELLOW, 'fill-opacity': 0.22 }}
              />
            </Source>
          )}

          {planData && planData.waypoints.length >= 2 && (
            <Source
              id="route-line"
              type="geojson"
              data={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: [...planData.waypoints]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((waypoint) => [waypoint.longitude, waypoint.latitude]),
                },
              }}
            >
              <Layer
                id="route-line"
                type="line"
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                paint={{ 'line-color': MAP_ROUTE_BLUE, 'line-width': 3 }}
              />
            </Source>
          )}

          {!singleAircrew && lineFromPoints(offsetGeometry?.corridorLeft) && (
            <Source id="corridor-left" type="geojson" data={lineFromPoints(offsetGeometry?.corridorLeft)!}>
              <Layer
                id="corridor-left-line"
                type="line"
                paint={{ 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 2] }}
              />
            </Source>
          )}
          {!singleAircrew && lineFromPoints(offsetGeometry?.corridorRight) && (
            <Source id="corridor-right" type="geojson" data={lineFromPoints(offsetGeometry?.corridorRight)!}>
              <Layer
                id="corridor-right-line"
                type="line"
                paint={{ 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 2] }}
              />
            </Source>
          )}
          {serpentine && serpentine.airportLegs.length > 0 && (
            <Source id="airport-legs" type="geojson" data={lineCollection(serpentine.airportLegs.map((leg) => leg.coordinates))}>
              <Layer
                id="airport-legs-line"
                type="line"
                paint={{
                  'line-color': '#ffffff',
                  'line-width': 2,
                  'line-dasharray': [4, 3],
                }}
              />
            </Source>
          )}
          {backgroundOverlays.map((group) => (
            <Source
              key={`crew-overlay-${group.crewIndex}`}
              id={`crew-overlay-${group.crewIndex}`}
              type="geojson"
              data={lineCollection(group.lines)}
            >
              <Layer
                id={`crew-overlay-${group.crewIndex}-line`}
                type="line"
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                paint={{ 'line-color': group.color, 'line-width': 2 }}
              />
            </Source>
          ))}
          {teamDraws && serpentine && serpentine.flows.length > 0 && !shownCoverage && (
            <Source id="serpentine-flow" type="geojson" data={lineCollection(serpentine.flows)}>
              <Layer
                id="serpentine-flow-line"
                type="line"
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                paint={{ 'line-color': SERPENTINE_YELLOW, 'line-width': 5 }}
              />
            </Source>
          )}
          {shownCoverage && lineFromCoordinates(shownCoverage.covered) && (
            <Source id="sortie-covered" type="geojson" data={lineFromCoordinates(shownCoverage.covered)!}>
              <Layer
                id="sortie-covered-line"
                type="line"
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                paint={{ 'line-color': COVERED_LINE, 'line-width': 6 }}
              />
            </Source>
          )}
          {shownCoverage && lineFromCoordinates(shownCoverage.remaining) && (
            <Source id="sortie-remaining" type="geojson" data={lineFromCoordinates(shownCoverage.remaining)!}>
              <Layer
                id="sortie-remaining-line"
                type="line"
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                paint={{ 'line-color': REMAINING_LINE, 'line-width': 5, 'line-dasharray': [2, 1.5] }}
              />
            </Source>
          )}
          {!teamDraws &&
            (activeOverlay?.passes ?? [])
              .filter((pass) => pass.number !== shownSortie)
              .map((pass) => {
                const line = sortieWaypointLine(pass.waypoints)
                const data = lineFromCoordinates(line)
                if (!data) return null
                return (
                  <Source key={`sortie-quiet-${pass.number}`} id={`sortie-quiet-${pass.number}`} type="geojson" data={data}>
                    <Layer
                      id={`sortie-quiet-${pass.number}-line`}
                      type="line"
                      layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                      paint={{ 'line-color': SERPENTINE_YELLOW, 'line-width': 2, 'line-opacity': 0.35 }}
                    />
                  </Source>
                )
              })}
          {!teamDraws &&
            (() => {
              const pass = (activeOverlay?.passes ?? []).find((item) => item.number === shownSortie)
              const data = pass ? lineFromCoordinates(sortieWaypointLine(pass.waypoints)) : null
              if (!data) return null
              return (
                <Source id="sortie-highlight" type="geojson" data={data}>
                  <Layer
                    id="sortie-highlight-line"
                    type="line"
                    layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                    paint={{ 'line-color': SERPENTINE_YELLOW, 'line-width': 5 }}
                  />
                </Source>
              )
            })()}

          {towerLinesGeoJSON && (
            <Source id="tower-lines" type="geojson" data={towerLinesGeoJSON}>
              <Layer
                id="tower-lines-layer"
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': TOWER_MAP_COLOR,
                  'line-width': 2,
                }}
              />
            </Source>
          )}

          {serpentine && serpentine.crossoverLegs.length > 0 && !shownCoverage && (
            <Source id="crossover-leg" type="geojson" data={lineCollection(serpentine.crossoverLegs)}>
              <Layer
                id="crossover-leg-line"
                type="line"
                layout={{ 'line-join': 'round', 'line-cap': 'round' }}
                paint={{ 'line-color': SERPENTINE_YELLOW, 'line-width': 5 }}
              />
            </Source>
          )}

          {(towerOverlayData ?? []).map((item) => (
            <TowerLeaderMarker key={item.id} item={item} />
          ))}

          {serpentine?.legArrows.map((arrow, index) => (
            <Marker
              key={`leg-${index}-${arrow.fromName}-${arrow.toName}`}
              longitude={arrow.lon}
              latitude={arrow.lat}
              anchor="center"
            >
              <span
                className="pointer-events-none block font-black leading-none"
                style={{
                  color: arrow.color,
                  fontSize: legArrowSizePx(mapZoom),
                  transform: `rotate(${arrow.bearing}deg)`,
                  textShadow: '0 0 2px #fff, 0 0 2px #000',
                }}
              >
                ▲
              </span>
            </Marker>
          ))}

          {serpentine?.airportLegs.map((leg) =>
            leg.arrow ? (
              <Marker
                key={`transit-${leg.role}`}
                longitude={leg.arrow.lon}
                latitude={leg.arrow.lat}
                anchor="center"
              >
                <span
                  className="pointer-events-none block font-black leading-none"
                  style={{
                    color: leg.arrow.color,
                    fontSize: legArrowSizePx(mapZoom),
                    transform: `rotate(${leg.arrow.bearing}deg)`,
                    textShadow: '0 0 2px #fff, 0 0 2px #fff',
                  }}
                >
                  ▲
                </span>
              </Marker>
            ) : null
          )}

          {serpentine?.airportLegs.map((leg) => {
            const airportEnd = leg.role === 'departure' ? leg.coordinates[0] : leg.coordinates[leg.coordinates.length - 1]
            return (
              <Marker
                key={`airport-${leg.role}-${leg.identifier}`}
                longitude={airportEnd[0]}
                latitude={airportEnd[1]}
                anchor="bottom"
              >
                <div
                  className="px-2 py-1 rounded text-xs font-medium text-white shadow"
                  style={{ backgroundColor: leg.role === 'departure' ? '#0E2B8D' : '#8B0000' }}
                >
                  {leg.caption || leg.identifier}
                </div>
              </Marker>
            )
          })}

          {serpentine?.arrows.map((arrow, index) => (
            <FlowArrow
              key={`arrow-${arrow.pass}-${index}`}
              lon={arrow.lon}
              lat={arrow.lat}
              bearing={arrow.bearing}
              label={`Pass ${arrow.pass}`}
              small={arrow.pass === 2}
            />
          ))}

          {serpentine?.laneCaptions.map((caption) => (
            <Marker
              key={`lane-${caption.text}-${caption.lon}-${caption.lat}`}
              longitude={caption.lon}
              latitude={caption.lat}
              anchor="bottom"
              offset={[0, -8]}
              style={{ zIndex: 25 }}
            >
              <div
                className="pointer-events-none whitespace-nowrap text-[10px] font-semibold text-white"
                style={{ textShadow: '0 0 3px #0E2B8D, 0 1px 2px #000' }}
              >
                {caption.text}
              </div>
            </Marker>
          ))}

          {serpentine?.labels.map((label) => {
            const place =
              label.awayBearing == null
                ? labelPlacement(label.bearing)
                : markerPlacementAway(label.awayBearing)
            return (
              <Marker
                key={`g1000-${label.pass}-${label.name}-${label.lon}-${label.lat}`}
                longitude={label.lon}
                latitude={label.lat}
                anchor={place.anchor}
                offset={place.offset}
                style={{ zIndex: 12 }}
              >
                <div className="pointer-events-none text-center leading-tight">
                  <div
                    className="font-mono text-[10px] font-semibold text-white"
                    style={{ textShadow: '0 0 3px #0E2B8D, 0 1px 2px #000' }}
                  >
                    {label.name}
                  </div>
                  {label.role ? (
                    <div
                      className="text-[10px] font-bold text-white"
                      style={{ textShadow: '0 0 3px #0E2B8D, 0 1px 2px #000' }}
                    >
                      {label.role}
                    </div>
                  ) : null}
                </div>
              </Marker>
            )
          })}

          <NavigationControl position="top-right" />

          {planData?.waypoints.map((wp) => {
            const letter = publishedPointLabel(wp.originalName)
            if (!letter) return null
            return (
              <Marker key={wp.id} longitude={wp.longitude} latitude={wp.latitude} anchor="center" style={{ zIndex: 40 }}>
                <span
                  className="pointer-events-none text-[11px] font-semibold text-white"
                  style={{ color: MAP_ROUTE_BLUE, textShadow: '0 0 2px #fff, 0 0 3px #fff' }}
                  title={wp.originalName}
                >
                  {letter}
                </span>
              </Marker>
            )
          })}

          {(offsetGeometry?.flags ?? []).map((flag) => (
            <Marker key={`${flag.side}-${flag.index}-${flag.reason}`} longitude={flag.lon} latitude={flag.lat} anchor="center">
              <div
                className="w-5 h-5 rounded-full bg-cap-yellow text-cap-ultramarine text-xs font-bold flex items-center justify-center border border-black shadow"
                title={flag.message}
              >
                !
              </div>
            </Marker>
          ))}

        </Map>
        {showAllOverlays && teamDraws && (
          <div
            data-testid="crew-overlay-legend"
            className="absolute left-3 bottom-8 z-10 rounded bg-black/70 px-2 py-1 text-xs text-white space-y-1"
          >
            {teamDraws.map((draw, index) => (
              <div key={draw.overlay.id} className="flex items-center gap-2">
                <span className="inline-block h-1 w-8" style={{ background: crewOverlayColor(index) }} />
                <span>
                  {draw.overlay.label}
                  {draw.overlay.airport ? ` · ${draw.overlay.airport}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
