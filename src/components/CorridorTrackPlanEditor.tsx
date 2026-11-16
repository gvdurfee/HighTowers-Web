import { GuidedHint } from '@/components/GuidedHint'
import {
  formatSpanLabel,
  resetRowOffsetsToDefault,
  spanTrackFitWarnings,
  type SpanTrackRowState,
} from '@/utils/coordinatorSpanTrackPlan'

const HINT_COORD_CORRIDOR_TRACKS = 'coordinatorSurvey.corridorTracks'

const OFFSET_INPUT_CLASS =
  'w-full min-w-[7rem] px-2 py-1.5 border border-gray-300 rounded text-xs font-mono focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent'
const NM_INPUT_CLASS =
  'w-16 px-2 py-1.5 border border-gray-300 rounded text-xs tabular-nums focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent'

type CorridorTrackPlanEditorProps = {
  spanTrackRows: SpanTrackRowState[]
  onSpanTrackRowsChange: (rows: SpanTrackRowState[]) => void
  firstOffsetNm: number
  stepNm: number
  onFirstOffsetNmChange: (value: number) => void
  onStepNmChange: (value: number) => void
  widthBusy: boolean
  widthErr: string | null
  spanTrackErr: string | null
  isSeen: (id: string) => boolean
  markSeen: (id: string) => void
  widthLabels?: { left: string; right: string }
  widthHelp?: string
  legPreview?: {
    fromPt: string
    toPt: string
    leftNm: number | null
    rightNm: number | null
    leftOffsets: number[]
    rightOffsets: number[]
    leftNote?: string | null
    rightNote?: string | null
    chainNm: number
  }[]
  /** Widths and tracks are separate review sections. Omit to show both together. */
  part?: 'widths' | 'tracks'
}

export function CorridorTrackPlanEditor({
  spanTrackRows,
  onSpanTrackRowsChange,
  firstOffsetNm,
  stepNm,
  onFirstOffsetNmChange,
  onStepNmChange,
  widthBusy,
  widthErr,
  spanTrackErr,
  isSeen,
  markSeen,
  widthLabels = { left: 'Left NM', right: 'Right NM' },
  widthHelp,
  legPreview,
  part,
}: CorridorTrackPlanEditorProps) {
  const showWidths = part !== 'tracks'
  const showTracks = part !== 'widths'
  const updateRow = (index: number, patch: Partial<SpanTrackRowState>) => {
    onSpanTrackRowsChange(
      spanTrackRows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
  }

  const resetRowDefaults = (index: number) => {
    onSpanTrackRowsChange(
      spanTrackRows.map((row, i) =>
        i === index ? resetRowOffsetsToDefault(row, { firstOffsetNm, stepNm }) : row
      )
    )
  }

  return (
    <div className={part ? '' : 'mt-5 border-t border-gray-200 pt-5'}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          {!part && <h3 className="text-base font-semibold text-gray-900">Corridor and lane spacing</h3>}
          <p className="text-sm text-gray-700 mt-1 max-w-2xl">
            {showWidths && !showTracks
              ? 'Published width for each span, in nautical miles, left and right of centerline as flown.'
              : showTracks && !showWidths
                ? 'Lane spacing is nautical miles, inner then outer. A pass past the published edge is left out.'
                : 'NASR width defines each span. Lane spacing is nautical miles, inner then outer. The sortie file places a waypoint on each lane. Adjust the list and re-run the planner to compare sortie impact.'}
          </p>
        </div>
        {showWidths && (
        <GuidedHint
          hintId={HINT_COORD_CORRIDOR_TRACKS}
          stepNumber={3}
          title="Corridor width and lane spacing"
          body={
            <>
              Each <strong>CORRIDORS ARE</strong> line is one NASR width span. Edit <strong>Inner / Outer NM</strong>{' '}
              if the cycle wording is wrong, then set how many offset lanes each side needs.
              <br />
              <br />
              <strong>Left offsets</strong> are left of the centerline as flown.{' '}
              <strong>Right offsets</strong> are right of the centerline as flown. Inner and outer
              follow the route's curve. Use comma-separated NM
              values (e.g. <code className="text-xs bg-gray-100 px-1 rounded">3, 9, 15</code>).
              <br />
              <br />
              Default spacing is a 3 NM first lane and a 6 NM step. A pass past that side&apos;s published width is
              dropped. Use <strong>Reset offsets</strong> on a row to rebuild from the current spacing and width.
            </>
          }
          isSeen={isSeen(HINT_COORD_CORRIDOR_TRACKS)}
          onDismiss={markSeen}
          surface="light"
        />
        )}
      </div>

      {widthBusy && <p className="text-sm text-gray-500">Loading NASR width text…</p>}
      {showWidths && widthErr && (
        <p className="text-sm text-cap-pimento" role="alert">
          {widthErr}
        </p>
      )}

      {!widthBusy && !widthErr && spanTrackRows.length === 0 && (
        <p className="text-sm text-gray-600">No NASR width lines returned for this route.</p>
      )}

      {!widthBusy && spanTrackRows.length > 0 && (
        <div className="space-y-4">
          {showTracks && (
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="block">
              <span className="text-xs text-gray-600">First offset (NM)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={firstOffsetNm}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  if (Number.isFinite(next) && next > 0) onFirstOffsetNmChange(next)
                }}
                className={`${NM_INPUT_CLASS} mt-1`}
                aria-label="First offset in nautical miles"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600">Spacing (NM)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={stepNm}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  if (Number.isFinite(next) && next > 0) onStepNmChange(next)
                }}
                className={`${NM_INPUT_CLASS} mt-1`}
                aria-label="Spacing between offsets in nautical miles"
              />
            </label>
            <p className="self-end text-xs text-gray-600 max-w-md pb-2">
              Passes are rebuilt from this spacing and each side&apos;s published width. A pass past the corridor
              edge is left out.
            </p>
          </div>
          )}
          {showWidths && widthHelp && <p className="mb-3 text-sm text-gray-700">{widthHelp}</p>}
          {spanTrackRows.map((row, index) => (
            <div
              key={`${row.fromPt}-${row.toPt}-${index}`}
              className="rounded-lg border border-gray-200 bg-slate-50 p-4"
            >
              <p className="text-xs font-mono text-gray-700 mb-3 leading-relaxed">{row.displayText}</p>
              <p className="text-xs text-gray-500 mb-3">
                Span: <span className="font-medium text-gray-700">{formatSpanLabel(row.fromPt, row.toPt)}</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                {showWidths && (
                <>
                <label className="block">
                  <span className="text-xs text-gray-600">{widthLabels.left}</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={row.leftNm}
                    onChange={(e) => updateRow(index, { leftNm: e.target.value })}
                    className={`${NM_INPUT_CLASS} mt-1`}
                    aria-label={`${widthLabels.left} for ${formatSpanLabel(row.fromPt, row.toPt)}`}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-600">{widthLabels.right}</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={row.rightNm}
                    onChange={(e) => updateRow(index, { rightNm: e.target.value })}
                    className={`${NM_INPUT_CLASS} mt-1`}
                    aria-label={`${widthLabels.right} for ${formatSpanLabel(row.fromPt, row.toPt)}`}
                  />
                </label>
                </>
                )}
                {showTracks && (
                <>
                <label className="block sm:col-span-2 xl:col-span-1">
                  <span className="text-xs text-gray-600">Left offsets (NM)</span>
                  <input
                    type="text"
                    value={row.leftOffsetsText}
                    onChange={(e) => updateRow(index, { leftOffsetsText: e.target.value })}
                    className={`${OFFSET_INPUT_CLASS} mt-1`}
                    placeholder="3, 9, 15"
                    aria-label={`Left lane spacing for ${formatSpanLabel(row.fromPt, row.toPt)}`}
                  />
                </label>
                <label className="block sm:col-span-2 xl:col-span-1">
                  <span className="text-xs text-gray-600">Right offsets (NM)</span>
                  <input
                    type="text"
                    value={row.rightOffsetsText}
                    onChange={(e) => updateRow(index, { rightOffsetsText: e.target.value })}
                    className={`${OFFSET_INPUT_CLASS} mt-1`}
                    placeholder="3, 9, 15"
                    aria-label={`Right lane spacing for ${formatSpanLabel(row.fromPt, row.toPt)}`}
                  />
                </label>
                </>
                )}
              </div>
              {showTracks && (
              <>
              <button
                type="button"
                onClick={() => resetRowDefaults(index)}
                className="mt-3 text-xs text-cap-ultramarine hover:underline font-medium"
              >
                Reset offsets to wing default for this span
              </button>
              {spanTrackFitWarnings(row).map((warning) => (
                <p key={warning} className="mt-2 text-sm text-cap-pimento" role="alert">
                  {warning}
                </p>
              ))}
              </>
              )}
            </div>
          ))}

          {showTracks && spanTrackErr && (
            <p className="text-sm text-cap-pimento" role="alert">
              {spanTrackErr}
            </p>
          )}

          {showTracks && legPreview && legPreview.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Leg preview (from track plan)</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="py-2 pr-3">Leg</th>
                      <th className="py-2 pr-3">{widthLabels.left} / {widthLabels.right}</th>
                      <th className="py-2 pr-3">Offsets left</th>
                      <th className="py-2 pr-3">Offsets right</th>
                      <th className="py-2">Chain NM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legPreview.map((leg) => (
                      <tr key={`${leg.fromPt}-${leg.toPt}`} className="border-b border-gray-100">
                        <td className="py-2 pr-3 font-mono">
                          {leg.fromPt}→{leg.toPt}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {leg.leftNm ?? '—'} / {leg.rightNm ?? '—'}
                        </td>
                        <td className="py-2 pr-3 font-mono">
                          {leg.leftOffsets.join(', ') || '—'}
                          {leg.leftNote ? <span className="block font-sans text-gray-600">{leg.leftNote}</span> : null}
                        </td>
                        <td className="py-2 pr-3 font-mono">
                          {leg.rightOffsets.join(', ') || '—'}
                          {leg.rightNote ? <span className="block font-sans text-gray-600">{leg.rightNote}</span> : null}
                        </td>
                        <td className="py-2 tabular-nums">{leg.chainNm.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { HINT_COORD_CORRIDOR_TRACKS }
