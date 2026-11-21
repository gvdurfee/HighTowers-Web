export function ShowAllSortieOverlaysButton(props: {
  visible: boolean
  pressed: boolean
  onToggle: () => void
}) {
  if (!props.visible) return null
  return (
    <button
      type="button"
      data-testid="show-all-sortie-overlays"
      aria-pressed={props.pressed}
      onClick={props.onToggle}
      className="inline-flex items-center px-2 py-2 text-sm text-white rounded-lg border border-white/40 hover:bg-white/15"
    >
      {props.pressed ? 'Clear all Sortie Overlays' : 'Show all Sortie Overlays'}
    </button>
  )
}
