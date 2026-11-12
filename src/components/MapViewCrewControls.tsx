import { MapSortieSelector } from '@/components/MapSortieSelector'
import type { CrewOverlayId } from '@/services/crewSerpentineOverlay'
import type { SortieSide } from '@/services/offsetRouteFpl'
import type { MapSortieNumber } from '@/services/serpentineDisplay'
import { NO_TEAM_PLAN_NOTE } from '@/services/teamPlanRecord'

const TEAM_ASSIGNING_NOTE =
  'For assigning more than one team to this route. Each team shows Sortie 1 first; switch to Sortie 2 for the next day.'

export function MapViewCrewControls(props: {
  singleAircrew: boolean
  crews: Array<{ id: CrewOverlayId; label: string; airport: string | null }>
  selectedCrew: CrewOverlayId
  onSelectCrew: (id: CrewOverlayId) => void
  sorties: Array<{ number: number }> | null
  selectedSortie: MapSortieNumber
  onSelectSortie: (sortie: MapSortieNumber) => void
  departure?: string | null
  destination?: string | null
  sortie1Side?: SortieSide | null
  showNoTeamPlan: boolean
  hint: string | null
}) {
  const sorties = props.singleAircrew ? [{ number: 1 }, { number: 2 }] : props.sorties
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Each team shows Sortie 1 first. Sortie 2 is the next day. */}
        {!props.singleAircrew && (
          <div role="radiogroup" aria-label="Crew overlay" className="flex flex-wrap items-center gap-1">
            {props.crews.map((crew) => {
              const selected = crew.id === props.selectedCrew
              return (
                <button
                  key={crew.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => props.onSelectCrew(crew.id)}
                  className={`px-3 py-2 text-sm rounded-lg border ${
                    selected
                      ? 'bg-cap-ultramarine text-white border-cap-ultramarine'
                      : 'bg-white/10 text-white border-white/40 hover:bg-white/20'
                  }`}
                >
                  {crew.label}
                  {crew.airport ? ` · ${crew.airport}` : ''}
                </button>
              )
            })}
          </div>
        )}
        {sorties && sorties.length > 0 && (
          <MapSortieSelector
            sorties={sorties}
            selected={props.selectedSortie}
            onSelect={props.onSelectSortie}
            singleAircrew={
              props.singleAircrew
                ? {
                    departure: props.departure,
                    destination: props.destination,
                    sortie1Side: props.sortie1Side,
                  }
                : null
            }
          />
        )}
        {props.singleAircrew && props.hint ? (
          <p className="text-sm text-white/80">{props.hint}</p>
        ) : (
          <p className="text-sm text-white/80">{TEAM_ASSIGNING_NOTE}</p>
        )}
      </div>
      {!props.singleAircrew && props.showNoTeamPlan && (
        <p className="text-sm text-white/80">{NO_TEAM_PLAN_NOTE}</p>
      )}
    </>
  )
}
