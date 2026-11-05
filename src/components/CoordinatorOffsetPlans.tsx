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
import { downloadSortieFpl } from '@/services/sortieFplExport'
import { otherSortieSide, sortie2Explanation, type SortieSide } from '@/services/offsetRouteFpl'
import {
  buildOffsetRoutes,
  resolvePublishedLegWidths,
  routeCurveSide,
  type OffsetLegWidth,
} from '@survey-planning/offsetRoutePlan.js'
import {
  buildCoordinatorCrewOffsetFile,
  coordinatorMissingSideNotice,
  coordinatorOffsetDownloadBlock,
  offsetPointsFromWaypoints,
  SAVED_SIDE_CHANGED_NOTICE,
  sortieButtonLabel,
  type CoordinatorOffsetCrew,
} from '@/services/coordinatorOffsetExport'
import { buildTeamSortieFile, sortie1Side, type TeamPlanTeam } from '@/services/teamPlanRecord'

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

function parseWidthRow(row: PilotWidthRow): OffsetLegWidth | null {
  if (!rowComplete(row)) return null
  return { leftNm: Number(row.left), rightNm: Number(row.right) }
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
  onSidesChange?: (sides: Record<string, SortieSide | null>) => void
}) {
  const { routeLabel, waypoints, widthTexts, widthBusy, widthError, routeKind, onReloadWidths, crews, savedTeams, onSidesChange } = props
  const points = useMemo(() => offsetPointsFromWaypoints(waypoints), [waypoints])
  const legCount = Math.max(0, points.length - 1)
  const [rows, setRows] = useState<PilotWidthRow[]>([])
  const [published, setPublished] = useState<OffsetLegWidth[] | null>(null)
  const [entryMessage, setEntryMessage] = useState<string | null>(null)
  const [faaNotes, setFaaNotes] = useState<string[]>([])
  const [sides, setSides] = useState<Record<string, SortieSide | null>>({})
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({})
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const signature = points.map((point) => point.originalName).join('|')
  const seededSides = useRef(false)

  useEffect(() => {
    if (seededSides.current || !savedTeams?.length) return
    seededSides.current = true
    setSides(Object.fromEntries(savedTeams.map((team) => [team.id, sortie1Side(team)])))
  }, [savedTeams])

  useEffect(() => {
    onSidesChange?.(sides)
  }, [sides, onSidesChange])

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
    if (published) return published
    if (rows.length !== legCount) return null
    const parsed = rows.map(parseWidthRow)
    if (parsed.some((leg) => leg == null)) return null
    return parsed as OffsetLegWidth[]
  }, [published, rows, legCount])

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

  function download(crew: CoordinatorOffsetCrew, sortieNumber: 1 | 2) {
    const pickerSide = sides[crew.id] ?? null
    const saved = savedTeams?.find((team) => team.id === crew.id)
    const savedSide = saved ? sortie1Side(saved) : null
    const fileSide = saved ? savedSide : pickerSide
    const sideChanged = Boolean(saved && pickerSide && pickerSide !== savedSide)
    if (sideChanged || !activeWidths || !fileSide) return
    if (coordinatorOffsetDownloadBlock({ rows: widthRows, sortie1Side: fileSide, nameError })) return
    const file = saved
      ? buildTeamSortieFile({
          team: saved,
          routeLabel,
          points: points.map((point) => ({
            ...point,
            originalName: point.originalName ?? point.ptIdent,
          })),
          legWidths: activeWidths,
          sortieNumber,
        })
      : buildCoordinatorCrewOffsetFile({
          routeLabel,
          points,
          legWidths: activeWidths,
          sortie1Side: fileSide,
          sortieNumber,
          departure: crew.departure,
          destination: crew.destination,
        })
    if ('error' in file) {
      setDownloadErrors((current) => ({ ...current, [crew.id]: file.error }))
      return
    }
    setDownloadErrors((current) => {
      const next = { ...current }
      delete next[crew.id]
      return next
    })
    downloadSortieFpl(file.xml, file.filename)
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Offset flight plans</h2>
        <p className="text-sm text-gray-700 mt-1">
          Inner is halfway from the centerline to the inside of the route&apos;s curve. Outer is halfway to
          the outside. Each crew chooses which side Sortie 1 flies. Sortie 2 is the other side, already
          listed in flying order in its own .fpl file. These half-width files are separate from the team
          lane files.
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

      <div className="max-h-64 overflow-auto rounded border border-gray-200">
        <table className="w-full text-xs">
          <thead className="text-left text-gray-600 sticky top-0 bg-white">
            <tr>
              <th className="px-2 py-1">ForeFlight</th>
              <th className="px-2 py-1">G1000</th>
              <th className="px-2 py-1">Inner</th>
              <th className="px-2 py-1">Outer</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => {
              const center = centerlineNamed.error ? null : centerlineNamed.names[index]
              const inner = built?.inner.waypoints[index]
              const outer = built?.outer.waypoints[index]
              return (
                <tr key={`${point.ptIdent}-${index}`} className="border-t border-gray-100 font-mono">
                  <td className="px-2 py-1">{point.originalName || point.ptIdent}</td>
                  <td className="px-2 py-1">{nameError ? '—' : center?.g1000Name}</td>
                  <td className="px-2 py-1">{nameError || !built ? '—' : inner?.g1000Name}</td>
                  <td className="px-2 py-1">{nameError || !built ? '—' : outer?.g1000Name}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!widthBusy && showEntryTable && (
        <div className="max-h-72 overflow-auto border border-gray-200 rounded-lg">
          <table className="w-full text-xs">
            <thead className="text-left text-gray-600 sticky top-0 bg-white">
              <tr>
                <th className="px-2 py-1">Segment</th>
                <th className="px-2 py-1">Left NM</th>
                <th className="px-2 py-1">Right NM</th>
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

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
          const sortie2Side = fileSide ? otherSortieSide(fileSide) : null
          const canDownload = Boolean(built) && Boolean(fileSide) && !block && !sideChanged
          const sortie1Label = fileSide
            ? `Download ${sortieButtonLabel(1, fileSide, routeCurve)} .fpl`
            : 'Download Sortie 1 .fpl'
          const sortie2Label = sortie2Side
            ? `Download ${sortieButtonLabel(2, sortie2Side, routeCurve)} .fpl`
            : 'Download Sortie 2 .fpl'
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
                      onChange={() => setSides((current) => ({ ...current, [crew.id]: 'inner' }))}
                    />
                    Inner (inside the route&apos;s curve)
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name={`offset-side-${crew.id}`}
                      checked={pickerSide === 'outer'}
                      onChange={() => setSides((current) => ({ ...current, [crew.id]: 'outer' }))}
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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canDownload}
                  onClick={() => download(crew, 1)}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cap-ultramarine text-white disabled:opacity-40"
                >
                  {sortie1Label}
                </button>
                <button
                  type="button"
                  disabled={!canDownload}
                  onClick={() => download(crew, 2)}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cap-ultramarine text-white disabled:opacity-40"
                >
                  {sortie2Label}
                </button>
              </div>
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
