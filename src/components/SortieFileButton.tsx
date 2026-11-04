export function SortieFileButton(props: {
  label: string
  enabled: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <span title={props.enabled ? undefined : props.title}>
      <button
        type="button"
        disabled={!props.enabled}
        title={props.enabled ? undefined : props.title}
        onClick={() => {
          if (!props.enabled) return
          props.onClick()
        }}
        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cap-ultramarine text-white disabled:opacity-40"
      >
        {props.label}
      </button>
    </span>
  )
}
