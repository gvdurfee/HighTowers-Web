import { todayIso, type SortieProgress, type SurveyStop } from '@/services/teamPlanProgress'

export type SortieProgressRow = {
  id: string
  number: number
  stops: SurveyStop[]
  mark: SortieProgress | undefined
}

function statusOf(mark: SortieProgress | undefined): SortieProgress['status'] {
  return mark?.status ?? 'not-started'
}

export function SortieProgressPanel({
  rows,
  crewLines,
  planLine,
  notice,
  onChange,
}: {
  rows: SortieProgressRow[]
  crewLines: string[]
  planLine: string
  notice: string | null
  onChange: (id: string, mark: SortieProgress | null) => void
}) {
  if (rows.length === 0) return null
  return (
    <div className="px-4 py-2 text-sm text-white/90 space-y-3">
      {notice && (
        <p role="status" className="text-white">
          {notice}
        </p>
      )}
      {rows.map((row) => {
        const status = statusOf(row.mark)
        const stoppedAt = row.mark?.stoppedAt && row.stops.some((stop) => stop.name === row.mark?.stoppedAt)
          ? row.mark.stoppedAt
          : row.stops[0]?.name ?? ''
        const write = (next: SortieProgress | null) => onChange(row.id, next)
        return (
          <fieldset key={row.id} className="space-y-2">
            <legend className="font-medium text-white">Sortie {row.number}</legend>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name={`progress-${row.id}`}
                  checked={status === 'not-started'}
                  onChange={() => write(null)}
                />
                Not started
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name={`progress-${row.id}`}
                  checked={status === 'stopped'}
                  onChange={() =>
                    write({
                      status: 'stopped',
                      stoppedAt: stoppedAt || null,
                      note: row.mark?.note ?? '',
                      recordedOn: row.mark?.recordedOn || todayIso(),
                      waypointKey: row.stops.map((stop) => stop.name).join('|'),
                    })
                  }
                />
                Stopped at
              </label>
              <select
                aria-label={`Stopped at waypoint for sortie ${row.number}`}
                className="px-2 py-1 rounded bg-white text-gray-900 disabled:opacity-50"
                disabled={status !== 'stopped'}
                value={status === 'stopped' ? stoppedAt : ''}
                onChange={(event) =>
                  write({
                    status: 'stopped',
                    stoppedAt: event.target.value,
                    note: row.mark?.note ?? '',
                    recordedOn: row.mark?.recordedOn || todayIso(),
                    waypointKey: row.stops.map((stop) => stop.name).join('|'),
                  })
                }
              >
                {row.stops.map((stop) => (
                  <option key={stop.name} value={stop.name}>
                    {stop.name}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name={`progress-${row.id}`}
                  checked={status === 'completed'}
                  onChange={() =>
                    write({
                      status: 'completed',
                      stoppedAt: null,
                      note: row.mark?.note ?? '',
                      recordedOn: row.mark?.recordedOn || todayIso(),
                      waypointKey: row.stops.map((stop) => stop.name).join('|'),
                    })
                  }
                />
                Completed
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1">
                Note
                <input
                  aria-label={`Note for sortie ${row.number}`}
                  className="px-2 py-1 rounded bg-white text-gray-900 w-56 disabled:opacity-50"
                  disabled={status === 'not-started'}
                  value={row.mark?.note ?? ''}
                  onChange={(event) => {
                    if (status === 'not-started') return
                    write({
                      status,
                      stoppedAt: status === 'stopped' ? stoppedAt : null,
                      note: event.target.value,
                      recordedOn: row.mark?.recordedOn || todayIso(),
                      waypointKey: row.stops.map((stop) => stop.name).join('|'),
                    })
                  }}
                />
              </label>
              <label className="inline-flex items-center gap-1">
                Date recorded
                <input
                  type="date"
                  aria-label={`Date recorded for sortie ${row.number}`}
                  className="px-2 py-1 rounded bg-white text-gray-900 disabled:opacity-50"
                  disabled={status === 'not-started'}
                  value={row.mark?.recordedOn || (status === 'not-started' ? '' : todayIso())}
                  onChange={(event) => {
                    if (status === 'not-started') return
                    write({
                      status,
                      stoppedAt: status === 'stopped' ? stoppedAt : null,
                      note: row.mark?.note ?? '',
                      recordedOn: event.target.value,
                      waypointKey: row.stops.map((stop) => stop.name).join('|'),
                    })
                  }}
                />
              </label>
            </div>
          </fieldset>
        )
      })}
      <div>
        {crewLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p>{planLine}</p>
      </div>
    </div>
  )
}
