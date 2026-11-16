import { useEffect, useMemo, useRef, useState } from 'react'
import { assignG1000WaypointNames } from '@/utils/g1000WaypointName'
import {
  legEntryReason,
  mergeReloadedWidths,
  pilotEntryMessage,
  publishedWidthNote,
  rowComplete,
  type PilotWidthRow,
} from '@/services/offsetPilotEntry'
import { db } from '@/db/schema'
import {
  assessSavedOffsetPlan,
  freshnessForSavedPlan,
  RESAVE_IN_MAP_VIEW,
} from '@/services/offsetPlanRecord'
import { sortie2Explanation, type SortieSide } from '@/services/offsetRouteFpl'
import {
  buildOffsetRoutes,
  resolvePublishedLegWidths,
  routeCurveSide,
  type OffsetLegWidth,
} from '@survey-planning/offsetRoutePlan.js'
import {
  coordinatorMissingSideNotice,
  coordinatorOffsetDownloadBlock,
  offsetPointsFromWaypoints,
  SAVED_SIDE_CHANGED_NOTICE,
  type CoordinatorOffsetCrew,
} from '@/services/coordinatorOffsetExport'
import { sortie1Side, type TeamPlanTeam } from '@/services/teamPlanRecord'

const G1000_DELETE_NOTE =
  "Before loading: delete earlier flight plans and user waypoints from the G1000 (per DO policy). If the G1000 shows 'One or more user waypoints renamed', old waypoints are still stored. Delete them and reload."

const SR_WIDTH_MESSAGE =
  'SR routes have no FAA corridor width. Enter left and right nautical miles from Military Flight Bag / AP/1B. Nothing is guessed.'

function emptyRow(): PilotWidthRow {
  return { left: '', right: '', source: 'empty', reason: null, clause: null }
}

function blankRows(count: number): PilotWidthRow[] {
  return Array.from({ length: count }, () => emptyRow())
}

function parseTrackField(text: string): number | null | 'invalid' {
  if (text.trim() === '') return null
  const nm = Number(text)
  if (!Number.isFinite(nm) || nm < 0) return 'invalid'
  return nm
}

function parseWidthRow(row: PilotWidthRow, track?: { left: string; right: string }): OffsetLegWidth | null {
  if (!rowComplete(row)) return null
  const trackLeftNm = parseTrackField(track?.left ?? '')
  const trackRightNm = parseTrackField(track?.right ?? '')
  if (trackLeftNm === 'invalid' || trackRightNm === 'invalid') return null
  return { leftNm: Number(row.left), rightNm: Number(row.right), trackLeftNm, trackRightNm }
}

export function CoordinatorOffsetPlans(props: {
  routeLabel: string
  waypoints: Array<{ originalName: string; g1000Name?: string; latitude: number; longitude: number }>
  widthTexts: string[]
  widthBusy: boolean
  widthError: string | null
  routeKind: 'irvr' | 'sr' | 'other'
  onReloadWidths: () => void
  crews: CoordinatorOffsetCrew[]
  /** Saved team plan. When a crew is in it, the .fpl uses that crew's segment. */
  savedTeams?: TeamPlanTeam[]
  /** Sides chosen on the page. When set, the radios show these and do not write an empty choice back. */
  sides?: Record<string, SortieSide | null>
  onSidesChange?: (sides: Record<string, SortieSide | null>) => void
  /** When set, a stale solo offset plan holds these crew offset downloads. Lane files are separate. */
  flightPlanId?: string
}) {
  const { routeLabel, waypoints, widthTexts, widthBusy, widthError, routeKind, onReloadWidths, crews, savedTeams, sides: controlledSides, onSidesChange, flightPlanId } = props
  const points = useMemo(() => offsetPointsFromWaypoints(waypoints), [waypoints])
  const legCount = Math.max(0, points.length - 1)
  const [rows, setRows] = useState<PilotWidthRow[]>([])
  const [trackRows, setTrackRows] = useState<Array<{ left: string; right: string }>>([])
  const [exportHold, setExportHold] = useState<string | null>(null)
  const [published, setPublished] = useState<OffsetLegWidth[] | null>(null)
  const [entryMessage, setEntryMessage] = useState<string | null>(null)
  const [faaNotes, setFaaNotes] = useState<string[]>([])
  const [localSides, setLocalSides] = useState<Record<string, SortieSide | null>>({})
  const sides = controlledSides ?? localSides
  const [downloadErrors] = useState<Record<string, string>>({})
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const signature = points.map((point) => point.originalName).join('|')
  const seededSides = useRef(false)

  useEffect(() => {
    if (controlledSides || seededSides.current || !savedTeams?.length) return
    seededSides.current = true
    setLocalSides(Object.fromEntries(savedTeams.map((team) => [team.id, sortie1Side(team)])))
  }, [savedTeams, controlledSides])

  useEffect(() => {
    if (controlledSides) return
    onSidesChange?.(sides)
  }, [sides, onSidesChange, controlledSides])

  const chooseSide = (crewId: string, side: SortieSide) => {
    const next = { ...sides, [crewId]: side }
    if (controlledSides) onSidesChange?.(next)
    else setLocalSides(next)
  }

  useEffect(() => {
    setTrackRows((current) =>
      current.length === legCount ? current : Array.from({ length: legCount }, () => ({ left: '', right: '' }))
    )
  }, [legCount])

  useEffect(() => {
    if (!flightPlanId) {
      setExportHold(null)
      return
    }
    let cancelled = false
    void db.offsetPlans.get(flightPlanId).then((saved) => {
      if (cancelled) return
      if (!saved) {
        setExportHold(null)
        return
      }
      const decision = assessSavedOffsetPlan(
        saved,
        freshnessForSavedPlan({
          waypoints: points.map((point) => ({
            originalName: point.originalName ?? point.ptIdent,
            lat: point.lat,
            lon: point.lon,
          })),
          saved,
          sortie1Side: saved.sortie1Side,
          departureIdent: saved.departureIdent ?? null,
          destinationIdent: saved.destinationIdent ?? null,
        })
      )
      setExportHold(decision.status === 'match' ? null : RESAVE_IN_MAP_VIEW)
    })
    return () => {
      cancelled = true
    }
  }, [flightPlanId, points])

  useEffect(() => {
    if (points.length < 2) return
    if (routeKind === 'sr') {
      setPublished(null)
      setFaaNotes([])
      setEntryMessage(SR_WIDTH_MESSAGE)
      setRows(blankRows(legCount))
      return
    }
    if (routeKind !== 'irvr') {
      setPublished(null)
      setFaaNotes([])
      setEntryMessage(
        'This sequence is not one IR or VR route, so FAA widths are not applied. Enter left and right nautical miles for each segment.'
      )
      setRows(blankRows(legCount))
      return
    }
    if (widthBusy) return
    if (widthError) {
      setPublished(null)
      setFaaNotes([])
      setEntryMessage(
        `FAA widths could not be loaded (${widthError}). Enter left and right nautical miles. Nothing was guessed.`
      )
      setRows((current) => (current.length === legCount ? current : blankRows(legCount)))
      return
    }
    const resolved = resolvePublishedLegWidths(points, widthTexts)
    const notes = [
      ...(resolved.status === 'published'
        ? resolved.unparsed.map((clause) => `FAA text not readable: ${clause}`)
        : []),
      ...resolved.exclusions.map((clause) => `FAA text leaves this out: ${clause}`),
    ]
    const faaRows = blankRows(legCount).map((row, index) => {
      const known = resolved.legs[index]
      if (known) {
        return {
          left: String(known.leftNm),
          right: String(known.rightNm),
          source: 'faa' as const,
          reason: null,
          clause: null,
        }
      }
      const gap = resolved.missing.find((leg) => leg.index === index)
      return {
        ...row,
        reason: gap?.reason ?? 'not-covered',
        clause: gap?.clause ?? null,
      }
    })
    const seeded = mergeReloadedWidths(faaRows, rowsRef.current)
    setFaaNotes(notes)
    if (resolved.status === 'published' && seeded.every((row) => row.source === 'faa')) {
      setPublished(resolved.legs.flatMap((leg) => (leg ? [leg] : [])))
      setEntryMessage(null)
      setRows(seeded)
      return
    }
    const filled = seeded.filter((row) => row.source === 'faa').length
    setPublished(null)
    setEntryMessage(pilotEntryMessage(filled, legCount))
    setRows(seeded)
  }, [signature, legCount, points, widthTexts, widthBusy, widthError, routeKind])

  const activeWidths = useMemo(() => {
    const tracks = trackRows.length === legCount ? trackRows : []
    const withTrack = (leg: OffsetLegWidth, index: number): OffsetLegWidth | null => {
      const trackLeftNm = parseTrackField(tracks[index]?.left ?? '')
      const trackRightNm = parseTrackField(tracks[index]?.right ?? '')
      if (trackLeftNm === 'invalid' || trackRightNm === 'invalid') return null
      return { ...leg, trackLeftNm, trackRightNm }
    }
    if (published) {
      const parsed = published.map(withTrack)
      if (parsed.some((leg) => leg == null)) return null
      return parsed as OffsetLegWidth[]
    }
    if (rows.length !== legCount) return null
    const parsed = rows.map((row, index) => parseWidthRow(row, tracks[index]))
    if (parsed.some((leg) => leg == null)) return null
    return parsed as OffsetLegWidth[]
  }, [published, rows, trackRows, legCount])

  const built = useMemo(() => {
    if (!activeWidths || points.length < 2) return null
    try {
      return buildOffsetRoutes(points, activeWidths)
    } catch {
      return null
    }
  }, [activeWidths, points])

  const centerlineNamed = useMemo(
    () => assignG1000WaypointNames(points.map((point) => ({ originalName: point.originalName || point.ptIdent }))),
    [points]
  )
  const nameError = centerlineNamed.error || built?.nameError || null
  const faaLegs = useMemo(() => {
    if (published) {
      return published.flatMap((leg) =>
        leg.fromPt && leg.toPt ? [{ fromPt: leg.fromPt, toPt: leg.toPt, leftNm: leg.leftNm, rightNm: leg.rightNm }] : []
      )
    }
    return rows.flatMap((row, index) => {
      if (row.source !== 'faa' || !rowComplete(row)) return []
      return [
        {
          fromPt: points[index]?.ptIdent ?? '',
          toPt: points[index + 1]?.ptIdent ?? '',
          leftNm: Number(row.left),
          rightNm: Number(row.right),
        },
      ]
    })
  }, [published, rows, points])
  const pilotEntered = rows.some((row) => row.source === 'pilot' && rowComplete(row))
  const widthNote = publishedWidthNote(routeLabel, faaLegs, pilotEntered)
  const showEntryTable = !published && rows.length > 0

  if (waypoints.length < 2) return null
  const routeCurve = routeCurveSide(points)
  const widthRows = published
    ? published.map((leg) => ({ left: String(leg.leftNm), right: String(leg.rightNm) }))
    : rows

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Sortie 1 side</h2>
        <p className="text-sm text-gray-700 mt-1">
          Inner is the inside of that piece of the route. Each crew chooses which side its first survey
          sortie flies. With two aircraft, that crew stays on the chosen side of the centerline for every
          sortie. Each sortie lists its side; fly the side shown.
        </p>
        {widthBusy && <p className="text-sm text-gray-600 mt-2">Loading FAA widths…</p>}
      </div>

      {!widthBusy && widthNote && <p className="text-sm text-gray-800">{widthNote}</p>}
      {!widthBusy && entryMessage && (
        <p className="text-sm text-gray-900 rounded-lg border border-cap-yellow bg-cap-yellow/25 px-3 py-2">
          {entryMessage}
        </p>
      )}
      {nameError && (
        <p className="text-sm text-cap-pimento" role="alert">
          {nameError}
        </p>
      )}
      {faaNotes.length > 0 && (
        <ul className="text-sm text-gray-800 list-disc pl-5 space-y-1">
          {faaNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {!widthBusy && showEntryTable && (
        <div className="max-h-72 overflow-auto border border-gray-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="text-left text-gray-600 sticky top-0 bg-white">
              <tr>
                <th className="px-2 py-1">Segment</th>
                <th className="px-2 py-1">Corridor left NM</th>
                <th className="px-2 py-1">Corridor right NM</th>
                <th className="px-2 py-1">Track offset left NM</th>
                <th className="px-2 py-1">Track offset right NM</th>
              </tr>
            </thead>
            <tbody>
              {points.slice(0, -1).map((point, index) => {
                const row = rows[index]
                const nextPoint = points[index + 1]
                const needsEntry = !row || !rowComplete(row)
                const why = legEntryReason(row?.reason ?? null, row?.clause)
                return (
                  <tr
                    key={`${point.ptIdent}-${index}`}
                    className={`border-t border-gray-100 ${needsEntry ? 'bg-cap-yellow/25' : ''}`}
                  >
                    <td className="px-2 py-1 font-mono">
                      <div>
                        {point.ptIdent}–{nextPoint?.ptIdent}
                      </div>
                      {row?.source === 'pilot' && rowComplete(row) && (
                        <div className="text-cap-ultramarine">entered by pilot</div>
                      )}
                      {needsEntry && why && <div className="text-gray-800">{why}</div>}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Left width ${point.ptIdent} to ${nextPoint?.ptIdent}`}
                        value={row?.left ?? ''}
                        onChange={(event) => {
                          const next = rows.slice()
                          next[index] = {
                            left: event.target.value,
                            right: rows[index]?.right ?? '',
                            source: 'pilot',
                            reason: rows[index]?.reason ?? null,
                            clause: rows[index]?.clause ?? null,
                          }
                          setPublished(null)
                          setRows(next)
                        }}
                        className="w-20 px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Right width ${point.ptIdent} to ${nextPoint?.ptIdent}`}
                        value={row?.right ?? ''}
                        onChange={(event) => {
                          const next = rows.slice()
                          next[index] = {
                            left: rows[index]?.left ?? '',
                            right: event.target.value,
                            source: 'pilot',
                            reason: rows[index]?.reason ?? null,
                            clause: rows[index]?.clause ?? null,
                          }
                          setPublished(null)
                          setRows(next)
                        }}
                        className="w-20 px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Track offset left ${point.ptIdent} to ${nextPoint?.ptIdent}`}
                        value={trackRows[index]?.left ?? ''}
                        onChange={(event) => {
                          const next = trackRows.slice()
                          next[index] = { left: event.target.value, right: trackRows[index]?.right ?? '' }
                          setTrackRows(next)
                        }}
                        className="w-20 px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        aria-label={`Track offset right ${point.ptIdent} to ${nextPoint?.ptIdent}`}
                        value={trackRows[index]?.right ?? ''}
                        onChange={(event) => {
                          const next = trackRows.slice()
                          next[index] = { left: trackRows[index]?.left ?? '', right: event.target.value }
                          setTrackRows(next)
                        }}
                        className="w-20 px-2 py-1 rounded border border-gray-300 bg-white text-gray-900"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {exportHold && <p className="text-sm text-gray-900">{exportHold}</p>}
      <div className="space-y-4">
        {crews.map((crew) => {
          const pickerSide = sides[crew.id] ?? null
          const saved = savedTeams?.find((team) => team.id === crew.id)
          const savedSide = saved ? sortie1Side(saved) : null
          const fileSide = saved ? savedSide : pickerSide
          const sideChanged = Boolean(saved && pickerSide && pickerSide !== savedSide)
          const block = coordinatorOffsetDownloadBlock({
            rows: widthRows,
            sortie1Side: fileSide,
            nameError,
          })
          return (
            <div key={crew.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
              <p className="font-medium text-gray-900">{crew.label}</p>
              {saved && (
                <p className="text-sm text-gray-700">
                  {saved.segmentFrom && saved.segmentTo
                    ? `${saved.segmentFrom}–${saved.segmentTo}`
                    : 'No segment assigned.'}
                  {saved.departure ? ` · ${saved.departure.identifier}` : ''}
                  {saved.landing && saved.landing.identifier !== saved.departure?.identifier
                    ? ` landing ${saved.landing.identifier}`
                    : ''}
                </p>
              )}
              <p className="text-sm text-gray-700">{sortie2Explanation(crew.departure?.identifier)}</p>
              {!crew.departure && (
                <p className="text-sm text-gray-600">
                  Look up this crew&apos;s departure to put airports in the file.
                </p>
              )}
              <fieldset>
                <legend className="text-sm font-medium text-gray-700 mb-1">Sortie 1 side</legend>
                <div className={`flex flex-wrap gap-4 text-sm rounded-lg px-2 py-1 ${pickerSide ? '' : 'border border-cap-yellow'}`}>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name={`offset-side-${crew.id}`}
                      checked={pickerSide === 'inner'}
                      onChange={() => chooseSide(crew.id, 'inner')}
                    />
                    Inner (inside the route&apos;s curve)
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name={`offset-side-${crew.id}`}
                      checked={pickerSide === 'outer'}
                      onChange={() => chooseSide(crew.id, 'outer')}
                    />
                    Outer (outside the route&apos;s curve)
                  </label>
                </div>
                {routeCurve.note && <p className="text-sm text-gray-700 mt-2">{routeCurve.note}</p>}
              </fieldset>
              {!saved && !pickerSide && (
                <p className="text-sm text-gray-900 rounded-lg bg-cap-yellow px-3 py-2">{coordinatorMissingSideNotice()}</p>
              )}
              {sideChanged && (
                <p className="text-sm text-gray-900 rounded-lg bg-cap-yellow px-3 py-2" role="status">
                  {SAVED_SIDE_CHANGED_NOTICE}
                </p>
              )}
              {block && (saved || pickerSide) && (
                <p className="text-sm text-cap-pimento" role="alert">
                  {block}
                </p>
              )}
              {downloadErrors[crew.id] && (
                <p className="text-sm text-cap-pimento" role="alert">
                  {downloadErrors[crew.id]}
                </p>
              )}
            </div>
          )
        })}
        {routeKind === 'irvr' && (
          <button
            type="button"
            onClick={onReloadWidths}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cap-silver text-cap-ultramarine hover:bg-cap-yellow"
          >
            Reload FAA widths
          </button>
        )}
        <p className="text-sm rounded-lg bg-cap-yellow text-cap-ultramarine px-3 py-2">{G1000_DELETE_NOTE}</p>
      </div>
    </section>
  )
}
