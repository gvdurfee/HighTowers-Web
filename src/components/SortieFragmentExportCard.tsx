import { useEffect, useMemo, useRef, useState } from 'react'
import type { AirportRecord, WaypointRecord } from '@/db/schema'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import {
  buildManualSortieFromPtIdents,
  exportSortieFplDownload,
  parseOffsetsInput,
  type SortieFplPilotBrief,
} from '@/services/sortieFplExport'
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
  departureMissingMessage: string
  onPilotBrief: (brief: SortieFplPilotBrief) => void
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
  departureMissingMessage,
  onPilotBrief,
}: Props) {
  const { isSeen, markSeen } = useHintsSeen()
  const [showSortieExport, setShowSortieExport] = useState(false)
  const [sortieFromPt, setSortieFromPt] = useState('')
  const [sortieToPt, setSortieToPt] = useState('')
  const [sortieStartAt, setSortieStartAt] = useState('')
  const [sortieOffsets, setSortieOffsets] = useState('3, 9, 15, 21')
  const [sortieOffsetsHint, setSortieOffsetsHint] = useState<string | null>(null)
  const sortieOffsetsUserEditedRef = useRef(false)
  const [sortieExportErr, setSortieExportErr] = useState<string | null>(null)

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
          })
        : defaultSortieOffsetsLabelFromWidthTexts(widthTexts)

    setSortieOffsets(label)
    setSortieOffsetsHint(
      `From NASR corridor width for this route (${label} NM parallel-track spacing). Edit if your wing SOP differs.`
    )
  }, [widthTexts, irVrMeta, surveyWaypoints, sortieFromPt, sortieToPt])

  const sortieEndpointOptions = (() => {
    if (!sortieFromPt || !sortieToPt) return [] as string[]
    const lo = waypointPtIdents.indexOf(sortieFromPt)
    const hi = waypointPtIdents.indexOf(sortieToPt)
    if (lo < 0 || hi < 0 || lo === hi) return []
    const a = waypointPtIdents[Math.min(lo, hi)]
    const b = waypointPtIdents[Math.max(lo, hi)]
    return [a, b]
  })()

  const handleSortieExport = () => {
    if (!teamDeparture) {
      setSortieExportErr(departureMissingMessage)
      return
    }
    setSortieExportErr(null)
    try {
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
      const brief = exportSortieFplDownload({
        waypoints,
        sortie,
        teamDeparture,
        routeLabel,
        teamLabel: teamDeparture.identifier,
        side: 'manual fragment',
      })
      onPilotBrief(brief)
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
          <span className="font-semibold text-gray-900 block">Export sortie fragment (.fpl)</span>
          {!showSortieExport && (
            <span className="text-gray-500 text-sm font-normal mt-0.5 block">
              One sortie&apos;s serpentine legs — not the full plan
            </span>
          )}
        </button>
        <GuidedHint
          hintId={HINT_SORTIE_FRAGMENT_EXPORT}
          stepNumber={6}
          title="Sortie fragment vs planner export"
          body={
            <>
              Use <strong>Export sortie .fpl</strong> here for one coordinator sortie: a serpentine
              sub-route between your From/To waypoints with parallel-track offsets. After you run the
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
            Build a serpentine G1000 route for one coordinator sortie: team departure, waypoint
            sub-range, and parallel-track offsets. Uses Team 1 or the plan departure (
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
            <span className="text-gray-700 font-medium">Offsets (NM)</span>
            <input
              type="text"
              value={sortieOffsets}
              onChange={(e) => {
                sortieOffsetsUserEditedRef.current = true
                setSortieOffsets(e.target.value)
                setSortieOffsetsHint(null)
              }}
              placeholder="3, 9, 15, 21"
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
