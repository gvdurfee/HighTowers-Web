import type { ComparisonOption } from '@survey-planning/planComparison.js'

function sortieText(sortie: { number: number; distanceNm: number; overBudget: boolean }) {
  return `Sortie ${sortie.number}: ${sortie.distanceNm} NM ${sortie.overBudget ? 'Over' : 'Under'}`
}

export function ComparePlansPanel(props: {
  options: ComparisonOption[]
  spacingNote: string
  onApply: (option: ComparisonOption) => void
}) {
  return (
    <section className="mb-8" aria-label="Compare plans">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Compare plans</h3>
      <p className="text-sm text-gray-600 mb-3">
        Computed only. Apply loads a plan into Geographic assignment. It stays unsaved until Save team plan.
      </p>
      <p className="text-sm text-gray-700 mb-3">{props.spacingNote}</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {props.options.map((option, optionIndex) => (
          <article
            key={`${option.id}-${optionIndex}`}
            className={`rounded-lg border p-3 ${option.recommended ? 'border-cap-ultramarine bg-white' : 'border-gray-200 bg-white'}`}
          >
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-900">{option.title}</h4>
              {option.recommended && (
                <span className="rounded bg-cap-yellow px-2 py-0.5 text-xs font-medium text-cap-ultramarine">
                  Recommended
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 mb-2">
              {option.refuelStops} refuel stop{option.refuelStops === 1 ? '' : 's'} · wing {option.wingNm} NM, includes ferry
              {option.allUnder ? ' · every sortie is within the distance limit' : ' · a sortie is over the distance limit'}
            </p>
            {option.boundaryNote && <p className="text-sm text-gray-700 mb-2">{option.boundaryNote}</p>}
            <table className="min-w-full text-sm mb-3">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-1 pr-2">Team</th>
                  <th className="py-1 pr-2">Segment</th>
                  <th className="py-1 pr-2">Refuel</th>
                  <th className="py-1 pr-2">Sorties</th>
                  <th className="py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {option.teams.map((team, teamIndex) => (
                  <tr key={`${option.id}-${team.identifier}-${teamIndex}`} className="border-b border-gray-100 align-top">
                    <td className="py-1 pr-2 font-medium">{team.home}</td>
                    <td className="py-1 pr-2 font-mono">
                      {team.from}–{team.to}
                    </td>
                    <td className="py-1 pr-2">{team.refuel ?? 'None'}</td>
                    <td className="py-1 pr-2">
                      {team.sorties.map((sortie, sortieIndex) => (
                        <span key={`${team.identifier}-${sortie.number}-${sortieIndex}`} className={`block ${sortie.overBudget ? 'text-amber-800 font-medium' : ''}`}>
                          {sortieText(sortie)}
                        </span>
                      ))}
                    </td>
                    <td className="py-1 tabular-nums">{team.totalNm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => props.onApply(option)}
              className="rounded-lg border border-cap-ultramarine px-3 py-1.5 text-sm font-medium text-cap-ultramarine"
            >
              Apply
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
