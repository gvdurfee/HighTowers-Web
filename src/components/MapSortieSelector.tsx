import { mapSortieButtons } from '@/services/teamPlanRecord'
import type { MapSortieNumber } from '@/services/serpentineDisplay'

export function MapSortieSelector(props: {
  sorties: Array<{ number: number }>
  selected: MapSortieNumber
  onSelect: (sortie: MapSortieNumber) => void
}) {
  const buttons = mapSortieButtons(props.sorties)
  return (
    <div role="radiogroup" aria-label="Sortie" className="flex items-center gap-1">
      {buttons.map((sortie) => {
        const selected = props.selected === sortie.number
        return (
          <span key={sortie.number} title={sortie.title}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!sortie.enabled}
              title={sortie.title}
              onClick={() => {
                if (!sortie.enabled) return
                props.onSelect(sortie.number)
              }}
              className={`px-3 py-2 text-sm rounded-lg border ${
                !sortie.enabled
                  ? 'bg-white/10 text-white/50 border-white/20 opacity-40 cursor-not-allowed'
                  : selected
                    ? 'bg-cap-ultramarine text-white border-cap-ultramarine'
                    : 'bg-white/10 text-white border-white/40 hover:bg-white/20'
              }`}
            >
              Sortie {sortie.number}
            </button>
          </span>
        )
      })}
    </div>
  )
}
