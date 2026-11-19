import { useEffect, useMemo, useRef, useState } from 'react'
import type { AirportRecord, WaypointRecord } from '@/db/schema'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import {
  buildManualSortieFromPtIdents,
  downloadSortieFpl,
  parseOffsetsInput,
  type SortieFplPilotBrief,
} from '@/services/sortieFplExport'
import { buildNamedOffsetSortieFile } from '@/services/teamPlanSortieDownload'
import { crewWaypointPrefix, uniqueSortieFilename } from '@/services/teamPlanRecord'
import { manualRouteName } from '@survey-planning/g1000Names.js'
import { segmentCurveSide } from '@survey-planning/offsetRoutePlan.js'
import type { SortieSide } from '@/services/offsetRouteFpl'
import {
  defaultSortieOffsetsForFragment,
  defaultSortieOffsetsLabelFromWidthTexts,
} from '@/services/sortieOffsetDefaults'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'

const HINT_SORTIE_FRAGMENT_EXPORT = 'flightPlan.sortieExport'

function waypointPtIdent(originalName: string): string {
  const parsed = parseWaypointCode(originalName)
  return parsed?.waypointLetter ?? originalName
}

type RouteMeta = { routeType: string; routeNumber: string } | null

type Props = {
  waypoints: WaypointRecord[]
  teamDeparture: AirportRecord | null
  routeLabel: string
  routeMeta: RouteMeta
  widthTexts: string[]
  legWidths: Array<{ leftNm: number; rightNm: number } | null> | null
  departureMissingMessage: string
  onPilotBrief: (brief: SortieFplPilotBrief) => void
  trackPolicy?: { firstOffsetNm?: number; stepNm?: number }
  distanceLimitNm?: number
  reservedRouteNames?: string[]
}

/**
 * Manual From/To serpentine G1000 export for one coordinator sortie fragment.
 */
export function SortieFragmentExportCard({
  waypoints,
  teamDeparture,
  routeLabel,
  routeMeta,
  widthTexts,
  legWidths,
  departureMissingMessage,
  onPilotBrief,
  trackPolicy,
  distanceLimitNm = 400,
  reservedRouteNames = [],
}: Props) {
  const { isSeen, markSeen } = useHintsSeen()
  const [showSortieExport, setShowSortieExport] = useState(false)
  const [sortieFromPt, setSortieFromPt] = useState('')
  const [sortieToPt, setSortieToPt] = useState('')
  const [sortieStartAt, setSortieStartAt] = useState('')
  const [sortieSide, setSortieSide] = useState<SortieSide>('inner')
  const [sortieOffsets, setSortieOffsets] = useState('')
  const [sortieOffsetsHint, setSortieOffsetsHint] = useState<string | null>(null)
  const sortieOffsetsUserEditedRef = useRef(false)
  const [sortieExportErr, setSortieExportErr] = useState<string | null>(null)
  const exportNames = useRef(new Map<string, number>())

  const waypointPtIdents = useMemo(
    () => waypoints.map((w) => waypointPtIdent(w.originalName)),
    [waypoints]
  )

  const surveyWaypoints = useMemo(
    () =>
      waypoints.map((w) => ({
        ptIdent: waypointPtIdent(w.originalName),
        lat: w.latitude,
        lon: w.longitude,
      })),
    [waypoints]
  )

  const irVrMeta = useMemo(() => {
    if (routeMeta && (routeMeta.routeType === 'IR' || routeMeta.routeType === 'VR')) {
      return { routeType: routeMeta.routeType as 'IR' | 'VR', routeNumber: routeMeta.routeNumber }
    }
    return null
  }, [routeMeta])

  useEffect(() => {
    sortieOffsetsUserEditedRef.current = false
    setSortieOffsetsHint(null)
    setShowSortieExport(false)
    setSortieFromPt('')
    setSortieToPt('')
    setSortieStartAt('')
    setSortieExportErr(null)
  }, [waypoints])

  useEffect(() => {
    if (sortieOffsetsUserEditedRef.current || widthTexts.length === 0 || !irVrMeta) return

    const label =
      sortieFromPt && sortieToPt
        ? defaultSortieOffsetsForFragment({
            routeType: irVrMeta.routeType,
            routeNumber: irVrMeta.routeNumber,
            widthTexts,
            waypoints: surveyWaypoints,
            fromPt: sortieFromPt,
            toPt: sortieToPt,
            policy: trackPolicy,
          })
        : defaultSortieOffsetsLabelFromWidthTexts(widthTexts, trackPolicy)

    setSortieOffsets(label)
    setSortieOffsetsHint(
      label
        ? `From NASR corridor width for this route (${label} NM). A pass past the corridor edge is not included.`
        : 'No published width for this side.'
    )
  }, [widthTexts, irVrMeta, surveyWaypoints, sortieFromPt, sortieToPt, trackPolicy])

  const sortieEndpointOptions = (() => {
    if (!sortieFromPt || !sortieToPt) return [] as string[]
    const lo = waypointPtIdents.indexOf(sortieFromPt)
    const hi = waypointPtIdents.indexOf(sortieToPt)
    if (lo < 0 || hi < 0 || lo === hi) return []
    const a = waypointPtIdents[Math.min(lo, hi)]
    const b = waypointPtIdents[Math.max(lo, hi)]
    return [a, b]
  })()

  const sortieDistance = useMemo(() => {
    if (!teamDeparture || !legWidths || !sortieFromPt || !sortieToPt) return null
    try {
      const offsets = parseOffsetsInput(sortieOffsets)
      if (offsets.length === 0) return null
      return buildNamedOffsetSortieFile({
        points: waypoints.map((waypoint) => ({
          ptIdent: waypointPtIdent(waypoint.originalName),
          originalName: waypoint.originalName,
          lat: waypoint.latitude,
          lon: waypoint.longitude,
          g1000Name: waypoint.g1000Name,
        })),
        legWidths,
        fromPt: sortieFromPt,
        toPt: sortieToPt,
        side: sortieSide,
        departure: teamDeparture,
        landing: teamDeparture,
        routeLabel,
        sortieNumber: 1,
        offsets,
        policy: trackPolicy,
        startAt: sortieStartAt,
        namePrefix: crewWaypointPrefix(teamDeparture.identifier, [teamDeparture.identifier]),
      })
    } catch {
      return null
    }
  }, [teamDeparture, legWidths, sortieFromPt, sortieToPt, sortieOffsets, sortieSide, waypoints, routeLabel, trackPolicy, sortieStartAt])

  const handleSortieExport = () => {
    if (!teamDeparture) {
      setSortieExportErr(departureMissingMessage)
      return
    }
    setSortieExportErr(null)
    try {
      if (!legWidths) {
        setSortieExportErr('No published width for this segment.')
        return
      }
      const offsets = parseOffsetsInput(sortieOffsets)
      const sortie = buildManualSortieFromPtIdents({
        waypoints,
        fromPt: sortieFromPt,
        toPt: sortieToPt,
        startAt: sortieStartAt,
        offsets,
        teamDeparture,
        routeLabel,
      })
      const file = buildNamedOffsetSortieFile({
        points: waypoints.map((waypoint) => ({
          ptIdent: waypointPtIdent(waypoint.originalName),
          originalName: waypoint.originalName,
          lat: waypoint.latitude,
          lon: waypoint.longitude,
          g1000Name: waypoint.g1000Name,
        })),
        legWidths,
        fromPt: sortie.waypointFrom,
        toPt: sortie.waypointTo,
        side: sortieSide,
        departure: teamDeparture,
        landing: teamDeparture,
        routeLabel,
        sortieNumber: 1,
        offsets,
        policy: trackPolicy,
        startAt: sortie.startAt,
        namePrefix: crewWaypointPrefix(teamDeparture.identifier, [teamDeparture.identifier]),
      })
      const filename = uniqueSortieFilename(file.filename, exportNames.current)
      const routeName = manualRouteName(filename, sortieSide, reservedRouteNames)
      const xml = file.xml.replace(/<route-name>[^<]*<\/route-name>/, `<route-name>${routeName}</route-name>`)
      downloadSortieFpl(xml, filename)
      const userBlock = file.xml.split('<waypoint>').find((part) => part.includes('USER WAYPOINT'))
      const laneExample = userBlock?.match(/<identifier>([^<]+)/)?.[1]
      const curve = segmentCurveSide(
        waypoints.map((waypoint) => ({
          ptIdent: waypointPtIdent(waypoint.originalName),
          lat: waypoint.latitude,
          lon: waypoint.longitude,
        })),
        sortie.waypointFrom,
        sortie.waypointTo
      )
      onPilotBrief({
        teamLabel: teamDeparture.identifier,
        side: sortieSide,
        rangeLabel: `${sortie.waypointFrom}→${sortie.waypointTo}`,
        startAt: sortie.startAt,
        passCount: offsets.length,
        offsetsLabel: offsets.join(', '),
        ferryInLabel: teamDeparture.identifier,
        ferryOutLabel: teamDeparture.identifier,
        warnRoutePointLimit: false,
        routePointCount: (file.xml.match(/<waypoint-type>USER WAYPOINT<\/waypoint-type>/g) ?? []).length,
        filename,
        turnDeg: file.maxTurnDeg,
        laneExample,
        sideNote: curve.note ?? undefined,
      })
      setShowSortieExport(false)
    } catch (e) {
      setSortieExportErr(e instanceof Error ? e.message : 'Failed to export sortie .fpl')
    }
  }

  const toggleSortieExport = () => {
    setShowSortieExport((v) => !v)
    setSortieExportErr(null)
    if (!sortieFromPt && waypointPtIdents.length >= 2) {
      setSortieFromPt(waypointPtIdents[0])
      setSortieToPt(waypointPtIdents[waypointPtIdents.length - 1])
      setSortieStartAt(waypointPtIdents[0])
    }
  }

  if (waypoints.length < 2) return null

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={toggleSortieExport}
          className="flex-1 min-w-0 text-left"
          aria-expanded={showSortieExport}
        >
          <span className="font-semibold text-gray-900 block">Solo / manual export (.fpl)</span>
          {!showSortieExport && (
            <span className="text-gray-500 text-sm font-normal mt-0.5 block">
              That sortie&apos;s lanes, from departure to landing.
            </span>
          )}
        </button>
        <GuidedHint
          hintId={HINT_SORTIE_FRAGMENT_EXPORT}
          stepNumber={7}
          title="Sortie fragment vs planner export"
          body={
            <>
              Use <strong>Export sortie .fpl</strong> here for one coordinator sortie: a serpentine
              sub-route between your From/To waypoints. After you run the
              planner, each results row can also export a G1000 file for that assignment. Email each
              file to that aircraft&apos;s Mission Pilot (or copy it to an SD card). Aircrew full-route
              export stays on the flight plan detail page.
              <br />
              <br />
              Copy the file to the SD card root, eject before removing the card, then import on the G1000.
              <br />
              <br />
              <strong>Multi-aircraft:</strong> pilots deconflict with radio contact and staggered
              takeoffs. On recovery days, all aircraft use the same refuel airport; sortie 1 ferry out ends
              there; sortie 2 returns home. Trim unused waypoints from the <strong>active route only</strong>{' '}
              (user waypoints remain in G1000 memory).
            </>
          }
          isSeen={isSeen(HINT_SORTIE_FRAGMENT_EXPORT)}
          onDismiss={markSeen}
          surface="light"
        />
        <button
          type="button"
          onClick={toggleSortieExport}
          className="text-gray-500 text-sm font-normal shrink-0 px-1 py-0.5 hover:bg-gray-100 rounded"
          aria-label={showSortieExport ? 'Collapse sortie export' : 'Expand sortie export'}
        >
          {showSortieExport ? '−' : '+'}
        </button>
      </div>
      {showSortieExport && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-gray-600">
            Build a serpentine G1000 route for one coordinator sortie: team departure and waypoint
            sub-range. Uses Team 1 or the plan departure (
            {teamDeparture?.identifier ?? 'not set'}) for ferry legs.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-gray-700 font-medium">From</span>
              <select
                value={sortieFromPt}
                onChange={(e) => {
                  setSortieFromPt(e.target.value)
                  setSortieStartAt(e.target.value)
                }}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select…</option>
                {waypointPtIdents.map((pt, i) => (
                  <option key={`from-${i}-${pt}`} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-gray-700 font-medium">To</span>
              <select
                value={sortieToPt}
                onChange={(e) => setSortieToPt(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select…</option>
                {waypointPtIdents.map((pt, i) => (
                  <option key={`to-${i}-${pt}`} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-gray-700 font-medium">Start at (first leg)</span>
            <select
              value={sortieStartAt}
              onChange={(e) => setSortieStartAt(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Select…</option>
              {sortieEndpointOptions.map((pt, i) => (
                <option key={`start-${i}-${pt}`} value={pt}>
                  {pt}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-gray-700 font-medium">Side</span>
            <select
              value={sortieSide}
              onChange={(e) => setSortieSide(e.target.value === 'outer' ? 'outer' : 'inner')}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="inner">Inner</option>
              <option value="outer">Outer</option>
            </select>
          </label>
          <label className="block">
            <span className="text-gray-700 font-medium">Lane spacing (NM)</span>
            <input
              type="text"
              value={sortieOffsets}
              onChange={(e) => {
                sortieOffsetsUserEditedRef.current = true
                setSortieOffsets(e.target.value)
                setSortieOffsetsHint(null)
              }}
              placeholder="3, 9, 15"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono"
            />
            {sortieOffsetsHint && (
              <p className="text-xs text-gray-500 mt-1">{sortieOffsetsHint}</p>
            )}
          </label>
          {sortieExportErr && (
            <p className="text-red-700" role="alert">
              {sortieExportErr}
            </p>
          )}
          <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
            <strong className="font-medium text-gray-700">Sortie only</strong> — serpentine sub-route
            for the From/To range above. For{' '}
            <strong className="font-medium text-gray-700">every waypoint in the linked plan</strong>, crews
            use <strong className="font-medium text-gray-700">Export full route (.fpl)</strong> on Flight
            Plan detail. After running the planner, each results row can export that assignment. Email
            each sortie file to that aircraft&apos;s Mission Pilot.
          </p>
          {sortieDistance && sortieDistance.distanceNm > distanceLimitNm && (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2" role="alert">
              Over the distance limit: this sortie is {sortieDistance.distanceNm} NM and the limit is {distanceLimitNm} NM.
            </p>
          )}
          <button
            type="button"
            onClick={handleSortieExport}
            className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90"
          >
            Export sortie .fpl
          </button>
        </div>
      )}
    </section>
  )
}
