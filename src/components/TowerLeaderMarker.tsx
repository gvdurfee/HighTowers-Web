import { useEffect, useState } from 'react'
import { Marker, useMap } from 'react-map-gl'
import type { Map as MapboxMap } from 'mapbox-gl'

export const TOWER_MAP_COLOR = '#DB0029'

const LINE_STROKE_PX = 3
const ARROW_LENGTH_PX = 10
const ARROW_HALF_HEIGHT_PX = 5
const CIRCLE_RADIUS_PX = 11
const LABEL_FONT_PX = 11
const DETAIL_LINE_MAX_PX = 480

/**
 * Switch to arrow + sliding label when the tower–waypoint span is long enough on screen
 * that a circle on the tower base would crowd the structure (≈ circle diameter + arrow).
 */
export const TOWER_DETAIL_MODE_MIN_PX = ARROW_LENGTH_PX + CIRCLE_RADIUS_PX * 2 + 8

/**
 * Detail-mode label X in tower-anchored SVG coords (0 = arrow tip at tower, +x toward waypoint).
 * Picks the waypoint end of the leader when it fits; otherwise the nearest valid position to the tower.
 */
export function detailLabelCenterPx(widthPx: number): number {
  const nearTowerPx = ARROW_LENGTH_PX + CIRCLE_RADIUS_PX + 2
  const nearWaypointPx = widthPx - CIRCLE_RADIUS_PX - 2
  return Math.max(nearTowerPx, nearWaypointPx)
}

export type TowerLeaderItem = {
  id: string
  towerLat: number
  towerLon: number
  waypointLat: number
  waypointLon: number
  label: string
}

type Layout =
  | { mode: 'overview'; bearingDeg: number }
  | {
      mode: 'detail'
      widthPx: number
      heightPx: number
      bearingDeg: number
      labelCx: number
    }

function computeLayout(map: MapboxMap, item: TowerLeaderItem): Layout | null {
  const towerPt = map.project([item.towerLon, item.towerLat])
  const wpPt = map.project([item.waypointLon, item.waypointLat])
  const dx = wpPt.x - towerPt.x
  const dy = wpPt.y - towerPt.y
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  /** Screen bearing from tower toward nearest route waypoint. */
  const bearingDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  const distancePx = Math.hypot(dx, dy)

  if (distancePx < TOWER_DETAIL_MODE_MIN_PX) {
    return { mode: 'overview', bearingDeg }
  }

  const widthPx = Math.min(DETAIL_LINE_MAX_PX, distancePx)
  const labelCx = detailLabelCenterPx(widthPx)
  const heightPx = Math.max(CIRCLE_RADIUS_PX * 2 + 4, ARROW_HALF_HEIGHT_PX * 2 + 4)
  return { mode: 'detail', widthPx, heightPx, bearingDeg, labelCx }
}

type Props = {
  item: TowerLeaderItem
}

function TowerOverviewCircle({ item }: Props) {
  const sizePx = CIRCLE_RADIUS_PX * 2
  return (
    <Marker
      longitude={item.towerLon}
      latitude={item.towerLat}
      anchor="center"
      style={{ zIndex: 2 }}
    >
      <div
        className="pointer-events-none select-none flex items-center justify-center rounded-full font-bold text-white shadow"
        style={{
          width: sizePx,
          height: sizePx,
          backgroundColor: TOWER_MAP_COLOR,
          fontSize: LABEL_FONT_PX,
          lineHeight: 1,
        }}
        title={`Tower ${item.label}`}
      >
        {item.label}
      </div>
    </Marker>
  )
}

function TowerDetailLeader({ item, layout }: Props & { layout: Extract<Layout, { mode: 'detail' }> }) {
  const { widthPx, heightPx, bearingDeg, labelCx } = layout
  const cy = heightPx / 2
  const lineStartX = ARROW_LENGTH_PX

  return (
    <Marker
      longitude={item.towerLon}
      latitude={item.towerLat}
      anchor="left"
      style={{ zIndex: 2 }}
    >
      <div
        className="pointer-events-none select-none"
        style={{
          width: widthPx,
          height: heightPx,
          transform: `rotate(${bearingDeg}deg)`,
          transformOrigin: '0px 50%',
        }}
        title={`Tower ${item.label}`}
      >
        <svg
          width={widthPx}
          height={heightPx}
          viewBox={`0 0 ${widthPx} ${heightPx}`}
          overflow="visible"
          aria-hidden
        >
          <line
            x1={lineStartX}
            y1={cy}
            x2={widthPx}
            y2={cy}
            stroke={TOWER_MAP_COLOR}
            strokeWidth={LINE_STROKE_PX}
            strokeLinecap="round"
          />
          <polygon
            points={`0,${cy} ${ARROW_LENGTH_PX},${cy - ARROW_HALF_HEIGHT_PX} ${ARROW_LENGTH_PX},${cy + ARROW_HALF_HEIGHT_PX}`}
            fill={TOWER_MAP_COLOR}
          />
          <circle cx={labelCx} cy={cy} r={CIRCLE_RADIUS_PX} fill={TOWER_MAP_COLOR} />
          <text
            x={labelCx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
            fontSize={LABEL_FONT_PX}
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {item.label}
          </text>
        </svg>
      </div>
    </Marker>
  )
}

/**
 * Tower overlay: overview circle on the tower when zoomed out; zoomed-in detail mode keeps the
 * map line anchored at the route waypoint, arrow tip on the tower, label slid toward the waypoint.
 */
export function TowerLeaderMarker({ item }: Props) {
  const { current: mapRef } = useMap()
  const [layout, setLayout] = useState<Layout | null>(null)

  useEffect(() => {
    const map = mapRef?.getMap()
    if (!map) return

    const update = () => {
      try {
        setLayout(computeLayout(map, item))
      } catch {
        setLayout(null)
      }
    }

    update()
    map.on('move', update)
    map.on('zoom', update)
    map.on('resize', update)
    map.on('rotate', update)
    map.on('pitch', update)

    return () => {
      map.off('move', update)
      map.off('zoom', update)
      map.off('resize', update)
      map.off('rotate', update)
      map.off('pitch', update)
    }
  }, [mapRef, item.towerLat, item.towerLon, item.waypointLat, item.waypointLon])

  if (!layout) return null
  if (layout.mode === 'overview') {
    return <TowerOverviewCircle item={item} />
  }
  return <TowerDetailLeader item={item} layout={layout} />
}
