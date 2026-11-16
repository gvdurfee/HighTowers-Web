import { useEffect, useMemo, useRef, useState } from 'react'
import { CoordinatorRouteLoadForm } from '@/components/CoordinatorRouteLoadForm'
import { parallelOffsetsForHalfWidth } from '@survey-planning/surveyGeometry.js'
import {
  compareOneVsTwoTeamStaffing,
  compareTwoVsThreeTeamStaffing,
  planSingleTeamBothSides,
  planSurveyScenario,
  planThreeTeamGeographicScenario,
} from '@survey-planning/surveySortiePlanner.js'
import { routeCurveSide, segmentCurveSide } from '@survey-planning/offsetRoutePlan.js'
import { planDispatchSorties } from '@/services/teamDispatchSorties'
import { applySpacingToRows, spanTrackPlanFromRows, spanTrackFitWarnings } from '@/utils/coordinatorSpanTrackPlan'
import {
  formatSortieEndurance,
  readSortieBudgetEntry,
  SORTIE_BUDGET_MAX_NM,
  SORTIE_BUDGET_MIN_NM,
  SORTIE_BUDGET_STEP_NM,
} from '@/services/sortieBudget'
import {
  canAdvanceWizard,
  crewSidesComplete,
  emptyWizardDraft,
  BOTH_SIDES_HELP,
  INNER_SIDE_HELP,
  keepTypedSpans,
  neighborSideWarning,
  prefillTeamDispatchWizard,
  recommendStaffing,
  retainFlyingTeams,
  staffingForPlan,
  staffingSignature,
  teamIdsForCount,
  THREE_AIRCRAFT_SEGMENT_NOTE,
  threeAircraftAllowed,
  WIDTH_SIDE_HELP,
  TWO_AIRCRAFT_SIDE_HELP,
  widthFieldLabels,
  WIZARD_FOOTER_NOTES,
  WIZARD_STEPS,
  type StaffingCandidate,
  type WizardAirport,
  type WizardDraft,
  type WizardSource,
  type WizardStepId,
  type WizardTeamId,
} from '@/services/teamDispatchWizard'

type RoutePoint = { ptIdent: string; lat: number; lon: number }

type Props = {
  open: boolean
  savedPlans: { id: string; name: string }[]
  hasPlan: boolean
  routeLabel: string | null
  entry: string | null
  exit: string | null
  waypointCount: number
  source: WizardSource
  sourceKey: string
  waypoints: RoutePoint[]
  routeType: string
  routeNumber: string
  widthTexts: string[]
  onRouteLoaded: (planId: string) => void
  onCancel: () => void
  onFinish: (draft: WizardDraft) => void
  lookupAirport: (code: string) => Promise<{ airport: WizardAirport } | { error: string }>
}

const INPUT_CLASS = 'mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm text-gray-900'

function teamLabel(id: WizardTeamId): string {
  if (id === 'team1') return 'Team 1'
  if (id === 'team2') return 'Team 2'
  return 'Team 3'
}

export function TeamDispatchWizard({
  open,
  savedPlans,
  hasPlan,
  routeLabel,
  entry,
  exit,
  waypointCount,
  source,
  sourceKey,
  waypoints,
  routeType,
  routeNumber,
  widthTexts,
  onRouteLoaded,
  onCancel,
  onFinish,
  lookupAirport,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<WizardDraft>(emptyWizardDraft)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [helpOptions, setHelpOptions] = useState<StaffingCandidate[] | null>(null)
  const [helpNote, setHelpNote] = useState<string | null>(null)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const prefilledOpen = useRef(false)

  useEffect(() => {
    if (!open) {
      prefilledOpen.current = false
      return
    }
    setStepIndex(0)
    setDraft(prefillTeamDispatchWizard(source, waypoints))
    setLookupError(null)
    setHelpOptions(null)
    setHelpNote(null)
    // Refill only when the dialog opens. `source` is a new object every render.
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!prefilledOpen.current) {
      prefilledOpen.current = true
      return
    }
    const next = prefillTeamDispatchWizard(source, waypoints)
    setDraft((current) => {
      const savedArrived = !current.teams.team1.airport && Boolean(next.teams.team1.airport)
      if (savedArrived) {
        return {
          ...next,
          spans: keepTypedSpans(current.spans, next.spans),
        }
      }
      const flying = new Set(current.aircraftCount ? teamIdsForCount(current.aircraftCount) : [])
      const keep = (id: WizardTeamId) => {
        if (current.aircraftCount && !flying.has(id)) return { code: '', airport: null }
        return current.teams[id].airport ? current.teams[id] : next.teams[id]
      }
      return {
        ...current,
        spans: keepTypedSpans(current.spans, next.spans),
        teams: { team1: keep('team1'), team2: keep('team2'), team3: keep('team3') },
      }
    })
  }, [open, sourceKey, waypoints.length])

  const geometry = useMemo(
    () => ({ waypoints, routeType, routeNumber, widthTexts }),
    [waypoints, routeType, routeNumber, widthTexts]
  )
  const curve = useMemo(() => routeCurveSide(waypoints), [waypoints])
  const step = WIZARD_STEPS[stepIndex]

  useEffect(() => {
    if (!open || step.id !== 'review' || draft.aircraftCount == null) return
    const planned = planDraft(draft, geometry)
    if ('error' in planned) return
    const next = staffingForPlan({
      count: draft.aircraftCount,
      draft,
      points: waypoints,
      innerSide: curve.innerSide === 'right' ? 'right' : 'left',
      replaceSides: teamIdsForCount(draft.aircraftCount).some((id) => draft.crewSides[id] == null),
      teams: planned.teams,
      segmentAssignments: planned.segmentAssignments,
    })
    if (staffingSignature(draft) === staffingSignature(next)) return
    setDraft(next)
  }, [open, step.id, draft, geometry, waypoints, curve.innerSide])
  const advance = canAdvanceWizard(step.id, draft, { hasPlan, waypointCount })

  const review = useMemo(() => {
    if (!open || step.id !== 'review' || draft.aircraftCount == null) return null
    return reviewPlan(draft, { waypoints, routeType, routeNumber, widthTexts })
  }, [open, step.id, draft, waypoints, routeType, routeNumber, widthTexts])

  if (!open) return null

  const goNext = () => {
    if (!advance) return
    setStepIndex((index) => Math.min(WIZARD_STEPS.length - 1, index + 1))
  }
  const neighborCrews =
    draft.aircraftCount == null
      ? []
      : teamIdsForCount(draft.aircraftCount)
          .map((id) => ({
            label: teamLabel(id),
            ident: draft.teams[id]?.code || undefined,
            side: draft.crewSides[id],
            from: draft.segments[id]?.from ?? '',
            to: draft.segments[id]?.to ?? '',
          }))
          .sort((a, b) => {
            const indexOf = (ident: string) => waypoints.findIndex((point) => point.ptIdent === ident)
            const left = indexOf(a.from)
            const right = indexOf(b.from)
            if (left < 0 && right < 0) return 0
            if (left < 0) return 1
            if (right < 0) return -1
            return left - right
          })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-dispatch-wizard-title"
        className="w-full max-w-3xl rounded-xl bg-white text-gray-900 shadow-xl"
      >
        <div className="border-b border-gray-200 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Step {stepIndex + 1} of {WIZARD_STEPS.length}
          </p>
          <h2 id="team-dispatch-wizard-title" className="mt-1 text-lg font-semibold text-gray-900">
            {step.title}
          </h2>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {step.id === 'route' && (
            <>
              <CoordinatorRouteLoadForm savedPlans={savedPlans} onLoaded={onRouteLoaded} />
              {hasPlan && (
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-4 text-sm text-gray-800">
                  <p className="font-medium text-gray-900">
                    Loaded {routeLabel ?? 'route'}: {entry ?? '—'} to {exit ?? '—'} ({waypointCount} points).
                  </p>
                  <p className="mt-2">
                    Direction of flight: {entry ?? '—'} to {exit ?? '—'} (as published).
                  </p>
                </div>
              )}
            </>
          )}

          {step.id === 'width' && (
            <>
              <p className="text-sm text-gray-700">{WIDTH_SIDE_HELP}</p>
              {(draft.spans.length === 0 ||
                draft.spans.every((row) => !row.leftNm.trim() && !row.rightNm.trim())) && (
                <p className="text-sm text-gray-700">If no width is found, enter it from the AP/1B.</p>
              )}
              {draft.spans.map((row, index) => (
                <div key={`${row.fromPt}-${row.toPt}-${index}`} className="grid grid-cols-2 gap-3">
                  <p className="col-span-2 text-sm font-medium text-gray-800">
                    {row.fromPt} → {row.toPt}
                  </p>
                  <label className="text-sm text-gray-700">
                    {widthFieldLabels(segmentCurveSide(waypoints, row.fromPt, row.toPt).innerSide).left}
                    <input
                      type="number"
                      min={1}
                      step={0.5}
                      value={row.leftNm}
                      onChange={(event) => updateSpan(index, { leftNm: event.target.value })}
                      className={INPUT_CLASS}
                    />
                  </label>
                  <label className="text-sm text-gray-700">
                    {widthFieldLabels(segmentCurveSide(waypoints, row.fromPt, row.toPt).innerSide).right}
                    <input
                      type="number"
                      min={1}
                      step={0.5}
                      value={row.rightNm}
                      onChange={(event) => updateSpan(index, { rightNm: event.target.value })}
                      className={INPUT_CLASS}
                    />
                  </label>
                </div>
              ))}
            </>
          )}

          {step.id === 'tracks' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-gray-700">
                  First track (NM)
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={draft.firstOffsetNm}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, firstOffsetNm: Number(event.target.value) || 2.5 }))
                    }
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="text-sm text-gray-700">
                  Then every (NM)
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={draft.stepNm}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, stepNm: Number(event.target.value) || 5 }))
                    }
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
              {draft.spans.map((row) => {
                const policy = { firstOffsetNm: draft.firstOffsetNm, stepNm: draft.stepNm }
                const left = parallelOffsetsForHalfWidth(Number(row.leftNm), policy)
                const right = parallelOffsetsForHalfWidth(Number(row.rightNm), policy)
                const warnings = spanTrackFitWarnings({
                  ...row,
                  leftOffsetsText: left.length ? left.join(', ') : String(draft.firstOffsetNm),
                  rightOffsetsText: right.length ? right.join(', ') : String(draft.firstOffsetNm),
                })
                return (
                  <div key={`${row.fromPt}-${row.toPt}`} className="text-sm text-gray-800">
                    <p className="font-medium">
                      {row.fromPt} → {row.toPt}
                    </p>
                    <p>Left tracks: {left.length ? left.join(', ') : 'none'} NM</p>
                    <p>Right tracks: {right.length ? right.join(', ') : 'none'} NM</p>
                    {warnings.map((warning) => (
                      <p key={warning} className="text-cap-pimento" role="alert">
                        {warning}
                      </p>
                    ))}
                  </div>
                )
              })}
            </>
          )}

          {step.id === 'budget' && (
            <label className="block text-sm text-gray-700 max-w-xs">
              Distance limit (NM)
              <input
                type="number"
                min={SORTIE_BUDGET_MIN_NM}
                max={SORTIE_BUDGET_MAX_NM}
                step={SORTIE_BUDGET_STEP_NM}
                value={draft.sortieBudgetNm}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  const outOfRange = !Number.isFinite(next) || next < SORTIE_BUDGET_MIN_NM || next > SORTIE_BUDGET_MAX_NM
                  setBudgetError(outOfRange ? 'Enter 100–500 NM.' : null)
                  setDraft((current) => ({
                    ...current,
                    sortieBudgetNm: Number.isFinite(next) ? next : current.sortieBudgetNm,
                  }))
                }}
                onBlur={(event) => {
                  const next = Number(event.target.value)
                  const outOfRange = !Number.isFinite(next) || next < SORTIE_BUDGET_MIN_NM || next > SORTIE_BUDGET_MAX_NM
                  setBudgetError(outOfRange ? 'Enter 100–500 NM.' : null)
                  setDraft((current) => ({ ...current, sortieBudgetNm: readSortieBudgetEntry(event.target.value) }))
                }}
                className={INPUT_CLASS}
              />
              <span className="mt-1 block text-gray-600">{formatSortieEndurance(draft.sortieBudgetNm)}</span>
              {budgetError && (
                <span className="mt-1 block text-cap-pimento" role="alert">
                  {budgetError}
                </span>
              )}
            </label>
          )}

          {step.id === 'landing' && (
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="wizard-landing"
                  checked={draft.ferryMode === 'return-home'}
                  onChange={() => setDraft((current) => ({ ...current, ferryMode: 'return-home' }))}
                />
                Return to home airport
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="wizard-landing"
                  checked={draft.ferryMode === 'staged-refuel'}
                  onChange={() => setDraft((current) => ({ ...current, ferryMode: 'staged-refuel' }))}
                />
                One shared refuel airport
              </label>
              {draft.ferryMode === 'staged-refuel' && (
                <RefuelLookup
                  label="Refuel airport"
                  airport={draft.refuel}
                  confirmed={draft.refuelFuelConfirmed}
                  error={lookupError}
                  onLookup={async (code) => {
                    setLookupError(null)
                    const result = await lookupAirport(code)
                    if ('error' in result) {
                      setLookupError(result.error)
                      return
                    }
                    setDraft((current) => ({ ...current, refuel: result.airport, refuelFuelConfirmed: false }))
                  }}
                  onConfirm={(confirmed) => setDraft((current) => ({ ...current, refuelFuelConfirmed: confirmed }))}
                />
              )}
            </div>
          )}

          {step.id === 'aircraft' && (
            <div className="space-y-3 text-sm">
              {([1, 2, 3] as const).map((count) => {
                const blocked = count === 3 && !threeAircraftAllowed(waypointCount)
                return (
                  <label key={count} className={`flex items-center gap-2 ${blocked ? 'text-gray-400' : ''}`}>
                    <input
                      type="radio"
                      name="wizard-aircraft"
                      disabled={blocked}
                      checked={draft.aircraftCount === count}
                      onChange={() => setDraft((current) => retainFlyingTeams(current, count))}
                    />
                    {count}
                    {blocked ? ` — ${THREE_AIRCRAFT_SEGMENT_NOTE}` : ''}
                  </label>
                )
              })}
              <button
                type="button"
                className="text-sm font-medium text-cap-ultramarine hover:underline"
                onClick={() => runHelp()}
              >
                Help me decide
              </button>
              {helpNote && <p className="text-gray-700">{helpNote}</p>}
              {helpOptions && (
                <ul className="space-y-1">
                  {helpOptions.map((option) => (
                    <li key={option.id}>
                      {option.label}: {option.sorties} sorties, {option.miles} NM
                      {option.id === recommendStaffing(helpOptions)?.id ? ' — recommended' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step.id === 'depart' && draft.aircraftCount != null && (
            <div className="space-y-4">
              {teamIdsForCount(draft.aircraftCount).map((id) => (
                <TeamLookup
                  key={id}
                  label={teamLabel(id)}
                  code={draft.teams[id].code}
                  airport={draft.teams[id].airport}
                  onCode={(code) =>
                    setDraft((current) => ({
                      ...current,
                      teams: { ...current.teams, [id]: { ...current.teams[id], code } },
                    }))
                  }
                  onLookup={async (code) => {
                    setLookupError(null)
                    const result = await lookupAirport(code)
                    if ('error' in result) {
                      setLookupError(result.error)
                      return
                    }
                    setDraft((current) => ({
                      ...current,
                      teams: {
                        ...current.teams,
                        [id]: { code: result.airport.identifier, airport: result.airport },
                      },
                    }))
                  }}
                />
              ))}
              {lookupError && (
                <p className="text-sm text-cap-pimento" role="alert">
                  {lookupError}
                </p>
              )}
            </div>
          )}

          {step.id === 'review' && (
            <div className="space-y-4 text-sm text-gray-800">
              {review?.error && (
                <p className="text-cap-pimento" role="alert">
                  {review.error}
                </p>
              )}
              {review && !review.error && review.lines && (
                crewSidesComplete(draft) ? (
                  <>
                    <p>
                      {review.totalSorties} sorties, {review.totalMiles} NM total, includes ferry.
                    </p>
                    <ul className="space-y-1">
                      {review.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>Pick sides to see the total</p>
                )
              )}
              <p>{INNER_SIDE_HELP}</p>
              {draft.aircraftCount === 2 && <p>{TWO_AIRCRAFT_SIDE_HELP}</p>}
              {draft.aircraftCount != null && draft.aircraftCount !== 2 && <p>{BOTH_SIDES_HELP}</p>}
              {draft.aircraftCount != null &&
                draft.aircraftCount > 1 &&
                neighborSideWarning(neighborCrews) && (
                  <p className="text-cap-pimento" role="status">
                    {neighborSideWarning(neighborCrews)}
                  </p>
                )}
              {draft.aircraftCount != null &&
                teamIdsForCount(draft.aircraftCount).map((id) => (
                  <fieldset key={id}>
                    <legend className="font-medium text-gray-900">
                      Which side of the curve does Sortie 1 fly: Inner or Outer? ({teamLabel(id)})
                    </legend>
                    <div className="mt-2 flex gap-4">
                      {(['inner', 'outer'] as const).map((side) => (
                        <label key={side} className="inline-flex items-center gap-2 capitalize">
                          <input
                            type="radio"
                            name={`wizard-side-${id}`}
                            checked={draft.crewSides[id] === side}
                            onChange={() =>
                              setDraft((current) => ({
                                ...current,
                                crewSides: { ...current.crewSides, [id]: side },
                              }))
                            }
                          />
                          {side}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              {WIZARD_FOOTER_NOTES.map((note) => (
                <p key={note} className="text-gray-600">
                  {note}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-5 py-4">
          <button type="button" onClick={onCancel} className="text-sm font-medium text-gray-600 hover:underline">
            Cancel
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-900 disabled:opacity-40"
            >
              Back
            </button>
            {step.id === 'review' ? (
              <>
                {!crewSidesComplete(draft) && draft.aircraftCount != null && (
                  <p className="self-center text-sm text-cap-pimento">
                    Choose Inner or Outer for{' '}
                    {teamIdsForCount(draft.aircraftCount)
                      .filter((id) => draft.crewSides[id] !== 'inner' && draft.crewSides[id] !== 'outer')
                      .map((id) => teamLabel(id))
                      .join(', ')}
                    .
                  </p>
                )}
                <button
                  type="button"
                  disabled={!crewSidesComplete(draft)}
                  onClick={() => onFinish(finishDraft(draft, geometry, curve.innerSide === 'right' ? 'right' : 'left'))}
                  className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium disabled:opacity-40"
                >
                  Finish
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!advance}
                onClick={goNext}
                className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium disabled:opacity-40"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  function updateSpan(index: number, patch: Partial<WizardDraft['spans'][number]>) {
    setDraft((current) => ({
      ...current,
      spans: current.spans.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }))
  }

  function runHelp() {
    const countReady = draft.teams.team1.airport && draft.teams.team2.airport
    if (!countReady || waypoints.length < 2) {
      setHelpOptions(null)
      setHelpNote('Look up a departure for each aircraft, then come back. Help me decide compares those airports.')
      return
    }
    const built = buildPlannerInput(draft, { waypoints, routeType, routeNumber, widthTexts })
    if ('error' in built) {
      setHelpNote(built.error ?? 'The comparison needs a departure airport.')
      setHelpOptions(null)
      return
    }
    const options: StaffingCandidate[] = []
    const oneVsTwo = compareOneVsTwoTeamStaffing(built.input, built.team2, {
      team1DepLabel: built.team1.label,
      team2DepLabel: built.team2.label,
    })
    options.push(candidate('1', '1 aircraft', oneVsTwo.oneTeam))
    options.push(candidate('2', '2 aircraft', oneVsTwo.twoTeams))
    if (draft.teams.team3.airport && threeAircraftAllowed(waypointCount)) {
      const twoVsThree = compareTwoVsThreeTeamStaffing(built.input, built.team2, built.team3, {
        team1DepLabel: built.team1.label,
        team2DepLabel: built.team2.label,
        team3DepLabel: built.team3.label,
      })
      options.push(candidate('3', '3 aircraft', twoVsThree.threeTeams))
    }
    setHelpOptions(options)
    const best = recommendStaffing(options)
    setHelpNote(best ? `${best.label} is the better fit: fewer sorties, then fewer miles.` : null)
    if (!best) return
    const count = Number(best.id) as 1 | 2 | 3
    setDraft((current) => {
      const chosen = { ...current, aircraftCount: count }
      const planned = planDraft(chosen, geometry)
      if ('error' in planned) return retainFlyingTeams(current, count)
      return staffingForPlan({
        count,
        draft: chosen,
        points: waypoints,
        innerSide: curve.innerSide === 'right' ? 'right' : 'left',
        replaceSides: true,
        teams: planned.teams,
        segmentAssignments: planned.segmentAssignments,
      })
    })
  }
}

function candidate(
  id: string,
  label: string,
  result: { totalSorties?: number | null; totalWingNm?: number | null; teams?: { sorties?: { overBudget?: boolean }[] }[] }
): StaffingCandidate {
  const overBudget = (result.teams ?? []).reduce(
    (sum, team) => sum + (team.sorties ?? []).filter((sortie) => sortie.overBudget).length,
    0
  )
  const loads = (result.teams ?? []).map((team) => ({
    sorties: team.sorties?.length ?? 0,
    miles: (team.sorties ?? []).reduce((sum, sortie) => sum + (Number((sortie as { totalNm?: number }).totalNm) || 0), 0),
  }))
  return {
    id,
    label,
    sorties: result.totalSorties ?? 0,
    miles: result.totalWingNm ?? 0,
    overBudget,
    maxSorties: loads.reduce((max, team) => Math.max(max, team.sorties), 0),
    maxNm: loads.reduce((max, team) => Math.max(max, team.miles), 0),
  }
}

function RefuelLookup({
  label = 'Refuel airport',
  airport,
  confirmed,
  error,
  onLookup,
  onConfirm,
}: {
  label?: string
  airport: WizardAirport | null
  confirmed: boolean
  error: string | null
  onLookup: (code: string) => Promise<void>
  onConfirm: (confirmed: boolean) => void
}) {
  const [code, setCode] = useState(airport?.identifier ?? '')
  return (
    <div className="space-y-2">
      <label className="block text-sm text-gray-700">
        {label}
        <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className={INPUT_CLASS} />
      </label>
      <button
        type="button"
        onClick={() => void onLookup(code)}
        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
      >
        Look up
      </button>
      {airport && (
        <p>
          {airport.identifier} — {airport.name}
        </p>
      )}
      {error && (
        <p className="text-cap-pimento" role="alert">
          {error}
        </p>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={confirmed} onChange={(event) => onConfirm(event.target.checked)} />
        Confirm fuel is available (100LL) at the refuel airport.
      </label>
    </div>
  )
}

function TeamLookup({
  label,
  code,
  airport,
  onCode,
  onLookup,
}: {
  label: string
  code: string
  airport: WizardAirport | null
  onCode: (code: string) => void
  onLookup: (code: string) => Promise<void>
}) {
  return (
    <div>
      <label className="block text-sm text-gray-700">
        {label}
        <input value={code} onChange={(event) => onCode(event.target.value.toUpperCase())} className={INPUT_CLASS} />
      </label>
      <button
        type="button"
        onClick={() => void onLookup(code)}
        className="mt-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
      >
        Look up
      </button>
      {airport && (
        <p className="mt-1 text-sm text-gray-700">
          {airport.identifier} — {airport.name}
        </p>
      )}
    </div>
  )
}

function buildPlannerInput(
  draft: WizardDraft,
  geometry: { waypoints: RoutePoint[]; routeType: string; routeNumber: string; widthTexts: string[] }
) {
  const airport = (id: WizardTeamId) => draft.teams[id].airport
  const home1 = airport('team1')
  const home2 = airport('team2')
  const home3 = airport('team3')
  if (!home1) return { error: 'Team 1 needs a departure airport before the plan can be reviewed.' }
  const toTeam = (_id: WizardTeamId, home: WizardAirport, side: 'left' | 'right') => ({
    label: home.identifier,
    side,
    depLat: home.latitude,
    depLon: home.longitude,
  })
  const team1 = toTeam('team1', home1, 'left')
  const team2 = home2 ? toTeam('team2', home2, 'right') : team1
  const team3 = home3 ? toTeam('team3', home3, 'left') : team1
  const input = {
    routeType: geometry.routeType || 'VR',
    routeNumber: geometry.routeNumber || '',
    waypoints: geometry.waypoints,
    widthTexts: geometry.widthTexts,
    teams: [team1],
    spanTrackPlan: spanTrackPlanFromRows(
      applySpacingToRows(draft.spans, { firstOffsetNm: draft.firstOffsetNm, stepNm: draft.stepNm })
    ),
    sortieBudgetNm: draft.sortieBudgetNm,
    trackPolicy: { firstOffsetNm: draft.firstOffsetNm, stepNm: draft.stepNm },
    ferryMode: draft.ferryMode,
    recoveryAirport:
      draft.ferryMode === 'staged-refuel' && draft.refuel
        ? { lat: draft.refuel.latitude, lon: draft.refuel.longitude, label: draft.refuel.identifier }
        : undefined,
  }
  return { input, team1, team2, team3 }
}

function planDraft(
  draft: WizardDraft,
  geometry: { waypoints: RoutePoint[]; routeType: string; routeNumber: string; widthTexts: string[] }
):
  | { teams: Array<{ label?: string; side?: string }>; segmentAssignments: Array<{ teamLabel?: string; waypointFrom?: string; waypointTo?: string; startIdx?: number }> }
  | { error: string } {
  const built = buildPlannerInput(draft, geometry)
  if ('error' in built) return { error: built.error ?? 'The plan needs a departure airport.' }
  try {
    const result =
      draft.aircraftCount === 3
        ? planThreeTeamGeographicScenario(built.input, [built.team1, built.team2, built.team3])
        : draft.aircraftCount === 2
          ? planSurveyScenario({ ...built.input, teams: [built.team1, built.team2], assignmentModel: 'opposite-side' })
          : planSingleTeamBothSides(built.input)
    const segmentAssignments =
      'segmentAssignments' in result && Array.isArray(result.segmentAssignments) ? result.segmentAssignments : []
    return { teams: result.teams ?? [], segmentAssignments }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'The planner could not build this review.' }
  }
}

function finishDraft(
  draft: WizardDraft,
  geometry: { waypoints: RoutePoint[]; routeType: string; routeNumber: string; widthTexts: string[] },
  innerSide: 'left' | 'right'
): WizardDraft {
  if (draft.aircraftCount == null) return draft
  const planned = planDraft(draft, geometry)
  if ('error' in planned) {
    return staffingForPlan({
      count: draft.aircraftCount,
      draft,
      points: geometry.waypoints,
      innerSide,
      replaceSides: false,
    })
  }
  return staffingForPlan({
    count: draft.aircraftCount,
    draft,
    points: geometry.waypoints,
    innerSide,
    replaceSides: false,
    teams: planned.teams,
    segmentAssignments: planned.segmentAssignments,
  })
}

function reviewPlan(
  draft: WizardDraft,
  geometry: { waypoints: RoutePoint[]; routeType: string; routeNumber: string; widthTexts: string[] }
): { lines: string[]; totalSorties: number; totalMiles: number; error?: undefined } | { error: string; lines?: undefined; totalSorties?: undefined; totalMiles?: undefined } {
  if (draft.aircraftCount == null) return { error: 'Choose how many aircraft are flying.' }
  const airports = teamIdsForCount(draft.aircraftCount)
    .map((id) => draft.teams[id].airport)
    .filter((airport): airport is WizardAirport => Boolean(airport))
  if (airports.length < draft.aircraftCount) return { error: 'The plan needs a departure airport.' }
  const sides: Record<string, 'inner' | 'outer' | null> = {}
  for (const id of teamIdsForCount(draft.aircraftCount)) {
    const airport = draft.teams[id].airport
    if (airport) sides[airport.identifier] = draft.crewSides[id]
  }
  const planned = planDispatchSorties({
    aircraftCount: draft.aircraftCount,
    routeType: geometry.routeType,
    routeNumber: geometry.routeNumber,
    waypoints: geometry.waypoints,
    widthTexts: geometry.widthTexts,
    spans: applySpacingToRows(draft.spans, { firstOffsetNm: draft.firstOffsetNm, stepNm: draft.stepNm }),
    firstOffsetNm: draft.firstOffsetNm,
    stepNm: draft.stepNm,
    sortieBudgetNm: draft.sortieBudgetNm,
    ferryMode: draft.ferryMode,
    refuel: draft.refuel
      ? { identifier: draft.refuel.identifier, latitude: draft.refuel.latitude, longitude: draft.refuel.longitude }
      : null,
    airports: airports.map((airport) => ({
      identifier: airport.identifier,
      latitude: airport.latitude,
      longitude: airport.longitude,
    })),
    sides,
  })
  if ('error' in planned) return { error: planned.error }
  return {
    lines: planned.lines,
    totalSorties: planned.totalSorties,
    totalMiles: planned.totalNm,
  }
}

export type { WizardStepId }
