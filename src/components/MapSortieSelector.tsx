import type { SortieSide } from '@/services/offsetRouteFpl'
import type { MapSortieNumber } from '@/services/serpentineDisplay'
import { singleAircrewSortieButtonLabel } from '@/services/singleAircrewMap'
import { mapSortieButtons } from '@/services/teamPlanRecord'

export function MapSortieSelector(props: {
  sorties: Array<{ number: number }>
  selected: MapSortieNumber
  onSelect: (sortie: MapSortieNumber) => void
  singleAircrew?: {
    departure?: string | null
    destination?: string | null
    sortie1Side?: SortieSide | null
  } | null
}) {
  const buttons = mapSortieButtons(props.sorties)
  return (
    <div role="radiogroup" aria-label="Sortie" className="flex items-center gap-1">
      {buttons.map((sortie) => {
        const selected = props.selected === sortie.number
        const label = props.singleAircrew
          ? singleAircrewSortieButtonLabel({
              number: sortie.number,
              departure: props.singleAircrew.departure,
              destination: props.singleAircrew.destination,
              sortie1Side: props.singleAircrew.sortie1Side,
            })
          : `Sortie ${sortie.number}`
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
              {label}
            </button>
          </span>
        )
      })}
    </div>
  )
}
