import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Map, MapRef, Source, Layer, Marker, NavigationControl } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { FlightPlanRecord, WaypointRecord, AirportRecord } from '@/db/schema'
import { apiConfig } from '@/config/apiConfig'
import { nearestWaypointInfo } from '@/utils/towerWaypointGeometry'

const CAP_PIMENTO = '#DB0029'

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
  const mapRef = useRef<MapRef>(null)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

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
            [item.towerLon, item.towerLat],
            [item.waypointLon, item.waypointLat],
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

  const routeGeoJSON = useMemo(() => {
    if (routeCoords.length < 2) return null
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: routeCoords,
      },
    }
  }, [routeCoords])

  /** Ensure route line layers stack at the top of the style (above satellite raster / roads). */
  useEffect(() => {
    if (!mapReady || !routeGeoJSON) return
    const map = mapRef.current?.getMap()
    if (!map) return
    const bringRouteToFront = () => {
      try {
        if (!map.getLayer('route-line-halo') || !map.getLayer('route-line')) return
        const layers = map.getStyle()?.layers
        if (!layers?.length) return
        const topId = layers[layers.length - 1].id
        if (topId === 'route-line') return
        map.moveLayer('route-line-halo')
        map.moveLayer('route-line')
      } catch {
        /* ignore ordering if style not ready */
      }
    }
    map.on('idle', bringRouteToFront)
    bringRouteToFront()
    return () => {
      map.off('idle', bringRouteToFront)
    }
  }, [mapReady, routeGeoJSON, selectedPlanId])

  const allCoords = useMemo(() => {
    const c = [...routeCoords]
    for (const item of towerOverlayData ?? []) {
      c.push([item.towerLon, item.towerLat])
    }
    return c
  }, [routeCoords, towerOverlayData])

  const bounds = allCoords.length > 0 ? computeBounds(allCoords) : (routeCoords.length > 0 ? computeBounds(routeCoords) : null)

  const fitMapToRoute = useCallback(() => {
    if (!mapRef.current || !bounds) return
    mapRef.current.fitBounds(bounds, {
      padding: 60,
      duration: 800,
      maxZoom: 12,
    })
  }, [bounds])

  useEffect(() => {
    if (mapReady && bounds) {
      fitMapToRoute()
    }
  }, [mapReady, bounds, fitMapToRoute])

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

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full min-h-[320px]">
      <div className="shrink-0 p-4 border-b border-white/15 bg-black/25 backdrop-blur-sm flex items-center gap-4 flex-wrap text-white">
        <h1 className="text-xl font-bold text-white tracking-tight">Map View</h1>
        <select
          value={selectedPlanId ?? ''}
          onChange={(e) => setSelectedPlanId(e.target.value || null)}
          className="px-3 py-2 border border-white/25 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-cap-yellow focus:border-cap-yellow max-w-xs shadow-sm"
        >
          <option value="">Select flight plan</option>
          {(plans ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
        <p className="text-sm text-white/80">
          {planData
            ? `${planData.waypoints.length} waypoints${planData.departure || planData.destination ? ' • Airports connected' : ''}${(towerOverlayData ?? []).length > 0 ? ` • ${(towerOverlayData ?? []).length} towers` : ''}`
            : 'Select a flight plan to view the route'}
        </p>
      </div>

      <div className="flex-1 min-h-0 relative">
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
        >
          {routeGeoJSON && (
            <Source
              id="route"
              type="geojson"
              data={routeGeoJSON}
              key={`route-src-${selectedPlanId}-${routeCoords.length}`}
            >
              <Layer
                id="route-line-halo"
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': '#ffffff',
                  'line-width': 10,
                  'line-opacity': 0.85,
                }}
              />
              <Layer
                id="route-line"
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': '#FFD911',
                  'line-width': 4,
                }}
              />
            </Source>
          )}

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
                  'line-color': CAP_PIMENTO,
                  'line-width': 2,
                }}
              />
            </Source>
          )}

          {(towerOverlayData ?? []).map((item) => (
            <Marker
              key={item.id}
              longitude={item.towerLon}
              latitude={item.towerLat}
              anchor="bottom"
            >
              <div
                className="px-2 py-1 rounded text-xs font-bold text-white shadow"
                style={{ backgroundColor: CAP_PIMENTO }}
                title={`Tower ${item.label}`}
              >
                {item.label}
              </div>
            </Marker>
          ))}

          <NavigationControl position="top-right" />

          {planData?.departure && (
            <Marker
              longitude={planData.departure.longitude}
              latitude={planData.departure.latitude}
              anchor="bottom"
            >
              <div
                className="px-2 py-1 rounded text-xs font-medium text-white shadow"
                style={{ backgroundColor: '#0E2B8D' }}
                title={planData.departure.name}
              >
                {planData.departure.identifier}
              </div>
            </Marker>
          )}

          {planData?.waypoints.map((wp) => (
            <Marker
              key={wp.id}
              longitude={wp.longitude}
              latitude={wp.latitude}
              anchor="bottom"
            >
              <div
                className="px-2 py-0.5 rounded text-xs font-mono text-cap-ultramarine bg-white border border-cap-ultramarine shadow"
                title={wp.originalName}
              >
                {wp.g1000Name}
              </div>
            </Marker>
          ))}

          {planData?.destination && (
            <Marker
              longitude={planData.destination.longitude}
              latitude={planData.destination.latitude}
              anchor="bottom"
            >
              <div
                className="px-2 py-1 rounded text-xs font-medium text-white shadow"
                style={{ backgroundColor: '#8B0000' }}
                title={planData.destination.name}
              >
                {planData.destination.identifier}
              </div>
            </Marker>
          )}
        </Map>
      </div>
    </div>
  )
}
