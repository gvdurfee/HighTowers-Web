import { GuidedHint } from '@/components/GuidedHint'
import {
  formatSpanLabel,
  resetRowOffsetsToDefault,
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
  widthBusy: boolean
  widthErr: string | null
  spanTrackErr: string | null
  isSeen: (id: string) => boolean
  markSeen: (id: string) => void
  legPreview?: {
    fromPt: string
    toPt: string
    leftNm: number | null
    rightNm: number | null
    leftOffsets: number[]
    rightOffsets: number[]
    chainNm: number
  }[]
}

export function CorridorTrackPlanEditor({
  spanTrackRows,
  onSpanTrackRowsChange,
  widthBusy,
  widthErr,
  spanTrackErr,
  isSeen,
  markSeen,
  legPreview,
}: CorridorTrackPlanEditorProps) {
  const updateRow = (index: number, patch: Partial<SpanTrackRowState>) => {
    onSpanTrackRowsChange(
      spanTrackRows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
  }

  const resetRowDefaults = (index: number) => {
    onSpanTrackRowsChange(
      spanTrackRows.map((row, i) => (i === index ? resetRowOffsetsToDefault(row) : row))
    )
  }

  return (
    <div className="mt-5 border-t border-gray-200 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Corridor &amp; parallel tracks</h3>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            NASR width defines each span. Set G1000 parallel-track offsets (NM, inner → outer) per side before
            staffing teams — adjust here and re-run the planner to compare sortie impact.
          </p>
        </div>
        <GuidedHint
          hintId={HINT_COORD_CORRIDOR_TRACKS}
          stepNumber={3}
          title="Corridor width and parallel tracks"
          body={
            <>
              Each <strong>CORRIDORS ARE</strong> line is one NASR width span. Edit <strong>Inner / Outer NM</strong>{' '}
              if the cycle wording is wrong, then set how many parallel passes each side needs.
              <br />
              <br />
              <strong>Inner offsets</strong> = left of centerline (Team 1 / inner crew).{' '}
              <strong>Outer offsets</strong> = right of centerline (Team 2 / outer crew). Use comma-separated NM
              values (e.g. <code className="text-xs bg-gray-100 px-1 rounded">3, 9, 15, 21</code>).
              <br />
              <br />
              Default wing policy is 3 NM first track, 6 NM step, +1 NM past published half-width — use{' '}
              <strong>Reset offsets</strong> on a row to restore that from the current NM values. Fewer or wider-spaced
              tracks reduce sortie NM when the wing is not flying every published track.
            </>
          }
          isSeen={isSeen(HINT_COORD_CORRIDOR_TRACKS)}
          onDismiss={markSeen}
          surface="light"
        />
      </div>

      {widthBusy && <p className="text-sm text-gray-500">Loading NASR width text…</p>}
      {widthErr && (
        <p className="text-sm text-cap-pimento" role="alert">
          {widthErr}
        </p>
      )}

      {!widthBusy && !widthErr && spanTrackRows.length === 0 && (
        <p className="text-sm text-gray-600">No NASR width lines returned for this route.</p>
      )}

      {!widthBusy && spanTrackRows.length > 0 && (
        <div className="space-y-4">
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
                <label className="block">
                  <span className="text-xs text-gray-600">Inner NM (left)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={row.leftNm}
                    onChange={(e) => updateRow(index, { leftNm: e.target.value })}
                    className={`${NM_INPUT_CLASS} mt-1`}
                    aria-label={`Inner half-width NM for ${formatSpanLabel(row.fromPt, row.toPt)}`}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-600">Outer NM (right)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={row.rightNm}
                    onChange={(e) => updateRow(index, { rightNm: e.target.value })}
                    className={`${NM_INPUT_CLASS} mt-1`}
                    aria-label={`Outer half-width NM for ${formatSpanLabel(row.fromPt, row.toPt)}`}
                  />
                </label>
                <label className="block sm:col-span-2 xl:col-span-1">
                  <span className="text-xs text-gray-600">Inner offsets (NM)</span>
                  <input
                    type="text"
                    value={row.leftOffsetsText}
                    onChange={(e) => updateRow(index, { leftOffsetsText: e.target.value })}
                    className={`${OFFSET_INPUT_CLASS} mt-1`}
                    placeholder="3, 9, 15, 21"
                    aria-label={`Inner parallel track offsets for ${formatSpanLabel(row.fromPt, row.toPt)}`}
                  />
                </label>
                <label className="block sm:col-span-2 xl:col-span-1">
                  <span className="text-xs text-gray-600">Outer offsets (NM)</span>
                  <input
                    type="text"
                    value={row.rightOffsetsText}
                    onChange={(e) => updateRow(index, { rightOffsetsText: e.target.value })}
                    className={`${OFFSET_INPUT_CLASS} mt-1`}
                    placeholder="3, 9, 15, 21"
                    aria-label={`Outer parallel track offsets for ${formatSpanLabel(row.fromPt, row.toPt)}`}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => resetRowDefaults(index)}
                className="mt-3 text-xs text-cap-ultramarine hover:underline font-medium"
              >
                Reset offsets to wing default for this span
              </button>
            </div>
          ))}

          {spanTrackErr && (
            <p className="text-sm text-cap-pimento" role="alert">
              {spanTrackErr}
            </p>
          )}

          {legPreview && legPreview.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Leg preview (from track plan)</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="py-2 pr-3">Leg</th>
                      <th className="py-2 pr-3">Inner / Outer NM</th>
                      <th className="py-2 pr-3">Offsets Inner</th>
                      <th className="py-2 pr-3">Offsets Outer</th>
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
                        <td className="py-2 pr-3 font-mono">{leg.leftOffsets.join(', ') || '—'}</td>
                        <td className="py-2 pr-3 font-mono">{leg.rightOffsets.join(', ') || '—'}</td>
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
