export function TeamDispatchSaveBar(props: {
  reviewedCount: number
  sectionCount: number
  status: string
  disabled: boolean
  disabledReason: string | null
  notice: string | null
  onDisabledReason: () => void
  onSave: () => void
  onSaveAndMap: () => void
}) {
  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 md:px-6 shadow-[0_-6px_16px_rgba(14,43,141,0.08)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm font-medium text-gray-900">
          {props.reviewedCount} of {props.sectionCount} reviewed
        </p>
        <p className="text-sm text-gray-700">{props.status}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={props.onSave}
            disabled={props.disabled}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-cap-ultramarine text-white disabled:opacity-50"
          >
            Save team plan
          </button>
          <button
            type="button"
            onClick={props.onSaveAndMap}
            disabled={props.disabled}
            className="px-3 py-2 text-sm font-medium rounded-lg border border-cap-ultramarine text-cap-ultramarine disabled:opacity-50"
          >
            Save and open Map View
          </button>
        </div>
      </div>
      {props.disabled && props.disabledReason && (
        <button type="button" onClick={props.onDisabledReason} className="mt-2 text-sm text-cap-pimento underline text-left">
          {props.disabledReason}
        </button>
      )}
      {!props.disabled && props.notice && <p className="mt-2 text-sm text-gray-700">{props.notice}</p>}
    </div>
  )
}
