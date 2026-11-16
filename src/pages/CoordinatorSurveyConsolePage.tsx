import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { parseWaypointCode } from '@/utils/mtrWaypointCode'
import { fetchMtrWidthTexts } from '@/services/surveyPlanningApi'
import { apiService, type AirportResult } from '@/services/api'
import {
  airportLookupMessage,
  cleanAirportId,
  FAA_AIRPORT_SERVICE_MESSAGE,
} from '@/services/airportLookup'
import {
  planSurveyScenario,
  planSingleTeamBothSides,
  planThreeTeamGeographicScenario,
  compareOneVsTwoTeamStaffing,
  compareTwoVsThreeTeamStaffing,
  buildLegWidthSummaries,
} from '@survey-planning/surveySortiePlanner.js'
import { planTeamSegmentDay, validateTeamSegments } from '@survey-planning/segmentAssignment.js'
import {
  assignmentEditsForOption,
  compareSurveyPlans,
  expandPlanningRoute,
  type ComparisonOption,
  type PlanningInsert,
} from '@survey-planning/planComparison.js'
import { ComparePlansPanel } from '@/components/ComparePlansPanel'
import {
  GuidedHint,
  GuidedHintDismissActions,
  GuidedHintTriggerFace,
  guidedHintTriggerClassName,
} from '@/components/GuidedHint'
import type { AirportRecord, WaypointRecord } from '@/db/schema'
import {
  downloadSortieFpl,
  type SortieFplPilotBrief,
  type SortieFplSortie,
} from '@/services/sortieFplExport'
import { SortiePilotCard } from '@/components/SortiePilotCard'
import { FlightPlanContentPackCard } from '@/components/FlightPlanContentPackCard'
import { SortieFragmentExportCard } from '@/components/SortieFragmentExportCard'
import { CoordinatorRouteLoadForm } from '@/components/CoordinatorRouteLoadForm'
import { TeamDispatchWizard } from '@/components/TeamDispatchWizard'
import { ReviewedSection } from '@/components/ReviewedSection'
import { TeamDispatchSaveBar } from '@/components/TeamDispatchSaveBar'
import {
  missingCrewSides,
  neighborSideWarning,
  refuelAirportForCrew,
  refuelEditsForDraft,
  WIDTH_SIDE_HELP,
  blankSpansFromPoints,
  widthFieldLabels,
  type WizardDraft,
  type WizardSource,
} from '@/services/teamDispatchWizard'
import { setTeamDispatchUnsaved, setTeamSortiesStale, teamDispatchHasUnsaved } from '@/services/teamDispatchUnsaved'
import {
  TEAM_DISPATCH_SECTIONS,
  clearReviewMarks,
  clearReviewedSections,
  clearTeamPlanAwaitingSave,
  markSectionReviewed,
  markTeamPlanAwaitingSave,
  readReviewMarks,
  reviewMarksAfterChange,
  saveBarStatus,
  saveBlocker,
  uncoveredLaneMessage,
  teamDispatchMapPath,
  writeReviewMarks,
  type ReviewMarks,
  type TeamDispatchSectionId,
} from '@/services/teamDispatchReview'
import { attachPackedSorties, planDispatchSorties } from '@/services/teamDispatchSorties'
import { spanWidthsFromRows, teamPlanSpanWidths } from '@/services/teamPlanCorridor'
import { CoordinatorOffsetPlans } from '@/components/CoordinatorOffsetPlans'
import { crewOffsetAirports } from '@/services/coordinatorOffsetExport'
import { type SortieSide } from '@/services/offsetRouteFpl'
import { buildTeamSortieFile, draftTeamPlan, ferryCrossingNote, legacySortieNote, packedDownloadLabel, teamSortieOffsetRoute, type PackedTeamSortie, type TeamPlanAirport, type TeamRoutePoint } from '@/services/teamPlanRecord'
import { resolvePublishedLegWidths, routeCurveSide, segmentCurveSide } from '@survey-planning/offsetRoutePlan.js'
import { useHintsSeen } from '@/hooks/useHintsSeen'
import { isCoordinatorSurveyAnchor } from '@/utils/coordinatorSurveyPlan'
import {
  CorridorTrackPlanEditor,
} from '@/components/CorridorTrackPlanEditor'
import {
  spanTrackRowsFromWidthTexts,
  spanTrackPlanFromRows,
  applySpacingToRows,
  validateSpanTrackRows,
  type SpanTrackRowState,
} from '@/utils/coordinatorSpanTrackPlan'
import {
  SORTIE_BUDGET_DEFAULT_NM,
  SORTIE_BUDGET_MAX_NM,
  SORTIE_BUDGET_MIN_NM,
  SORTIE_BUDGET_STEP_NM,
  formatSortieEndurance,
  readSortieBudgetEntry,
  resolveSortieBudget,
} from '@/services/sortieBudget'

const HINT_COORD_QUICK_REF = 'coordinatorSurvey.quickReference'
const HINT_COORD_ENROUTE_RECOVERY = 'coordinatorSurvey.enrouteRecovery'
const HINT_COORD_TEAMS_FLOW = 'coordinatorSurvey.teamsFlow'

const PILOT_REFUEL_GUIDANCE =
  'Pilots should refuel to levels needed to return to home airports and have remaining fuel levels at regular operational levels on landing, if possible. This will avoid having to refuel at their home airports in many cases.'

function PilotRefuelGuidanceBox({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-cap-ultramarine/25 bg-slate-50 px-4 py-3 text-sm text-gray-700 leading-relaxed ${className}`}
    >
      <p className="font-medium text-gray-900 mb-1">Return-to-home fuel (pilot responsibility)</p>
      <p>{PILOT_REFUEL_GUIDANCE}</p>
    </div>
  )
}

/** Match NewFlightPlanPage airport identifier fields. */
const AIRPORT_CODE_INPUT_CLASS =
  'min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase focus:ring-2 focus:ring-cap-ultramarine focus:border-transparent'
const AIRPORT_LOOKUP_BTN_CLASS =
  'px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 whitespace-nowrap shrink-0 focus:outline-none focus:ring-2 focus:ring-cap-ultramarine focus:ring-offset-2'
const AIRPORT_LOOKUP_BTN_IDLE_CLASS = 'opacity-50 cursor-not-allowed'
const AIRPORT_LOOKUP_RESULT_CLASS = 'text-sm text-green-700 mt-1.5 font-medium'

function onAirportCodeInputKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  lookupBtn: HTMLButtonElement | null,
  runLookup: () => void,
  canLookup: boolean
) {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (canLookup) runLookup()
    return
  }
  // Grid layout can skip adjacent buttons in tab order; always visit Look up after the code field.
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    lookupBtn?.focus()
  }
}

function waypointPtIdent(originalName: string): string {
  const parsed = parseWaypointCode(originalName)
  return parsed?.waypointLetter ?? originalName
}

type TeamCount = 1 | 2 | 3

function formatSurveySide(
  side: string,
  curve: { innerSide: 'left' | 'right'; outerSide: 'left' | 'right' } | null
) {
  if (side === 'both') return 'both sides'
  if (side === 'inner' || side === 'outer') return side
  if (curve && side === curve.innerSide) return 'inner'
  if (curve && side === curve.outerSide) return 'outer'
  return side
}

function RefuelStopField({
  value,
  shared,
  onChange,
}: {
  value: AirportResult | null
  shared: AirportResult | null
  onChange: (airport: AirportResult | null) => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const choices = [shared, value].filter((airport, index, list): airport is AirportResult => {
    if (!airport) return false
    return list.findIndex((item) => item?.identifier === airport.identifier) === index
  })
  return (
    <div>
      <select
        aria-label="Refuel stop"
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
        value={value?.identifier ?? ''}
        onChange={(event) => {
          const ident = event.target.value
          if (!ident) {
            onChange(null)
            return
          }
          const found = choices.find((airport) => airport.identifier === ident)
          if (found) onChange(found)
        }}
      >
        <option value="">None</option>
        {choices.map((airport) => (
          <option key={airport.identifier} value={airport.identifier}>
            {airport.identifier}
          </option>
        ))}
      </select>
      <div className="mt-1 flex gap-1">
        <input
          aria-label="Refuel airport ident"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Ident"
          className="w-16 rounded border border-gray-300 px-1 py-0.5 text-xs font-mono"
        />
        <button
          type="button"
          disabled={busy || !cleanAirportId(code)}
          onClick={() => {
            setBusy(true)
            setErr(null)
            void apiService
              .fetchAirport(code)
              .then((result) => {
                if (result.status !== 'found') {
                  setErr(airportLookupMessage(result))
                  return
                }
                onChange(result.airport)
                setCode('')
              })
              .catch(() => setErr(FAA_AIRPORT_SERVICE_MESSAGE))
              .finally(() => setBusy(false))
          }}
          className="rounded border border-gray-300 px-1.5 py-0.5 text-xs"
        >
          {busy ? '…' : 'Look up'}
        </button>
      </div>
      {err ? <p className="mt-1 text-xs text-red-700">{err}</p> : null}
    </div>
  )
}

type FerryMode = 'return-home' | 'staged-refuel'

type RunMode = 'single' | 'compare-1-2' | 'compare-2-3'

type PlannerResult =
  | ReturnType<typeof planSurveyScenario>
  | ReturnType<typeof planThreeTeamGeographicScenario>

type SurveyTeamInput = {
  label: string
  depLat: number
  depLon: number
  side: 'left' | 'right'
}
type Compare12Result = ReturnType<typeof compareOneVsTwoTeamStaffing>
type Compare23Result = ReturnType<typeof compareTwoVsThreeTeamStaffing>
type CompareBundle =
  | { kind: '1-2'; data: Compare12Result }
  | { kind: '2-3'; data: Compare23Result }

type SortieExportContext = {
  waypoints: WaypointRecord[]
  routeLabel: string
  points: TeamRoutePoint[]
  legWidths: Array<{ leftNm: number; rightNm: number } | null> | null
  policy: { firstOffsetNm: number; stepNm: number }
  resolveTeamAirport: (teamLabel: string) => AirportRecord | null
  resolveAirportByIdent: (ident: string) => AirportRecord | null
}

type PlannerSortie = SortieFplSortie & {
  ferryInNm: number
  alongRouteNm: number
  ferryOutNm: number
  totalNm: number
  overBudget?: boolean
  returnHomeOnly?: boolean
  side?: 'left' | 'right'
  offsetsPerSide?: string
}

function CoordinatorConsoleGuide() {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const { isSeen, markSeen } = useHintsSeen()
  const seen = isSeen(HINT_COORD_QUICK_REF)

  const closeGuide = () => {
    if (detailsRef.current) detailsRef.current.open = false
  }

  return (
    <details
      ref={detailsRef}
      className="mb-6 rounded-xl border border-cap-ultramarine/30 bg-slate-50 open:shadow-sm group"
    >
      <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-cap-ultramarine flex items-center justify-between gap-2">
        <span>Coordinator quick reference &amp; symbology</span>
        <span className={guidedHintTriggerClassName('light', false)}>
          <GuidedHintTriggerFace
            stepNumber={2}
            isSeen={seen}
            title="Coordinator quick reference and symbology"
          />
        </span>
      </summary>
      <div className="px-5 pb-5 text-sm text-gray-800 space-y-5 border-t border-cap-ultramarine/15 pt-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">What this console does</h3>
          <p>
            Complete the <strong>published MTR</strong> in this console, then assign aircraft and Mission
            Pilots when they are available. Use corridor tracks and team what-if planning to staff the
            survey. Crews still fly corridors in ForeFlight Military Flight Bag.
          </p>
          <p className="mt-2">
            When the team design is set, export each sortie <strong>.fpl</strong> and{' '}
            <strong>email it to that aircraft&apos;s Mission Pilot</strong> (or copy it to an SD card for
            G1000 import).
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Issue files to crews</h3>
          <p>
            After staffing Teams, export one <strong>.fpl</strong> per sortie (results row or fragment card).
            Email that file to the Mission Pilot of the aircraft assigned to the sortie. They import it on
            the G1000 from an SD card if you did not attach the file in a way they can load directly.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Corridor and lane spacing (Scenario)</h3>
          <p className="mb-2">
            NASR <strong>CORRIDORS ARE</strong> lines load automatically. The coordinator sets how many offset
            lanes and at what NM spacing each side needs. The sortie file places a waypoint on each lane. A pass
            past that side&apos;s published width is not flown. Adjust the list and re-run Compare or Run planner
            to see sortie impact.
          </p>
          <ul className="space-y-1 list-disc pl-5 text-xs text-gray-600">
            <li>
              <strong>Left offsets</strong> — left of the centerline as flown.
            </li>
            <li>
              <strong>Right offsets</strong> — right of the centerline as flown.
            </li>
            <li>
              <strong>Reset offsets</strong> — restore wing default spacing from the span&apos;s NM half-widths.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Planner modes</h3>
          <ul className="space-y-2 list-disc pl-5">
            <li>
              <strong>Single — 1 team:</strong> one aircraft. Each sortie lists its side; fly the side shown. A later
              sortie is already in flying order; load it and fly it as listed. Do not invert the flight plan on the
              G1000. Each sortie is its own .fpl file.
            </li>
            <li>
              <strong>Single — 2 teams:</strong> two teams working neighboring sides at the same time — Team 1 inner,
              Team 2 outer, same geography.
            </li>
            <li>
              <strong>Single — 3 teams:</strong> geographic split — three route segments; each team flies both sides of
              its segment from its own base. Recommended: each segment flies the opposite side from the segments next
              to it (e.g. segment 1 Inner, segment 2 Outer, segment 3 Inner). This is a recommendation, not guaranteed
              separation; pilots still deconflict.
            </li>
            <li>
              <strong>Compare 1 vs 2:</strong> full corridor with one aircraft vs two teams working neighboring sides
              at the same time.
            </li>
            <li>
              <strong>Compare 2 vs 3:</strong> opposite-side vs geographic split (both full corridor).
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-2">En-route recovery (staged refuel)</h3>
          <p className="mb-2">
            Use <strong>Staged refuel between sides</strong> and look up a <strong>shared refueling airport</strong>{' '}
            near the MTR when home is far from the route. All aircraft use the same field — especially useful when
            ferry dominates the sortie budget (e.g. IR107 from KABQ with recovery at KCAO).
          </p>
          <ul className="space-y-2 list-disc pl-5">
            <li>
              <strong>2 teams:</strong> each crew stays on the side of the centerline it picks for every sortie. The
              other crew flies the other side. Sorties land at the shared refuel airport, and the{' '}
              <strong>final sortie</strong> returns home — combined with remaining survey work when it fits the NM
              budget, otherwise a separate ferry-only return sortie (pilots plan fuel).
            </li>
            <li>
              <strong>1 team — one aircraft. Each sortie lists its side; fly the side shown.</strong> A later sortie
              is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000.
              Each sortie is its own .fpl file.
            </li>
            <li>
              <strong>Multi-aircraft:</strong> deconfliction is <strong>pilot responsibility</strong> — maintain radio
              contact and <strong>stagger takeoff times</strong>. Announce when you enter and exit each lane, giving
              your position by waypoint name (for example, entering B1O).
            </li>
            <li>
              <strong>G1000 sortie 2:</strong> Sortie 2 is already in flying order; load it and fly it as listed. Do
              not invert the flight plan on the G1000. Sortie 2 is its own .fpl file.
            </li>
          </ul>
          <p className="mt-2 text-xs text-gray-600">
            Full spec:{' '}
            <code className="bg-gray-100 px-1 rounded">docs/COORDINATOR_ENROUTE_RECOVERY_BRIEF.md</code>
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Symbology</h3>
          <table className="min-w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
            <tbody>
              <tr className="border-b border-gray-200 bg-white">
                <th className="py-2 px-3 text-left font-semibold text-gray-700 w-36">Inner / Outer</th>
                <td className="py-2 px-3">
                  Inner is the inside of the route's curve. Outer is the other side. Published widths stay
                  left and right of the centerline as flown. Asymmetric spans keep a different list on each
                  side (VR114 B→M1 is 10 NM left and 20 NM right).
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-3 text-left font-semibold text-gray-700">Offsets (e.g. 3, 9)</th>
                <td className="py-2 px-3 font-mono">
                  Lane spacing (NM), inner then outer. The sortie file places a waypoint on each lane. Set per
                  NASR span in Scenario; default wing policy is 3 NM, then every 6 NM, and stops at the published width. A 20 NM side is 3, 9, 15. A pass past the edge is not flown.
                </td>
              </tr>
              <tr className="border-b border-gray-200 bg-white">
                <th className="py-2 px-3 text-left font-semibold text-gray-700">Sortie budget</th>
                <td className="py-2 px-3">
                  Max NM per sortie (100–500, default 400). Hours next to the field use 100 KTAS because the app has no
                  survey-speed setting.
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-3 text-left font-semibold text-gray-700">Ferry in / out</th>
                <td className="py-2 px-3">Departure airport ↔ route entry or exit for that sortie.</td>
              </tr>
              <tr className="border-b border-gray-200 bg-white">
                <th className="py-2 px-3 text-left font-semibold text-gray-700">Along route</th>
                <td className="py-2 px-3">
                  Offset legs on the assigned waypoint chain (one directed leg per offset in the sortie).
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="py-2 px-3 text-left font-semibold text-gray-700">⚠ in Total</th>
                <td className="py-2 px-3">Sortie exceeds the NM budget — consider smaller segment or more teams.</td>
              </tr>
              <tr>
                <th className="py-2 px-3 text-left font-semibold text-gray-700">Geographic split</th>
                <td className="py-2 px-3">
                  Boundaries at shared waypoints; optimizer picks segment cuts and which airport serves which segment
                  (fewest sorties, then NM).
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-sm font-bold text-cap-pimento">
          Wing planning aid only. Verify corridors and procedures in ForeFlight Military Flight Bag before flying.
        </p>

        <GuidedHintDismissActions
          className="pt-2"
          onNotNow={closeGuide}
          onGotIt={() => {
            markSeen(HINT_COORD_QUICK_REF)
            closeGuide()
          }}
        />
      </div>
    </details>
  )
}

function SurveyPlannerResults({
  title,
  result,
  exportCtx,
  onPilotBrief,
  showRefuelGuidance = false,
}: {
  title?: string
  result: PlannerResult
  exportCtx?: SortieExportContext | null
  onPilotBrief?: (brief: SortieFplPilotBrief) => void
  showRefuelGuidance?: boolean
}) {
  const [exportErr, setExportErr] = useState<string | null>(null)
  const curve = exportCtx?.points?.length ? routeCurveSide(exportCtx.points) : null

  const handleExportSortie = (
    team: PlannerResult['teams'][0],
    sortie: PlannerSortie
  ) => {
    if (!exportCtx) return
    setExportErr(null)
    try {
      if (sortie.returnHomeOnly) {
        setExportErr(null)
        return
      }
      const depIdent =
        sortie.ferryInLabel ?? team.label.replace(/ \((left|right)\)$/i, '').trim()
      const destIdent = sortie.ferryOutLabel ?? depIdent
      const dep =
        exportCtx.resolveAirportByIdent(depIdent) ?? exportCtx.resolveTeamAirport(team.label)
      const dest = exportCtx.resolveAirportByIdent(destIdent) ?? dep
      if (!dep) {
        setExportErr(`No departure airport for sortie (${depIdent}).`)
        return
      }
      if (!dest) {
        setExportErr(`No destination airport for sortie (${destIdent}).`)
        return
      }
      if (!exportCtx.legWidths) {
        setExportErr('No published width for this segment.')
        return
      }
      const curve = segmentCurveSide(exportCtx.points, sortie.waypointFrom, sortie.waypointTo)
      const surveySide = sortie.side === 'left' || sortie.side === 'right' ? sortie.side : null
      const side: SortieSide = surveySide == null ? 'inner' : surveySide === curve.innerSide ? 'inner' : 'outer'
      const airportOf = (airport: AirportResult) => ({
        identifier: airport.identifier,
        name: airport.name,
        latitude: airport.latitude,
        longitude: airport.longitude,
        elevation: airport.elevation,
      })
      const file = buildTeamSortieFile({
        team: {
          id: 'team1',
          label: dep.identifier,
          departure: airportOf(dep),
          landing: airportOf(dest),
          refuelStop: null,
          segmentFrom: sortie.waypointFrom,
          segmentTo: sortie.waypointTo,
          startPoint: sortie.startAt,
          sorties: [],
          packedSorties: [
            {
              number: sortie.sortieNumber,
              side,
              surveySide,
              offsetsNm: sortie.offsets,
              fromPt: sortie.waypointFrom,
              toPt: sortie.waypointTo,
              departureIdent: dep.identifier,
              landingIdent: dest.identifier,
              distanceNm: sortie.totalNm,
              returnHomeOnly: false,
              startAt: sortie.startAt,
            },
          ],
        },
        routeLabel: exportCtx.routeLabel,
        points: exportCtx.points,
        legWidths: exportCtx.legWidths,
        sortieNumber: sortie.sortieNumber,
        firstOffsetNm: exportCtx.policy?.firstOffsetNm,
        stepNm: exportCtx.policy?.stepNm,
      })
      if ('error' in file) {
        setExportErr(file.error)
        return
      }
      if ('ferryOnly' in file) return
      downloadSortieFpl(file.xml, file.filename)
      onPilotBrief?.({
        teamLabel: depIdent,
        side: formatSurveySide(side, curve),
        rangeLabel: `${sortie.waypointFrom}→${sortie.waypointTo}`,
        startAt: sortie.startAt,
        passCount: sortie.offsets.length,
        offsetsLabel: sortie.offsets.join(', '),
        ferryInLabel: dep.identifier,
        ferryOutLabel: dest.identifier,
        warnRoutePointLimit: false,
        routePointCount: file.userNames.length,
        filename: file.filename,
      })
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : 'Failed to export sortie .fpl')
    }
  }
  return (
    <div className={title ? 'mb-8 last:mb-0' : ''}>
      {title && <h3 className="text-base font-semibold text-gray-900 mb-3">{title}</h3>}
      <p className="text-sm text-gray-600 mb-4">
        Status: <span className="font-mono">{result.status}</span>
        {result.totalSorties != null && (
          <>
            {' '}
            · <strong>{result.totalSorties}</strong> wing sortie
            {result.totalSorties === 1 ? '' : 's'}
          </>
        )}
        {result.totalWingNm != null && (
          <>
            {' '}
            · <strong>{result.totalWingNm}</strong> NM wing total, includes ferry
          </>
        )}
      </p>

      {showRefuelGuidance && <PilotRefuelGuidanceBox className="mb-4" />}

      {result.teams.length > 1 && (
        <div className="mb-4 rounded-lg border border-cap-ultramarine/30 bg-slate-50 px-4 py-3 text-sm">
          <p className="font-medium text-gray-900 mb-2">Wing summary</p>
          <ul className="space-y-1 text-gray-700">
            {result.teams.map((t) => (
              <li key={t.label}>
                {t.label} ({formatSurveySide(t.side, curve)}): {t.sortieCount} sortie{t.sortieCount === 1 ? '' : 's'},{' '}
                {t.totalNm} NM, includes ferry
              </li>
            ))}
          </ul>
        </div>
      )}

      {exportCtx && (
        <p className="text-sm text-gray-600 mb-3">
          Email each exported sortie <strong>.fpl</strong> to that aircraft&apos;s Mission Pilot (or copy it
          to an SD card for G1000 import).
        </p>
      )}

      {exportErr && (
        <p className="text-sm text-red-700 mb-3" role="alert">
          {exportErr}
        </p>
      )}

      {result.teams.map((t) => (
        <div key={t.label} className="mb-6 last:mb-0">
          <p className="text-sm text-gray-700 mb-2">
            <strong>{t.label}</strong> ({formatSurveySide(t.side, curve)}): entry {t.entryWaypoint ?? '—'}, ferry in ~{' '}
            {t.ferryInNm} NM
            {t.sortieCount != null && (
              <>
                {' '}
                · {t.sortieCount} sortie{t.sortieCount === 1 ? '' : 's'}, {t.totalNm} NM, includes ferry
              </>
            )}
          </p>
          {t.note && (
            <p className="text-sm text-amber-800 mb-2" role="status">
              {t.note}
            </p>
          )}
          {t.sorties.length > 0 && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Range</th>
                  <th className="py-2 pr-3">Start at</th>
                  <th className="py-2 pr-3">Offsets</th>
                  <th className="py-2 pr-3">Ferry in</th>
                  <th className="py-2 pr-3">Along route</th>
                  <th className="py-2 pr-3">Ferry out</th>
                  <th className="py-2 pr-3">Total</th>
                  {exportCtx && <th className="py-2">G1000</th>}
                </tr>
              </thead>
              <tbody>
                {t.sorties.map((s) => {
                  const sortie = s as PlannerSortie
                  return (
                  <tr
                    key={sortie.sortieNumber}
                    className={`border-b border-gray-100 ${sortie.overBudget ? 'bg-amber-50' : ''}`}
                  >
                    <td className="py-2 pr-3 tabular-nums">{sortie.sortieNumber}</td>
                    <td className="py-2 pr-3 font-mono">
                      {sortie.returnHomeOnly ? (
                        <span className="text-gray-600 font-sans text-xs">Return home</span>
                      ) : (
                        <>
                          {sortie.waypointFrom}→{sortie.waypointTo}
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono">{sortie.returnHomeOnly ? '—' : sortie.startAt}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {sortie.returnHomeOnly ? '—' : sortie.offsetsPerSide || sortie.offsets.join(', ') || '—'}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {sortie.ferryInNm}
                      {sortie.ferryInLabel ? (
                        <span className="block text-xs font-normal text-gray-500">{sortie.ferryInLabel}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{sortie.alongRouteNm}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {sortie.ferryOutNm}
                      {sortie.ferryOutLabel ? (
                        <span className="block text-xs font-normal text-gray-500">{sortie.ferryOutLabel}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 tabular-nums font-medium">
                      {sortie.totalNm}
                      {sortie.overBudget ? ' ⚠' : ''}
                    </td>
                    {exportCtx && (
                      <td className="py-2">
                        {sortie.returnHomeOnly ? (
                          <span className="text-xs text-gray-500">Ferry only, no survey file</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleExportSortie(t, sortie)}
                            className="text-xs font-medium text-cap-ultramarine hover:underline whitespace-nowrap"
                          >
                            Export one sortie (.fpl): that sortie&apos;s lanes, from departure to landing.
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )})}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}

function airportResultToRecord(a: AirportResult): AirportRecord {
  return {
    id: a.identifier,
    identifier: a.identifier,
    name: a.name,
    latitude: a.latitude,
    longitude: a.longitude,
    elevation: a.elevation,
  }
}

export function CoordinatorSurveyConsolePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const planId = searchParams.get('plan') ?? ''

  const savedPlans = useLiveQuery(
    async () => {
      const all = await db.flightPlans.toArray()
      return all
        .sort((a, b) => b.dateModified.localeCompare(a.dateModified))
        .map((p) => ({ id: p.id, name: p.name }))
    },
    []
  )

  const [runMode, setRunMode] = useState<RunMode>('single')
  const [teamCount, setTeamCount] = useState<TeamCount>(1)
  const [team2Code, setTeam2Code] = useState('')
  const [team2Airport, setTeam2Airport] = useState<AirportResult | null>(null)
  const [team2Err, setTeam2Err] = useState<string | null>(null)
  const [team2Busy, setTeam2Busy] = useState(false)
  const [team1Code, setTeam1Code] = useState('')
  const [team1Airport, setTeam1Airport] = useState<AirportResult | null>(null)
  const [team1Err, setTeam1Err] = useState<string | null>(null)
  const [team1Busy, setTeam1Busy] = useState(false)
  const [team3Code, setTeam3Code] = useState('')
  const [team3Airport, setTeam3Airport] = useState<AirportResult | null>(null)
  const [team3Err, setTeam3Err] = useState<string | null>(null)
  const [team3Busy, setTeam3Busy] = useState(false)

  const team2LookupRef = useRef<HTMLButtonElement>(null)
  const team1CodeInputRef = useRef<HTMLInputElement>(null)
  const team1LookupRef = useRef<HTMLButtonElement>(null)
  const team3CodeInputRef = useRef<HTMLInputElement>(null)
  const team3LookupRef = useRef<HTMLButtonElement>(null)

  const [sortieBudgetNm, setSortieBudgetNm] = useState(SORTIE_BUDGET_DEFAULT_NM)
  const [budgetClampNote, setBudgetClampNote] = useState<string | null>(null)
  const [ferryMode, setFerryMode] = useState<FerryMode>('return-home')
  const [refuelCode, setRefuelCode] = useState('')
  const [refuelAirport, setRefuelAirport] = useState<AirportResult | null>(null)
  const [refuelErr, setRefuelErr] = useState<string | null>(null)
  const [refuelBusy, setRefuelBusy] = useState(false)
  const refuelLookupRef = useRef<HTMLButtonElement>(null)
  const [widthTexts, setWidthTexts] = useState<string[]>([])
  const [widthErr, setWidthErr] = useState<string | null>(null)
  const [widthBusy, setWidthBusy] = useState(false)
  const [spanTrackRows, setSpanTrackRows] = useState<SpanTrackRowState[]>([])
  const [firstOffsetNm, setFirstOffsetNm] = useState(2.5)
  const [stepNm, setStepNm] = useState(5)
  const spacingRef = useRef({ firstOffsetNm: 2.5, stepNm: 5 })
  spacingRef.current = { firstOffsetNm, stepNm }
  const [plannerResult, setPlannerResult] = useState<PlannerResult | null>(null)
  const [compareBundle, setCompareBundle] = useState<CompareBundle | null>(null)
  const [pilotBrief, setPilotBrief] = useState<SortieFplPilotBrief | null>(null)
  const [crewSides, setCrewSides] = useState<Record<string, SortieSide | null>>({})
  const [segmentEdits, setSegmentEdits] = useState<Record<string, { from: string; to: string }> | null>(null)
  const [assignmentLocked, setAssignmentLocked] = useState(false)
  const [appliedInsert, setAppliedInsert] = useState<PlanningInsert | null>(null)
  const [refuelEdits, setRefuelEdits] = useState<Record<string, AirportResult | null> | null>(null)
  const [useSuggestedSegments, setUseSuggestedSegments] = useState(false)
  const [teamPlanNotice, setTeamPlanNotice] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [reviewMarks, setReviewMarks] = useState<ReviewMarks>({})
  const [dispatchUnsaved, setDispatchUnsaved] = useState(false)
  const [openSections, setOpenSections] = useState<TeamDispatchSectionId[]>([])
  const sectionRefs = useRef<Partial<Record<TeamDispatchSectionId, HTMLElement | null>>>({})
  const [resultsStale, setResultsStale] = useState(false)
  const [hydratedPlanId, setHydratedPlanId] = useState<string | null>(null)
  const wizardAutoOpened = useRef(false)
  const hadPlannerResults = useRef(false)
  const dirtyBaselinePlan = useRef<string | null>(null)
  const widthSettle = useRef(false)
  const teamPlanRestored = useRef<string | null>(null)
  const { isSeen, markSeen } = useHintsSeen()

  const savedTeamPlan = useLiveQuery(
    () => (planId ? db.teamPlans.get(planId) : undefined),
    [planId]
  )
  const savedTeamPlanRef = useRef(savedTeamPlan)
  savedTeamPlanRef.current = savedTeamPlan

  const planBundle = useLiveQuery(async () => {
    if (!planId) return null
    const plan = await db.flightPlans.get(planId)
    if (!plan) return null
    const waypoints = await db.waypoints.where('flightPlanId').equals(planId).sortBy('sequence')
    let departure = null
    let destination = null
    if (plan.departureAirportId) {
      departure = await db.airports.get(plan.departureAirportId)
    }
    if (plan.destinationAirportId) {
      destination = await db.airports.get(plan.destinationAirportId)
    }
    return { plan, waypoints, departure, destination }
  }, [planId])

  const routeMeta = useMemo(() => {
    const first = planBundle?.waypoints[0]
    if (!first) return null
    const parsed = parseWaypointCode(first.originalName)
    if (!parsed) return null
    return { routeType: parsed.routeType, routeNumber: parsed.routeNumber }
  }, [planBundle])

  const sortieExportCtx = useMemo((): SortieExportContext | null => {
    if (!planBundle?.waypoints.length) return null
    const routeLabel = routeMeta
      ? `${routeMeta.routeType}${routeMeta.routeNumber}`
      : planBundle.plan.name.replace(/\s+/g, '')
    const resolveAirportByIdent = (ident: string): AirportRecord | null => {
      const code = ident.trim().toUpperCase()
      if (planBundle.departure?.identifier.toUpperCase() === code) return planBundle.departure
      if (team1Airport?.identifier.toUpperCase() === code) return airportResultToRecord(team1Airport)
      if (refuelAirport?.identifier.toUpperCase() === code) return airportResultToRecord(refuelAirport)
      if (team2Airport?.identifier.toUpperCase() === code) return airportResultToRecord(team2Airport)
      if (team3Airport?.identifier.toUpperCase() === code) return airportResultToRecord(team3Airport)
      for (const airport of Object.values(refuelEdits ?? {})) {
        if (airport?.identifier.toUpperCase() === code) return airportResultToRecord(airport)
      }
      for (const team of savedTeamPlan?.teams ?? []) {
        if (team.refuelStop?.identifier.toUpperCase() === code) {
          return {
            id: team.refuelStop.identifier,
            identifier: team.refuelStop.identifier,
            name: team.refuelStop.name,
            latitude: team.refuelStop.latitude,
            longitude: team.refuelStop.longitude,
            elevation: team.refuelStop.elevation,
          }
        }
      }
      return null
    }
    let waypoints = planBundle.waypoints
    if (appliedInsert) {
      const idents = waypoints.map((waypoint) => waypointPtIdent(waypoint.originalName))
      const index = idents.indexOf(appliedInsert.afterIdent)
      if (index >= 0) {
        const inserted = {
          id: `wp-${appliedInsert.point.ptIdent}`,
          flightPlanId: planBundle.plan.id,
          originalName: appliedInsert.point.originalName || appliedInsert.point.ptIdent,
          g1000Name: appliedInsert.point.g1000Name || appliedInsert.point.ptIdent,
          latitude: appliedInsert.point.lat,
          longitude: appliedInsert.point.lon,
          routeType: waypoints[0].routeType,
          sequence: index + 1,
        }
        waypoints = [
          ...waypoints.slice(0, index + 1),
          inserted,
          ...waypoints.slice(index + 1).map((waypoint, offset) => ({ ...waypoint, sequence: index + 2 + offset })),
        ]
      }
    }
    const geometryPoints: TeamRoutePoint[] = waypoints.map((waypoint) => ({
      ptIdent: waypointPtIdent(waypoint.originalName),
      originalName: waypoint.originalName,
      lat: waypoint.latitude,
      lon: waypoint.longitude,
      g1000Name: waypoint.g1000Name,
    }))
    let previewWidths: Array<{ leftNm: number; rightNm: number } | null> | null = null
    if (routeMeta && spanTrackRows.length > 0 && widthTexts.length > 0) {
      try {
        const summaries = buildLegWidthSummaries({
          routeType: routeMeta.routeType,
          routeNumber: routeMeta.routeNumber,
          waypoints: geometryPoints.map((point) => ({ ptIdent: point.ptIdent, lat: point.lat, lon: point.lon })),
          widthTexts,
          teams: [],
          spanTrackPlan: spanTrackPlanFromRows(spanTrackRows),
        })
        previewWidths = summaries.map((leg) =>
          leg.leftNm != null && leg.rightNm != null ? { leftNm: leg.leftNm, rightNm: leg.rightNm } : null
        )
      } catch {
        previewWidths = null
      }
    }
    return {
      waypoints,
      routeLabel,
      points: geometryPoints,
      legWidths: previewWidths,
      policy: { firstOffsetNm, stepNm },
      resolveTeamAirport: (teamLabel: string) => {
        const base = teamLabel.replace(/ \((left|right)\)$/i, '').trim()
        return resolveAirportByIdent(base)
      },
      resolveAirportByIdent,
    }
  }, [planBundle, routeMeta, refuelAirport, team1Airport, team2Airport, team3Airport, refuelEdits, savedTeamPlan, appliedInsert, firstOffsetNm, stepNm, spanTrackRows, widthTexts])

  const crossingNoteFor = (
    crewIdent: string,
    sortie: PackedTeamSortie,
    departure: { identifier: string; latitude: number; longitude: number },
    landing: { identifier: string; latitude: number; longitude: number }
  ): string | null => {
    if (!sortieExportCtx?.legWidths || !dispatchPlan || 'error' in dispatchPlan) return null
    const ownTeam = dispatchPlan.teams.find((team) => team.ident.toUpperCase() === crewIdent.toUpperCase())
    if (!ownTeam) return null
    const asAirport = (ident: string) => {
      const found = sortieExportCtx.resolveAirportByIdent(ident)
      return found
        ? { identifier: found.identifier, name: found.name, latitude: found.latitude, longitude: found.longitude }
        : null
    }
    const widths = sortieExportCtx.legWidths
    if (!widths) return null
    const drafted = (team: (typeof dispatchPlan.teams)[number]) => ({
      id: 'team1' as const,
      label: team.ident,
      departure: asAirport(team.ident),
      landing: asAirport(team.ident),
      refuelStop: refuelAirport
        ? { identifier: refuelAirport.identifier, name: refuelAirport.name, latitude: refuelAirport.latitude, longitude: refuelAirport.longitude }
        : null,
      segmentFrom: team.fromPt,
      segmentTo: team.toPt,
      startPoint: team.fromPt,
      sorties: [],
      packedSorties: team.sorties,
      chosenSide: null,
    })
    const own = teamSortieOffsetRoute({
      team: drafted(ownTeam),
      points: sortieExportCtx.points,
      legWidths: widths,
      sortieNumber: sortie.number,
      firstOffsetNm,
      stepNm,
      homeIdent: crewIdent,
      homes: dispatchPlan.teams.map((team) => team.ident),
    })
    if (!('waypoints' in own)) return null
    const others = dispatchPlan.teams
      .filter((team) => team.ident.toUpperCase() !== crewIdent.toUpperCase())
      .flatMap((team) =>
        team.sorties
          .filter((item) => item.offsetsNm.length > 0)
          .map((item) => {
            const route = teamSortieOffsetRoute({
              team: drafted(team),
              points: sortieExportCtx.points,
              legWidths: widths,
              sortieNumber: item.number,
              firstOffsetNm,
              stepNm,
              homeIdent: team.ident,
              homes: dispatchPlan.teams.map((crew) => crew.ident),
            })
            return 'waypoints' in route
              ? { ident: team.ident, fromPt: item.fromPt, toPt: item.toPt, points: route.waypoints }
              : null
          })
          .filter((item): item is { ident: string; fromPt: string; toPt: string; points: typeof own.waypoints } => item != null)
      )
    return ferryCrossingNote({
      departure: { lat: departure.latitude, lon: departure.longitude },
      landing: { lat: landing.latitude, lon: landing.longitude },
      own: own.waypoints,
      others,
    })
  }

  const exportDispatchSortie = (crewIdent: string, sortie: PackedTeamSortie) => {
    if (!sortieExportCtx || sortie.returnHomeOnly || sortie.offsetsNm.length === 0) return
    const homes = [team1Airport, team2Airport, team3Airport].filter((airport): airport is AirportResult => Boolean(airport))
    const home = homes.find((airport) => airport.identifier.toUpperCase() === crewIdent.toUpperCase())
    const dep = sortieExportCtx.resolveAirportByIdent(sortie.departureIdent)
    const dest = sortieExportCtx.resolveAirportByIdent(sortie.landingIdent) ?? dep
    if (!home || !dep || !dest || !sortieExportCtx.legWidths) return
    const airportOf = (airport: { identifier: string; name: string; latitude: number; longitude: number; elevation?: number }) => ({
      identifier: airport.identifier,
      name: airport.name,
      latitude: airport.latitude,
      longitude: airport.longitude,
      elevation: airport.elevation,
    })
    const file = buildTeamSortieFile({
      team: {
        id: 'team1',
        label: home.identifier,
        departure: airportOf(home),
        landing: airportOf(dest),
        refuelStop: dep.identifier.toUpperCase() === home.identifier.toUpperCase() ? null : airportOf(dep),
        segmentFrom: sortie.fromPt,
        segmentTo: sortie.toPt,
        startPoint: sortie.startAt,
        sorties: [],
        packedSorties:
          dispatchPlan && !('error' in dispatchPlan)
            ? (dispatchPlan.teams.find((team) => team.ident.toUpperCase() === crewIdent.toUpperCase())?.sorties ?? [sortie])
            : [sortie],
      },
      routeLabel: sortieExportCtx.routeLabel,
      points: sortieExportCtx.points,
      legWidths: sortieExportCtx.legWidths,
      sortieNumber: sortie.number,
      firstOffsetNm: sortieExportCtx.policy?.firstOffsetNm,
      stepNm: sortieExportCtx.policy?.stepNm,
      homeIdent: home.identifier,
      homes: homes.map((airport) => airport.identifier),
    })
    if ('xml' in file) {
      downloadSortieFpl(file.xml, file.filename)
      const curve = segmentCurveSide(sortieExportCtx.points, sortie.fromPt, sortie.toPt)
      setPilotBrief({
        teamLabel: home.identifier,
        side: formatSurveySide(sortie.side ?? 'inner', curve),
        rangeLabel: `${sortie.fromPt}→${sortie.toPt}`,
        startAt: sortie.startAt ?? '',
        passCount: sortie.offsetsNm.length,
        offsetsLabel: sortie.offsetsNm.join(', '),
        ferryInLabel: dep.identifier,
        ferryOutLabel: dest.identifier,
        warnRoutePointLimit: false,
        routePointCount: file.userNames.length,
        filename: file.filename,
        sortieNumber: sortie.number,
        turnDeg: file.maxTurnDeg,
        laneExample: file.userNames[0],
        crossingNote: crossingNoteFor(crewIdent, sortie, airportOf(dep), airportOf(dest)) ?? undefined,
        sideNote: segmentCurveSide(sortieExportCtx.points, sortie.fromPt, sortie.toPt).note ?? undefined,
      })
    }
  }

  const isAnchorPlan = Boolean(planBundle && isCoordinatorSurveyAnchor(planBundle.plan))

  useEffect(() => {
    if (wizardAutoOpened.current || planId) return
    wizardAutoOpened.current = true
    setWizardOpen(true)
  }, [planId])

  useEffect(() => {
    teamPlanRestored.current = null
    setCrewSides({})
    setTeamPlanNotice(null)
    setTeam1Code('')
    setTeam1Airport(null)
    setTeam1Err(null)
    setTeam2Code('')
    setTeam2Airport(null)
    setTeam2Err(null)
    setTeam3Code('')
    setTeam3Airport(null)
    setTeam3Err(null)
    setRefuelCode('')
    setRefuelAirport(null)
    setRefuelErr(null)
    setSegmentEdits(null)
    setRefuelEdits(null)
    setUseSuggestedSegments(false)
    setAppliedInsert(null)
    setHydratedPlanId(null)
    dirtyBaselinePlan.current = null
  }, [planId])

  useEffect(() => {
    if (!planBundle || isAnchorPlan || savedTeamPlan === undefined || savedTeamPlan) return
    const destId = planBundle.destination?.identifier ?? ''
    const depId = planBundle.departure?.identifier ?? ''
    if (destId && destId !== depId) {
      setTeam2Code(destId)
      setTeam2Airport({
        identifier: planBundle.destination!.identifier,
        name: planBundle.destination!.name,
        latitude: planBundle.destination!.latitude,
        longitude: planBundle.destination!.longitude,
        elevation: planBundle.destination!.elevation,
      })
      setTeam2Err(null)
      setRefuelCode(destId)
      setRefuelAirport({
        identifier: planBundle.destination!.identifier,
        name: planBundle.destination!.name,
        latitude: planBundle.destination!.latitude,
        longitude: planBundle.destination!.longitude,
        elevation: planBundle.destination!.elevation,
      })
      setRefuelErr(null)
    }
  }, [planBundle?.plan.id, planBundle?.destination?.identifier, planBundle?.departure?.identifier, isAnchorPlan, savedTeamPlan])

  useEffect(() => {
    if (!planId || savedTeamPlan === undefined) return
    if (savedTeamPlan && savedTeamPlan.flightPlanId !== planId) return
    if (teamPlanRestored.current === planId) return
    teamPlanRestored.current = planId
    if (!savedTeamPlan) {
      setHydratedPlanId(planId)
      return
    }
    const count = Math.min(3, Math.max(1, savedTeamPlan.teams.length)) as TeamCount
    setTeamCount(count)
    setRunMode('single')
    const apply = (
      airport: TeamPlanAirport | null,
      setCode: (value: string) => void,
      setAirport: (value: AirportResult | null) => void
    ) => {
      if (!airport) return
      setCode(airport.identifier)
      setAirport({
        identifier: airport.identifier,
        name: airport.name,
        latitude: airport.latitude,
        longitude: airport.longitude,
        elevation: airport.elevation,
      })
    }
    const byId = (id: string) => savedTeamPlan.teams.find((team) => team.id === id)
    apply(byId('team1')?.departure ?? null, setTeam1Code, setTeam1Airport)
    apply(byId('team2')?.departure ?? null, setTeam2Code, setTeam2Airport)
    apply(byId('team3')?.departure ?? null, setTeam3Code, setTeam3Airport)
    const sides: Record<string, SortieSide | null> = {}
    for (const team of savedTeamPlan.teams) {
    const packedSide = team.packedSorties?.find((sortie) => sortie.side)?.side ?? null
    sides[team.id] = team.chosenSide ?? packedSide ?? team.sorties.find((sortie) => sortie.side)?.side ?? null
    }
    setCrewSides(sides)
    const savedRefuel = savedTeamPlan.teams.find((team) => team.refuelStop)?.refuelStop ?? null
    if (savedRefuel) {
      setFerryMode('staged-refuel')
      setRefuelAirport({
        identifier: savedRefuel.identifier,
        name: savedRefuel.name,
        latitude: savedRefuel.latitude,
        longitude: savedRefuel.longitude,
        elevation: savedRefuel.elevation,
      })
    }
    if (savedTeamPlan.firstOffsetNm != null && savedTeamPlan.firstOffsetNm > 0) {
      setFirstOffsetNm(savedTeamPlan.firstOffsetNm)
    }
    if (savedTeamPlan.stepNm != null && savedTeamPlan.stepNm > 0) {
      setStepNm(savedTeamPlan.stepNm)
    }
    if (savedTeamPlan.sortieBudgetNm != null) {
      const resolved = resolveSortieBudget(savedTeamPlan.sortieBudgetNm)
      setSortieBudgetNm(resolved.nm)
      setBudgetClampNote(
        resolved.reduced
          ? `Saved sortie distance ${savedTeamPlan.sortieBudgetNm} NM was reduced to ${resolved.nm} NM.`
          : null
      )
    }
    setAppliedInsert(savedTeamPlan.routeInsert ?? null)
    setTeamPlanNotice('Saved team plan loaded.')
    setHydratedPlanId(planId)
  }, [planId, savedTeamPlan])

  const loadWidth = useCallback(async () => {
    if (!routeMeta || (routeMeta.routeType !== 'IR' && routeMeta.routeType !== 'VR')) {
      setWidthTexts([])
      setWidthErr('Width data requires an IR or VR route in the loaded flight plan.')
      return
    }
    setWidthBusy(true)
    setWidthErr(null)
    try {
      const data = await fetchMtrWidthTexts(routeMeta.routeType, routeMeta.routeNumber)
      setWidthTexts(data.widthTexts)
    } catch (err) {
      setWidthTexts([])
      setWidthErr(err instanceof Error ? err.message : 'Failed to load width data')
    } finally {
      setWidthBusy(false)
    }
  }, [routeMeta])

  useEffect(() => {
    void loadWidth()
  }, [loadWidth])

  const storedSpanKey = JSON.stringify(teamPlanSpanWidths(savedTeamPlan) ?? null)
  const storedSpanWidths = useMemo(() => teamPlanSpanWidths(savedTeamPlan), [storedSpanKey])

  useEffect(() => {
    if (storedSpanWidths) {
      setSpanTrackRows(
        applySpacingToRows(
          storedSpanWidths.map((span) => ({
            fromPt: span.fromPt,
            toPt: span.toPt,
            leftNm: String(span.leftNm),
            rightNm: String(span.rightNm),
            leftOffsetsText: '',
            rightOffsetsText: '',
            displayText: `${span.fromPt}→${span.toPt}`,
          })),
          spacingRef.current
        )
      )
      setPlannerResult(null)
      setCompareBundle(null)
      return
    }
    if (widthTexts.length === 0) return
    setSpanTrackRows(spanTrackRowsFromWidthTexts(widthTexts, spacingRef.current))
    setPlannerResult(null)
    setCompareBundle(null)
  }, [widthTexts, storedSpanWidths])

  useEffect(() => {
    if (spanTrackRows.length > 0 && spanTrackRows.every((row) => Number(row.leftNm) > 0 && Number(row.rightNm) > 0)) {
      setWidthErr(null)
    }
  }, [spanTrackRows])

  useEffect(() => {
    if (!widthErr || spanTrackRows.length > 0 || !planBundle || planBundle.waypoints.length < 2) return
    setSpanTrackRows(
      blankSpansFromPoints(
        planBundle.waypoints.map((waypoint) => ({ ptIdent: waypointPtIdent(waypoint.originalName) }))
      )
    )
  }, [widthErr, spanTrackRows.length, planBundle])

  useEffect(() => {
    setSpanTrackRows((rows) =>
      rows.length === 0 ? rows : applySpacingToRows(rows, { firstOffsetNm, stepNm })
    )
  }, [firstOffsetNm, stepNm])

  useEffect(() => {
    hadPlannerResults.current = Boolean(plannerResult || compareBundle)
  })

  useEffect(() => {
    if (hadPlannerResults.current) setResultsStale(true)
    setPlannerResult(null)
    setCompareBundle(null)
  }, [spanTrackRows, sortieBudgetNm, ferryMode])

  useEffect(() => {
    if (widthBusy) widthSettle.current = true
  }, [widthBusy])

  useEffect(() => {
    if (!planId || hydratedPlanId !== planId || widthBusy) return
    if (dirtyBaselinePlan.current !== planId || widthSettle.current) {
      dirtyBaselinePlan.current = planId
      widthSettle.current = false
      return
    }
    setTeamDispatchUnsaved(planId, true)
    setDispatchUnsaved(true)
    if (savedTeamPlanRef.current?.teams.some((team) => (team.packedSorties?.length ?? 0) > 0)) {
      setTeamSortiesStale(planId, true)
    }
  }, [
    planId,
    hydratedPlanId,
    widthBusy,
    teamCount,
    runMode,
    sortieBudgetNm,
    ferryMode,
    refuelAirport,
    spanTrackRows,
    firstOffsetNm,
    stepNm,
    crewSides,
    team1Airport,
    team2Airport,
    team3Airport,
    segmentEdits,
    refuelEdits,
  ])

  useEffect(() => {
    if (!planId) return
    const warn = (event: BeforeUnloadEvent) => {
      if (!teamDispatchHasUnsaved(planId)) return
      event.preventDefault()
      event.returnValue = ''
    }
    const warnClick = (event: MouseEvent) => {
      if (!teamDispatchHasUnsaved(planId)) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      if (!window.confirm('Team Dispatch has unsaved changes. Leave this page?')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', warnClick, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', warnClick, true)
    }
  }, [planId])

  const spanTrackErr = useMemo(() => validateSpanTrackRows(spanTrackRows), [spanTrackRows])

  const legPreview = useMemo(() => {
    if (!planBundle || !routeMeta || spanTrackRows.length === 0 || spanTrackErr) return null
    try {
      const spanTrackPlan = spanTrackPlanFromRows(spanTrackRows)
      return buildLegWidthSummaries({
        routeType: routeMeta.routeType,
        routeNumber: routeMeta.routeNumber,
        waypoints: planBundle.waypoints.map((w) => ({
          ptIdent: waypointPtIdent(w.originalName),
          lat: w.latitude,
          lon: w.longitude,
        })),
        widthTexts,
        teams: [],
        sortieBudgetNm,
        spanTrackPlan,
      })
    } catch {
      return null
    }
  }, [planBundle, routeMeta, spanTrackRows, spanTrackErr, widthTexts, sortieBudgetNm])

  const lookupTeamAirport = async (
    code: string,
    setAirport: (a: AirportResult | null) => void,
    setErr: (e: string | null) => void,
    setBusy: (b: boolean) => void,
    onSuccess?: () => void
  ) => {
    if (!cleanAirportId(code)) return
    setBusy(true)
    setErr(null)
    try {
      const result = await apiService.fetchAirport(code)
      if (result.status !== 'found') {
        setAirport(null)
        setErr(airportLookupMessage(result))
        return
      }
      setAirport(result.airport)
      onSuccess?.()
    } catch {
      setAirport(null)
      setErr(FAA_AIRPORT_SERVICE_MESSAGE)
    } finally {
      setBusy(false)
    }
  }

  const runTeam1Lookup = () => {
    if (!team1CanLookup) return
    void lookupTeamAirport(team1Code, setTeam1Airport, setTeam1Err, setTeam1Busy, () => {
      queueMicrotask(() => {
        if (needsTeam2) team2LookupRef.current?.focus()
        else if (needsTeam3) team3CodeInputRef.current?.focus()
      })
    })
  }

  const team1CanLookup = Boolean(team1Code.trim()) && !team1Busy
  const team2CanLookup = Boolean(team2Code.trim()) && !team2Busy
  const team3CanLookup = Boolean(team3Code.trim()) && !team3Busy

  const runTeam2Lookup = () => {
    if (!team2CanLookup) return
    void lookupTeamAirport(team2Code, setTeam2Airport, setTeam2Err, setTeam2Busy, () => {
      // After Team 2 resolves, move keyboard focus to Team 3 (same pattern as Flight Plans dep → dest).
      queueMicrotask(() => team3CodeInputRef.current?.focus())
    })
  }

  const runTeam3Lookup = () => {
    if (!team3CanLookup) return
    void lookupTeamAirport(team3Code, setTeam3Airport, setTeam3Err, setTeam3Busy)
  }

  const refuelCanLookup = Boolean(refuelCode.trim()) && !refuelBusy

  const runRefuelLookup = () => {
    if (!refuelCanLookup) return
    void lookupTeamAirport(refuelCode, setRefuelAirport, setRefuelErr, setRefuelBusy)
  }

  const team1Input = () => {
    if (isAnchorPlan) {
      if (!team1Airport) return null
      return {
        label: team1Airport.identifier,
        depLat: team1Airport.latitude,
        depLon: team1Airport.longitude,
        side: 'left' as const,
      }
    }
    const dep = planBundle?.departure
    if (!dep) return null
    return {
      label: dep.identifier,
      depLat: dep.latitude,
      depLon: dep.longitude,
      side: 'left' as const,
    }
  }

  const team2Input = () => {
    if (!team2Airport) return null
    return {
      label: team2Airport.identifier,
      depLat: team2Airport.latitude,
      depLon: team2Airport.longitude,
      side: (teamCount === 3 ? 'left' : 'right') as 'left' | 'right',
    }
  }

  const team3Input = () => {
    if (!team3Airport) return null
    return {
      label: team3Airport.identifier,
      depLat: team3Airport.latitude,
      depLon: team3Airport.longitude,
      side: 'left' as const,
    }
  }

  const buildTeamsForSingle = (): SurveyTeamInput[] => {
    const t1 = team1Input()
    if (!t1) return []
    const teams: SurveyTeamInput[] = [t1]
    const t2 = team2Input()
    if (teamCount === 2 && t2) teams.push(t2)
    return teams
  }

  const plannerBaseInput = () => {
    if (!planBundle || !routeMeta || spanTrackErr) return null
    let spanTrackPlan
    try {
      spanTrackPlan = spanTrackPlanFromRows(spanTrackRows)
    } catch {
      return null
    }
    return {
      routeType: routeMeta.routeType,
      routeNumber: routeMeta.routeNumber,
      waypoints: planBundle.waypoints.map((w) => ({
        ptIdent: waypointPtIdent(w.originalName),
        lat: w.latitude,
        lon: w.longitude,
      })),
      widthTexts,
      sortieBudgetNm,
      spanTrackPlan,
      trackPolicy: { firstOffsetNm, stepNm },
      ferryMode,
      recoveryAirport:
        ferryMode === 'staged-refuel' && refuelAirport
          ? {
              lat: refuelAirport.latitude,
              lon: refuelAirport.longitude,
              label: refuelAirport.identifier,
            }
          : undefined,
    }
  }

  const runPlanner = () => {
    setResultsStale(false)
    if (planId) {
      setReviewMarks((prev) => {
        const next = clearReviewedSections(prev, ['results', 'sides'])
        writeReviewMarks(planId, next)
        return next
      })
    }
    const base = plannerBaseInput()
    const t1 = team1Input()
    if (!base || !t1) return

    if (runMode === 'compare-1-2') {
      const t2 = team2Input()
      if (!t2) return
      setPlannerResult(null)
      setCompareBundle({
        kind: '1-2',
        data: compareOneVsTwoTeamStaffing(
          { ...base, teams: [t1] },
          t2,
          {
            team1DepLabel: isAnchorPlan
              ? team1Airport?.identifier ?? 'Team 1'
              : planBundle?.departure?.identifier ?? 'Team 1',
            team2DepLabel: team2Airport?.identifier ?? 'Team 2',
          }
        ),
      })
      return
    }

    if (runMode === 'compare-2-3') {
      const t2 = team2Input()
      const t3 = team3Input()
      if (!t2 || !t3) return
      setPlannerResult(null)
      setCompareBundle({
        kind: '2-3',
        data: compareTwoVsThreeTeamStaffing(
          { ...base, teams: [t1] },
          t2,
          t3,
          {
            team1DepLabel: isAnchorPlan
              ? team1Airport?.identifier ?? 'Team 1'
              : planBundle?.departure?.identifier ?? 'Team 1',
            team2DepLabel: team2Airport?.identifier ?? 'Team 2',
            team3DepLabel: team3Airport?.identifier ?? 'Team 3',
          }
        ),
      })
      return
    }

    setCompareBundle(null)
    if (teamCount === 1) {
      setPlannerResult(planSingleTeamBothSides({ ...base, teams: [t1] }))
      return
    }

    if (teamCount === 3) {
      const t2 = team2Input()
      const t3 = team3Input()
      if (!t2 || !t3) return
      setPlannerResult(
        planThreeTeamGeographicScenario({ ...base, teams: [t1, t2, t3] }, [t1, t2, t3])
      )
      return
    }

    const teams = buildTeamsForSingle()
    if (teams.length === 0) return
    setPlannerResult(
      planSurveyScenario({
        ...base,
        teams,
        assignmentModel: 'opposite-side',
      })
    )
  }

  const loading = planId && planBundle === undefined
  const team1Ready = isAnchorPlan ? Boolean(team1Airport) : Boolean(planBundle?.departure)
  const needsTeam2 = runMode !== 'single' || teamCount >= 2
  const needsTeam3 = runMode === 'compare-2-3' || (runMode === 'single' && teamCount === 3)
  const offsetCrews = useMemo(() => {
    if (!planBundle) return []
    const planDestination = planBundle.destination ?? null
    const specs: Array<{ id: string; label: string; airport: AirportResult | null; fallback: AirportRecord | null }> = [
      { id: 'team1', label: 'Team 1', airport: team1Airport, fallback: planBundle.departure ?? null },
    ]
    if (needsTeam2) specs.push({ id: 'team2', label: 'Team 2', airport: team2Airport, fallback: null })
    if (needsTeam3) specs.push({ id: 'team3', label: 'Team 3', airport: team3Airport, fallback: null })
    return specs.map((crew) => ({
      id: crew.id,
      label: crew.label,
      ...crewOffsetAirports({
        crewDeparture: crew.airport ? airportResultToRecord(crew.airport) : null,
        planDeparture: crew.fallback,
        planDestination,
      }),
    }))
  }, [planBundle, needsTeam2, needsTeam3, team1Airport, team2Airport, team3Airport])

  const routePointIdents = useMemo(() => {
    const idents = planBundle?.waypoints.map((waypoint) => waypointPtIdent(waypoint.originalName)) ?? []
    if (!appliedInsert) return idents
    const index = idents.indexOf(appliedInsert.afterIdent)
    if (index < 0) return idents
    return [...idents.slice(0, index + 1), appliedInsert.point.ptIdent, ...idents.slice(index + 1)]
  }, [planBundle, appliedInsert])

  const geographicPlan = useMemo(() => {
    if (teamCount !== 3 || !planBundle) return null
    const assignments =
      plannerResult && 'segmentAssignments' in plannerResult ? plannerResult.segmentAssignments : null
    const suggestionFor = (ident: string | null | undefined) => {
      const assigned = assignments?.find((item) => item.teamLabel.toUpperCase() === (ident ?? '').toUpperCase())
      return assigned?.waypointFrom && assigned.waypointTo
        ? { from: assigned.waypointFrom, to: assigned.waypointTo }
        : null
    }
    const crews: Array<{ id: 'team1' | 'team2' | 'team3'; ident: string | null; airport: AirportResult | null }> = [
      {
        id: 'team1',
        ident: team1Airport?.identifier ?? planBundle.departure?.identifier ?? null,
        airport: team1Airport ?? (planBundle.departure
          ? {
              identifier: planBundle.departure.identifier,
              name: planBundle.departure.name,
              latitude: planBundle.departure.latitude,
              longitude: planBundle.departure.longitude,
              elevation: planBundle.departure.elevation,
            }
          : null),
      },
      { id: 'team2', ident: team2Airport?.identifier ?? null, airport: team2Airport },
      { id: 'team3', ident: team3Airport?.identifier ?? null, airport: team3Airport },
    ]
    const basePoints = planBundle.waypoints.map((waypoint) => ({
      ptIdent: waypointPtIdent(waypoint.originalName),
      lat: waypoint.latitude,
      lon: waypoint.longitude,
      g1000Name: waypoint.g1000Name,
    }))
    const baseWidths =
      plannerResult && 'legs' in plannerResult
        ? plannerResult.legs.map((leg) =>
            leg.leftNm != null && leg.rightNm != null ? { leftNm: leg.leftNm, rightNm: leg.rightNm } : null
          )
        : null
    const expanded = expandPlanningRoute(basePoints, baseWidths ?? [], appliedInsert)
    const points = expanded.points
    const legWidths = baseWidths ? expanded.widths : null
    const curve = routeCurveSide(points)
    const rows = crews.map((crew) => {
      const saved = savedTeamPlan?.teams.find((team) => team.id === crew.id)
      const suggested = suggestionFor(crew.ident)
      const segment = useSuggestedSegments
        ? suggested ?? { from: '', to: '' }
        : segmentEdits?.[crew.id] ??
          (saved?.segmentFrom && saved.segmentTo
            ? { from: saved.segmentFrom, to: saved.segmentTo }
            : suggested ?? { from: '', to: '' })
      const home = crew.airport
      const bare =
        home && legWidths && segment.from && segment.to
          ? planTeamSegmentDay({
              points,
              legWidths,
              fromPt: segment.from,
              toPt: segment.to,
              home: { lat: home.latitude, lon: home.longitude, identifier: home.identifier },
              refuel: null,
              sortie1Side: crewSides[crew.id] === 'outer' ? curve.outerSide : curve.innerSide,
              policy: { firstOffsetNm, stepNm },
              budgetNm: sortieBudgetNm,
            })
          : null
      let refuel: AirportResult | null = null
      const chosenRefuel = refuelAirportForCrew(crew.id, ferryMode, refuelAirport, refuelEdits)
      if (ferryMode === 'staged-refuel') refuel = chosenRefuel
      else if (!useSuggestedSegments && saved && 'refuelStop' in saved) {
        const stop = saved.refuelStop
        refuel = stop
          ? {
              identifier: stop.identifier,
              name: stop.name,
              latitude: stop.latitude,
              longitude: stop.longitude,
              elevation: stop.elevation,
            }
          : null
      }
      const day =
        refuel && home && legWidths && segment.from && segment.to
          ? planTeamSegmentDay({
              points,
              legWidths,
              fromPt: segment.from,
              toPt: segment.to,
              home: { lat: home.latitude, lon: home.longitude, identifier: home.identifier },
              refuel: { lat: refuel.latitude, lon: refuel.longitude, identifier: refuel.identifier },
              sortie1Side: crewSides[crew.id] === 'outer' ? curve.outerSide : curve.innerSide,
              policy: { firstOffsetNm, stepNm },
              budgetNm: sortieBudgetNm,
            })
          : bare
      return {
        id: crew.id,
        label: crew.ident ?? crew.id,
        from: segment.from,
        to: segment.to,
        refuel,
        day,
      }
    })
    const validation = validateTeamSegments(
      routePointIdents,
      rows.map((row) => ({ label: row.label, from: row.from, to: row.to }))
    )
    const planned = rows.filter((row) => row.day)
    const totalWingNm =
      Math.round(planned.reduce((sum, row) => sum + (row.day?.totalNm ?? 0), 0) * 10) / 10
    const totalSorties = planned.reduce((sum, row) => sum + (row.day?.sorties.length ?? 0), 0)
    return { rows, validation, totalWingNm, totalSorties }
  }, [
    teamCount,
    planBundle,
    plannerResult,
    savedTeamPlan,
    useSuggestedSegments,
    segmentEdits,
    refuelEdits,
    team1Airport,
    team2Airport,
    team3Airport,
    crewSides,
    firstOffsetNm,
    stepNm,
    sortieBudgetNm,
    ferryMode,
    refuelAirport,
    routePointIdents,
    appliedInsert,
  ])

  const teamSegments = useMemo(() => {
    const letters = routePointIdents
    const full =
      letters.length >= 2 ? { from: letters[0], to: letters[letters.length - 1], start: letters[0] } : null
    if (geographicPlan) {
      return {
        team1: geographicPlan.rows[0]?.from
          ? { from: geographicPlan.rows[0].from, to: geographicPlan.rows[0].to, start: geographicPlan.rows[0].from }
          : null,
        team2: geographicPlan.rows[1]?.from
          ? { from: geographicPlan.rows[1].from, to: geographicPlan.rows[1].to, start: geographicPlan.rows[1].from }
          : null,
        team3: geographicPlan.rows[2]?.from
          ? { from: geographicPlan.rows[2].from, to: geographicPlan.rows[2].to, start: geographicPlan.rows[2].from }
          : null,
      }
    }
    return { team1: full, team2: full, team3: full }
  }, [geographicPlan, routePointIdents])

  const dispatchPlan = useMemo(() => {
    if (!planBundle || !routeMeta || spanTrackRows.length === 0) return null
    const team1Home =
      team1Airport ??
      (planBundle.departure
        ? {
            identifier: planBundle.departure.identifier,
            name: planBundle.departure.name,
            latitude: planBundle.departure.latitude,
            longitude: planBundle.departure.longitude,
          }
        : null)
    const airports = [team1Home, team2Airport, team3Airport]
      .slice(0, teamCount)
      .filter((airport): airport is AirportResult => Boolean(airport))
      .map((airport) => ({
        identifier: airport.identifier,
        latitude: airport.latitude,
        longitude: airport.longitude,
      }))
    if (airports.length < teamCount) return null
    return planDispatchSorties({
      aircraftCount: teamCount,
      routeType: routeMeta.routeType,
      routeNumber: routeMeta.routeNumber,
      waypoints: planBundle.waypoints.map((waypoint) => ({
        ptIdent: waypointPtIdent(waypoint.originalName),
        lat: waypoint.latitude,
        lon: waypoint.longitude,
      })),
      widthTexts,
      spans: spanTrackRows,
      firstOffsetNm,
      stepNm,
      sortieBudgetNm,
      ferryMode,
      refuel: refuelAirport
        ? {
            identifier: refuelAirport.identifier,
            latitude: refuelAirport.latitude,
            longitude: refuelAirport.longitude,
          }
        : null,
      airports,
      sides: Object.fromEntries(
        [
          [team1Airport?.identifier, crewSides.team1],
          [team2Airport?.identifier, crewSides.team2],
          [team3Airport?.identifier, crewSides.team3],
        ].filter((entry): entry is [string, SortieSide | null] => Boolean(entry[0]))
      ),
      assignment:
        assignmentLocked && segmentEdits
          ? (['team1', 'team2', 'team3'] as const).slice(0, teamCount).flatMap((id) => {
              const airport = id === 'team1' ? team1Airport : id === 'team2' ? team2Airport : team3Airport
              const segment = segmentEdits[id]
              if (!airport || !segment?.from || !segment.to) return []
              return [
                {
                  ident: airport.identifier,
                  fromPt: segment.from,
                  toPt: segment.to,
                  refuel: Boolean(refuelAirportForCrew(id, ferryMode, refuelAirport, refuelEdits)),
                },
              ]
            })
          : undefined,
    })
  }, [
    planBundle,
    routeMeta,
    spanTrackRows,
    team1Airport,
    team2Airport,
    team3Airport,
    teamCount,
    widthTexts,
    firstOffsetNm,
    stepNm,
    sortieBudgetNm,
    ferryMode,
    refuelAirport,
    crewSides,
    assignmentLocked,
    segmentEdits,
    refuelEdits,
  ])

  const rememberSides = useCallback((sides: Record<string, SortieSide | null>) => {
    setCrewSides(sides)
  }, [])

  const planComparison = useMemo(() => {
    if (!planBundle) return null
    const points = planBundle.waypoints.map((waypoint) => ({
      ptIdent: waypointPtIdent(waypoint.originalName),
      lat: waypoint.latitude,
      lon: waypoint.longitude,
      g1000Name: waypoint.g1000Name,
    }))
    const fromPlanner =
      plannerResult && 'legs' in plannerResult
        ? plannerResult.legs.map((leg) =>
            leg.leftNm != null && leg.rightNm != null ? { leftNm: leg.leftNm, rightNm: leg.rightNm } : null
          )
        : null
    let legWidths = fromPlanner
    if (!legWidths || legWidths.some((leg) => leg == null)) {
      try {
        legWidths = buildLegWidthSummaries({
          waypoints: points,
          widthTexts: [],
          teams: [],
          spanTrackPlan: spanTrackPlanFromRows(spanTrackRows),
        }).map((leg) =>
          leg.leftNm != null && leg.rightNm != null ? { leftNm: leg.leftNm, rightNm: leg.rightNm } : null
        )
      } catch {
        legWidths = null
      }
    }
    if (!legWidths || legWidths.some((leg) => leg == null)) {
      const resolved = resolvePublishedLegWidths(points, widthTexts)
      if (resolved.status === 'published') {
        legWidths = resolved.legs.map((leg) =>
          leg ? { leftNm: leg.leftNm, rightNm: leg.rightNm } : null
        )
      }
    }
    if (!legWidths || legWidths.some((leg) => leg == null)) return null
    const homes = [team1Airport, team2Airport, team3Airport].filter((airport): airport is AirportResult => Boolean(airport))
    if (homes.length < 2) return null
    const refuel =
      refuelAirport ?? savedTeamPlan?.teams.find((team) => team.refuelStop)?.refuelStop ?? null
    const saved =
      savedTeamPlan && savedTeamPlan.flightPlanId === planId
        ? savedTeamPlan.teams
            .filter((team) => team.departure && team.segmentFrom && team.segmentTo)
            .map((team) => ({
              identifier: team.departure!.identifier,
              from: team.segmentFrom!,
              to: team.segmentTo!,
              refuel: Boolean(team.refuelStop),
              totalNm: team.packedSorties?.reduce((sum, sortie) => sum + sortie.distanceNm, 0),
              sorties: team.packedSorties?.map((sortie) => ({ number: sortie.number, distanceNm: sortie.distanceNm })),
            }))
        : undefined
    const comparison = compareSurveyPlans({
      points,
      legWidths,
      homes,
      refuel,
      saved,
      policy: { firstOffsetNm, stepNm },
      budgetNm: sortieBudgetNm,
      applied:
        dispatchPlan && !('error' in dispatchPlan)
          ? {
              refuelIdent: refuel?.identifier ?? null,
              teams: dispatchPlan.teams.map((team) => ({
                ident: team.ident,
                fromPt: team.fromPt,
                toPt: team.toPt,
                totalNm: team.totalNm,
                sorties: team.sorties.map((sortie) => ({
                  number: sortie.number,
                  distanceNm: sortie.distanceNm,
                })),
              })),
            }
          : null,
      quote: (option) => {
        const airports = [team1Airport, team2Airport, team3Airport]
          .slice(0, teamCount)
          .filter((airport): airport is AirportResult => Boolean(airport))
          .map((airport) => ({
            identifier: airport.identifier,
            latitude: airport.latitude,
            longitude: airport.longitude,
          }))
        if (!routeMeta || airports.length < teamCount) return null
        const priced = planDispatchSorties({
          aircraftCount: teamCount,
          routeType: routeMeta.routeType,
          routeNumber: routeMeta.routeNumber,
          waypoints: points,
          widthTexts,
          spans: spanTrackRows,
          firstOffsetNm,
          stepNm,
          sortieBudgetNm,
          ferryMode: option.ferryMode ?? ferryMode,
          refuel: refuel
            ? { identifier: refuel.identifier, latitude: refuel.latitude, longitude: refuel.longitude }
            : null,
          airports,
          sides: Object.fromEntries(
            [
              [team1Airport?.identifier, crewSides.team1],
              [team2Airport?.identifier, crewSides.team2],
              [team3Airport?.identifier, crewSides.team3],
            ].filter((entry): entry is [string, SortieSide | null] => Boolean(entry[0]))
          ),
          assignment: option.teams.map((team) => ({
            ident: team.identifier,
            fromPt: team.from,
            toPt: team.to,
            refuel: Boolean(team.refuel),
          })),
        })
        if (!priced || 'error' in priced) return null
        const gap = uncoveredLaneMessage({
          points,
          legs: legWidths.filter((leg): leg is { leftNm: number; rightNm: number } => leg != null),
          policy: { firstOffsetNm, stepNm },
          crews: priced.teams,
        })
        if (gap) return null
        const teams = option.teams.map((row) => {
          const packed = priced.teams.find((team) => team.ident.toUpperCase() === row.identifier.toUpperCase())
          if (!packed) return row
          return {
            ...row,
            from: packed.fromPt,
            to: packed.toPt,
            totalNm: packed.totalNm,
            sorties: packed.sorties.map((sortie) => ({
              number: sortie.number,
              distanceNm: sortie.distanceNm,
              overBudget: sortie.distanceNm > sortieBudgetNm + 1e-6,
            })),
          }
        })
        const wingNm = Math.round(teams.reduce((sum, team) => sum + team.totalNm, 0) * 10) / 10
        return {
          teams,
          wingNm,
          allUnder: teams.every((team) => team.sorties.length > 0 && team.sorties.every((sortie) => !sortie.overBudget)),
          refuelStops: teams.filter((team) => team.refuel).length,
        }
      },
    })
    if (!comparison) return null
    if (dispatchPlan && !('error' in dispatchPlan)) {
      const gap = uncoveredLaneMessage({
        points,
        legs: legWidths.filter((leg): leg is { leftNm: number; rightNm: number } => leg != null),
        policy: { firstOffsetNm, stepNm },
        crews: dispatchPlan.teams,
      })
      if (gap) comparison.options = comparison.options.filter((option) => option.id !== 'applied')
    }
    return comparison
  }, [
    planBundle,
    plannerResult,
    spanTrackRows,
    dispatchPlan,
    team1Airport,
    team2Airport,
    team3Airport,
    refuelAirport,
    savedTeamPlan,
    planId,
    firstOffsetNm,
    stepNm,
    sortieBudgetNm,
    teamCount,
    crewSides,
    ferryMode,
    widthTexts,
    routeMeta,
  ])

  const applyComparison = (option: ComparisonOption) => {
    setUseSuggestedSegments(false)
    const crews = [
      { id: 'team1', identifier: team1Airport?.identifier ?? '' },
      { id: 'team2', identifier: team2Airport?.identifier ?? '' },
      { id: 'team3', identifier: team3Airport?.identifier ?? '' },
    ].filter((crew) => crew.identifier)
    const edits = assignmentEditsForOption(option, crews)
    setAssignmentLocked(true)
    setSegmentEdits(edits.segments)
    setRefuelEdits(edits.refuels)
    setAppliedInsert(edits.insertedPoint)
    if (planId) {
      setTeamDispatchUnsaved(planId, true)
      setDispatchUnsaved(true)
    }
    setTeamPlanNotice('Comparison loaded. The sortie list changed and is not saved yet.')
  }

  const saveTeamPlan = async (): Promise<boolean> => {
    if (!planId) return false
    const unsetSides = missingCrewSides(crewSides, offsetCrews.map((crew) => crew.id))
    if (unsetSides.length > 0) {
      setTeamPlanNotice('Choose Inner or Outer for every crew before saving.')
      return false
    }
    if (geographicPlan && !geographicPlan.validation.ok) {
      setTeamPlanNotice(geographicPlan.validation.messages[0] ?? 'Fix the team segments before saving.')
      return false
    }
    const airportOf = (airport: AirportResult | null): TeamPlanAirport | null =>
      airport
        ? {
            identifier: airport.identifier,
            name: airport.name || airport.identifier,
            latitude: airport.latitude,
            longitude: airport.longitude,
            elevation: airport.elevation,
          }
        : null
    if (teamCount >= 2 && (!dispatchPlan || 'error' in dispatchPlan)) {
      setTeamPlanNotice(
        dispatchPlan && 'error' in dispatchPlan ? dispatchPlan.error : 'The sortie list is not ready.'
      )
      return false
    }
    const drafted = draftTeamPlan({
      flightPlanId: planId,
      savedAt: new Date().toISOString(),
      crews: offsetCrews.map((crew) => ({
        id: crew.id as 'team1' | 'team2' | 'team3',
        label: crew.label,
        departure: airportOf(
          crew.id === 'team1' ? team1Airport : crew.id === 'team2' ? team2Airport : team3Airport
        ) ?? (crew.departure
          ? {
              identifier: crew.departure.identifier,
              name: crew.departure.name || crew.departure.identifier,
              latitude: crew.departure.latitude,
              longitude: crew.departure.longitude,
              elevation: crew.departure.elevation,
            }
          : null),
        landing: null,
        refuelStop: airportOf(refuelAirportForCrew(crew.id, ferryMode, refuelAirport, refuelEdits)),
      })),
      sides: Object.fromEntries(offsetCrews.map((crew) => [crew.id, crewSides[crew.id] ?? null])),
      segments: teamSegments,
      firstOffsetNm,
      stepNm,
      sortieBudgetNm,
      spanWidths: spanWidthsFromRows(spanTrackRows) ?? undefined,
    })
    const plan =
      dispatchPlan && !('error' in dispatchPlan) ? attachPackedSorties(drafted, dispatchPlan) : drafted
    plan.routeInsert = appliedInsert
    await db.teamPlans.put(plan)
    setTeamDispatchUnsaved(planId, false)
    setDispatchUnsaved(false)
    setTeamSortiesStale(planId, false)
    clearTeamPlanAwaitingSave(planId)
    setTeamPlanNotice('Team plan saved. Map View uses this plan.')
    return true
  }
  const offsetRouteKind =
    routeMeta?.routeType === 'SR' ? 'sr' : routeMeta?.routeType === 'IR' || routeMeta?.routeType === 'VR' ? 'irvr' : 'other'
  const team2Ready = !needsTeam2 || Boolean(team2Airport)
  const team3Ready = !needsTeam3 || Boolean(team3Airport)
  const refuelReady = ferryMode !== 'staged-refuel' || Boolean(refuelAirport)
  const minWaypoints =
    runMode === 'compare-2-3' || (runMode === 'single' && teamCount === 3) ? 4 : 2
  const canRun =
    planBundle &&
    planBundle.waypoints.length >= minWaypoints &&
    (widthTexts.length > 0 ||
      (spanTrackRows.length > 0 &&
        spanTrackRows.every((row) => Number(row.leftNm) > 0 && Number(row.rightNm) > 0))) &&
    spanTrackRows.length > 0 &&
    !spanTrackErr &&
    !widthBusy &&
    team1Ready &&
    team2Ready &&
    team3Ready &&
    refuelReady

  const applyWizard = (draft: WizardDraft) => {
    const count = draft.aircraftCount ?? 1
    setTeamCount(count)
    setRunMode('single')
    setSortieBudgetNm(draft.sortieBudgetNm)
    setBudgetClampNote(null)
    setFerryMode(draft.ferryMode)
    if (draft.ferryMode === 'return-home') {
      setRefuelAirport(null)
      setRefuelCode('')
    } else {
      setRefuelAirport(draft.refuel)
      setRefuelCode(draft.refuel?.identifier ?? '')
    }
    setRefuelErr(null)
    setFirstOffsetNm(draft.firstOffsetNm)
    setStepNm(draft.stepNm)
    if (draft.spans.length > 0) {
      setSpanTrackRows(
        applySpacingToRows(draft.spans, { firstOffsetNm: draft.firstOffsetNm, stepNm: draft.stepNm })
      )
    }
    const applyTeam = (
      team: WizardDraft['teams']['team1'],
      setCode: (value: string) => void,
      setAirport: (value: AirportResult | null) => void
    ) => {
      setCode(team.airport?.identifier ?? team.code)
      setAirport(team.airport)
    }
    applyTeam(draft.teams.team1, setTeam1Code, setTeam1Airport)
    if (count >= 2) applyTeam(draft.teams.team2, setTeam2Code, setTeam2Airport)
    else {
      setTeam2Code('')
      setTeam2Airport(null)
    }
    if (count >= 3) applyTeam(draft.teams.team3, setTeam3Code, setTeam3Airport)
    else {
      setTeam3Code('')
      setTeam3Airport(null)
    }
    setTeam1Err(null)
    setTeam2Err(null)
    setTeam3Err(null)
    const appliedSides = {
      team1: draft.crewSides.team1,
      team2: count >= 2 ? draft.crewSides.team2 : null,
      team3: count >= 3 ? draft.crewSides.team3 : null,
    }
    setCrewSides(appliedSides)
    if (count === 3 && draft.segments.team1 && draft.segments.team2 && draft.segments.team3) {
      setSegmentEdits({
        team1: draft.segments.team1,
        team2: draft.segments.team2,
        team3: draft.segments.team3,
      })
    } else {
      setSegmentEdits(null)
    }
    setRefuelEdits(refuelEditsForDraft({ ...draft, aircraftCount: count }))
    setAppliedInsert(null)
    setUseSuggestedSegments(false)
    setAssignmentLocked(false)
    setWizardOpen(false)
    if (planId) {
      clearReviewMarks(planId)
      setReviewMarks({})
      setOpenSections([])
    }
    setTeamPlanNotice('Setup answers are on the page. Review them, then press Save.')
  }

  const wizardSource: WizardSource = {
    spans: spanTrackRows,
    firstOffsetNm,
    stepNm,
    sortieBudgetNm,
    ferryMode,
    refuel: refuelAirport,
    aircraftCount: teamCount,
    teams: {
      team1: { code: team1Code, airport: team1Airport },
      team2: { code: team2Code, airport: team2Airport },
      team3: { code: team3Code, airport: team3Airport },
    },
    crewSides,
    segments: {
      team1: savedTeamPlan?.teams.find((team) => team.id === 'team1')?.segmentFrom
        ? {
            from: savedTeamPlan.teams.find((team) => team.id === 'team1')?.segmentFrom ?? '',
            to: savedTeamPlan.teams.find((team) => team.id === 'team1')?.segmentTo ?? '',
          }
        : null,
      team2: savedTeamPlan?.teams.find((team) => team.id === 'team2')?.segmentFrom
        ? {
            from: savedTeamPlan.teams.find((team) => team.id === 'team2')?.segmentFrom ?? '',
            to: savedTeamPlan.teams.find((team) => team.id === 'team2')?.segmentTo ?? '',
          }
        : null,
      team3: savedTeamPlan?.teams.find((team) => team.id === 'team3')?.segmentFrom
        ? {
            from: savedTeamPlan.teams.find((team) => team.id === 'team3')?.segmentFrom ?? '',
            to: savedTeamPlan.teams.find((team) => team.id === 'team3')?.segmentTo ?? '',
          }
        : null,
    },
  }
  const wizardWaypoints =
    planBundle?.waypoints.map((waypoint) => ({
      ptIdent: waypointPtIdent(waypoint.originalName),
      lat: waypoint.latitude,
      lon: waypoint.longitude,
    })) ?? []
  const wizardEntry = wizardWaypoints[0]?.ptIdent ?? null
  const wizardExit = wizardWaypoints[wizardWaypoints.length - 1]?.ptIdent ?? null
  const widthLabels = widthFieldLabels(
    routeCurveSide(wizardWaypoints).innerSide === 'right' ? 'right' : 'left'
  )

  const legsResult =
    compareBundle?.kind === '1-2'
      ? compareBundle.data.oneTeam
      : compareBundle?.kind === '2-3'
        ? compareBundle.data.twoTeams
        : plannerResult

  const reviewSignatures = useMemo(() => {
    const route = (planBundle?.waypoints ?? []).map((waypoint) => waypoint.id).join(',')
    const widths = spanTrackRows.map((row) => `${row.fromPt}:${row.leftNm}/${row.rightNm}`).join('|')
    const tracks = `${firstOffsetNm}/${stepNm}|${spanTrackRows.map((row) => `${row.leftOffsetsText};${row.rightOffsetsText}`).join('|')}`
    const aircraft = `${teamCount}|${runMode}|${team1Airport?.identifier ?? ''}|${team2Airport?.identifier ?? ''}|${team3Airport?.identifier ?? ''}|${team1Code}|${team2Code}|${team3Code}`
    const distance = `${sortieBudgetNm}|${ferryMode}|${refuelAirport?.identifier ?? ''}|${refuelCode}`
    const results = `${dispatchPlan && !('error' in dispatchPlan) ? dispatchPlan.totalLine : ''}|${JSON.stringify(segmentEdits)}|${resultsStale ? 'stale' : 'fresh'}|${plannerResult ? 'planned' : ''}|${compareBundle ? compareBundle.kind : ''}`
    const sides = JSON.stringify(crewSides)
    return { route, widths, tracks, aircraft, distance, results, sides }
  }, [
    planBundle,
    spanTrackRows,
    firstOffsetNm,
    stepNm,
    teamCount,
    runMode,
    team1Airport,
    team2Airport,
    team3Airport,
    team1Code,
    team2Code,
    team3Code,
    sortieBudgetNm,
    ferryMode,
    refuelAirport,
    refuelCode,
    dispatchPlan,
    segmentEdits,
    resultsStale,
    plannerResult,
    compareBundle,
    crewSides,
  ])
  const reviewSignatureKey = JSON.stringify(reviewSignatures)

  useEffect(() => {
    if (!planId) {
      setReviewMarks({})
      return
    }
    markTeamPlanAwaitingSave(planId)
    const fieldsReady = spanTrackRows.length > 0 || Boolean(widthErr)
    setReviewMarks((current) => {
      const stored = readReviewMarks(planId)
      const base = Object.keys(current).length > 0 ? current : stored
      if (!fieldsReady) return base
      const next = reviewMarksAfterChange(base, reviewSignatures)
      if (next !== base) writeReviewMarks(planId, next)
      return next
    })
  }, [planId, reviewSignatureKey, spanTrackRows.length, widthErr])

  const invalidWidth = spanTrackRows.some((row) => !(Number(row.leftNm) > 0) || !(Number(row.rightNm) > 0))
  const sectionProblems: Partial<Record<TeamDispatchSectionId, string>> = {
    widths: widthErr || (spanTrackRows.length > 0 && invalidWidth ? 'Enter a width greater than 0 for every span.' : null) || undefined,
    tracks: spanTrackErr || undefined,
    aircraft:
      (needsTeam2 && !team2Airport && 'Look up Team 2 departure airport.') ||
      (needsTeam3 && !team3Airport && 'Look up Team 3 departure airport.') ||
      (isAnchorPlan && !team1Airport && 'Look up Team 1 departure airport.') ||
      undefined,
    distance:
      ferryMode === 'staged-refuel' && !refuelAirport ? 'Look up the shared refueling airport.' : undefined,
    results:
      (resultsStale && 'Results are out of date. Run again.') ||
      (dispatchPlan && 'error' in dispatchPlan && dispatchPlan.error) ||
      (geographicPlan && !geographicPlan.validation.ok && geographicPlan.validation.messages[0]) ||
      undefined,
  }
  const missingSideIds = missingCrewSides(crewSides, offsetCrews.map((crew) => crew.id))
  const missingSideLabels = missingSideIds.map((id) => offsetCrews.find((crew) => crew.id === id)?.label ?? id)
  if (missingSideLabels.length > 0) sectionProblems.sides = `Choose Inner or Outer for ${missingSideLabels[0]}.`
  const overLimit =
    dispatchPlan && !('error' in dispatchPlan)
      ? dispatchPlan.teams
          .flatMap((team) =>
            team.sorties
              .filter((sortie) => sortie.distanceNm > sortieBudgetNm + 1e-6)
              .map((sortie) => ({ ident: team.ident, number: sortie.number, nm: sortie.distanceNm }))
          )
          .sort((a, b) => b.nm - a.nm)[0] ?? null
      : null
  const coverageMessage =
    dispatchPlan && !('error' in dispatchPlan) && planBundle
      ? uncoveredLaneMessage({
          points: planBundle.waypoints.map((waypoint) => ({ ptIdent: waypointPtIdent(waypoint.originalName) })),
          legs: spanTrackRows.map((row) => ({ leftNm: Number(row.leftNm), rightNm: Number(row.rightNm) })),
          policy: { firstOffsetNm, stepNm },
          crews: dispatchPlan.teams,
        })
      : null
  const blocker = saveBlocker({
    missingSideLabels,
    segmentMessages: geographicPlan && !geographicPlan.validation.ok ? geographicPlan.validation.messages : [],
    overLimit,
    coverageMessage,
  })

  const setSectionOpen = (id: TeamDispatchSectionId, open: boolean) => {
    setOpenSections((prev) => (open ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((item) => item !== id)))
    if (!open && planId && !sectionProblems[id]) {
      const next = markSectionReviewed(reviewMarks, id, reviewSignatures[id])
      writeReviewMarks(planId, next)
      setReviewMarks(next)
    }
  }

  const focusSection = (id: TeamDispatchSectionId) => {
    setOpenSections((prev) => (prev.includes(id) ? prev : [...prev, id]))
    window.setTimeout(() => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const saveAndOpenMap = async () => {
    const saved = await saveTeamPlan()
    if (saved && planId) navigate(teamDispatchMapPath(planId))
  }

  return (
    <div className="app-page-shell overflow-hidden min-h-0">
      {pilotBrief && (
        <SortiePilotCard brief={pilotBrief} isOpen onClose={() => setPilotBrief(null)} />
      )}
      <TeamDispatchWizard
        open={wizardOpen}
        savedPlans={savedPlans ?? []}
        hasPlan={Boolean(planBundle)}
        routeLabel={routeMeta ? `${routeMeta.routeType}${routeMeta.routeNumber}` : planBundle?.plan.name ?? null}
        entry={wizardEntry}
        exit={wizardExit}
        waypointCount={wizardWaypoints.length}
        source={wizardSource}
        sourceKey={`${planId ?? ''}|${spanTrackRows.length}|${team1Airport?.identifier ?? ''}|${team2Airport?.identifier ?? ''}|${team3Airport?.identifier ?? ''}`}
        waypoints={wizardWaypoints}
        routeType={routeMeta?.routeType ?? ''}
        routeNumber={routeMeta?.routeNumber ?? ''}
        widthTexts={widthTexts}
        onRouteLoaded={(id) => setSearchParams({ plan: id })}
        onCancel={() => setWizardOpen(false)}
        onFinish={applyWizard}
        lookupAirport={async (code) => {
          try {
            const result = await apiService.fetchAirport(code)
            if (result.status !== 'found') return { error: airportLookupMessage(result) ?? 'Airport not found.' }
            return { airport: result.airport }
          } catch {
            return { error: FAA_AIRPORT_SERVICE_MESSAGE }
          }
        }}
      />
      <div className="app-panel w-full flex flex-col min-h-0 flex-1 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto p-6 md:p-8 pb-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Team Dispatch</h1>
          <p className="text-sm text-gray-700 mt-2 max-w-4xl">
            Complete the <strong>published MTR</strong> here, then assign aircraft and Mission Pilots when
            they are available. After you design the team effort, export each sortie{' '}
            <strong>.fpl</strong> and <strong>email it to that aircraft&apos;s Mission Pilot</strong> (or
            copy it to an SD card).
          </p>
          {savedTeamPlan && legacySortieNote(savedTeamPlan.teams.find((team) => legacySortieNote(team)) ?? null) && (
            <p className="mt-3 text-sm text-amber-800" role="note">
              {legacySortieNote(savedTeamPlan.teams.find((team) => legacySortieNote(team)) ?? savedTeamPlan.teams[0])}
            </p>
          )}
          <div className="flex flex-wrap items-start justify-between gap-2 mt-2">
            <p className="text-sm text-gray-600 flex-1 min-w-0">
              What-if sortie planner for wing route surveys. See{' '}
              <code className="text-xs bg-gray-100 px-1 rounded">docs/COORDINATOR_SURVEY_CONSOLE.md</code>.
            </p>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="text-sm font-medium text-cap-ultramarine hover:underline shrink-0"
            >
              Reopen setup questions
            </button>
            <GuidedHint
              hintId={HINT_COORD_ENROUTE_RECOVERY}
              stepNumber={1}
              title="En-route recovery & multi-aircraft"
              body={
                <>
                  Coordinator picks <strong>one shared refuel airport</strong> near the MTR for all aircraft.{' '}
                  <strong>2 teams:</strong> sortie 1 surveys one side and lands at refuel; the <strong>final sortie</strong>{' '}
                  returns home — merged with remaining survey legs when within the NM budget.{' '}
                  <strong>1 team</strong> is one aircraft. Each sortie lists its side; fly the side shown. A later
                  sortie is already in flying order; load it and fly it as listed. Do not invert the flight plan on
                  the G1000. Each sortie is its own .fpl file.
                  <br />
                  <br />
                  <strong>Multi-aircraft:</strong> pilots deconflict — radio contact and <strong>staggered
                  takeoffs</strong>. Announce when you enter and exit each lane, giving your position by waypoint name
                  (for example, entering B1O).
                  <br />
                  <br />
                  <strong>G1000 sortie 2:</strong> Sortie 2 is already in flying order; load it and fly it as listed.
                  Do not invert the flight plan on the G1000. Sortie 2 is its own .fpl file.
                </>
              }
              isSeen={isSeen(HINT_COORD_ENROUTE_RECOVERY)}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
        </header>

        <CoordinatorConsoleGuide />

        {!planId && (
          <CoordinatorRouteLoadForm
            savedPlans={savedPlans ?? []}
            onLoaded={(id) => setSearchParams({ plan: id })}
          />
        )}

        {loading && <p className="text-gray-600 text-sm">Loading flight plan…</p>}

        {planId && planBundle === null && (
          <p className="text-cap-pimento text-sm" role="alert">
            Flight plan not found.
          </p>
        )}

        {planBundle && (
          <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-gray-500">Route</dt>
                  <dd className="font-medium text-gray-900">
                    {routeMeta ? `${routeMeta.routeType}${routeMeta.routeNumber}` : planBundle.plan.name}
                    {wizardEntry && wizardExit ? ` · ${wizardEntry} to ${wizardExit}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Aircraft</dt>
                  <dd className="font-medium text-gray-900">{teamCount}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Airports</dt>
                  <dd className="font-medium text-gray-900">
                    {[team1Airport?.identifier, teamCount >= 2 ? team2Airport?.identifier : null, teamCount >= 3 ? team3Airport?.identifier : null]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Distance limit</dt>
                  <dd className="font-medium text-gray-900">
                    {sortieBudgetNm} NM · {formatSortieEndurance(sortieBudgetNm)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Landing</dt>
                  <dd className="font-medium text-gray-900">
                    {ferryMode === 'staged-refuel'
                      ? `Shared refuel${refuelAirport ? ` at ${refuelAirport.identifier}` : ''}`
                      : 'Return to home airport'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Track spacing</dt>
                  <dd className="font-medium text-gray-900">
                    First {firstOffsetNm} NM, then every {stepNm} NM
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="text-sm font-medium text-cap-ultramarine hover:underline shrink-0"
              >
                Reopen setup questions
              </button>
            </div>
          </section>
        )}

        {planBundle && (
          <div className="space-y-3">
            <ReviewedSection
              id="route"
              ref={(node) => { sectionRefs.current.route = node }}
              title="Route"
              reviewed={Boolean(reviewMarks.route)}
              problem={sectionProblems.route ?? null}
              open={openSections.includes('route')}
              onOpenChange={(open) => setSectionOpen('route', open)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Scenario</h2>
                <button
                  type="button"
                  onClick={() => setSearchParams({})}
                  className="text-sm font-medium text-cap-ultramarine hover:underline"
                >
                  Load a different route
                </button>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500">Flight plan</dt>
                  <dd className="font-medium text-gray-900">{planBundle.plan.name}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Route</dt>
                  <dd className="font-medium text-gray-900">
                    {routeMeta ? `${routeMeta.routeType}${routeMeta.routeNumber}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Waypoints</dt>
                  <dd className="font-medium text-gray-900">{planBundle.waypoints.length}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Assignment model</dt>
                  <dd className="font-medium text-gray-900">
                    {runMode === 'compare-1-2'
                      ? 'Compare: 1 team sequential vs 2 opposite-side'
                      : runMode === 'compare-2-3'
                        ? 'Compare: 2 opposite-side vs 3 geographic'
                        : teamCount === 1
                          ? 'Single team, both sides sequential'
                          : teamCount === 2
                            ? 'Opposite-side (inner / outer)'
                            : 'Geographic split (3 teams)'}
                  </dd>
                </div>
              </dl>
              {isAnchorPlan && (
                <p className="mt-3 text-sm text-gray-700 rounded-lg border border-cap-ultramarine/25 bg-slate-50 px-3 py-2">
                  <strong>Coordinator survey anchor</strong> — waypoints only on this flight plan. Look up all team
                  departures and refuel below.
                </p>
              )}
              <ul className="mt-4 font-mono text-xs text-gray-700 space-y-0.5 max-h-32 overflow-auto">
                {planBundle.waypoints.map((w) => (
                  <li key={w.id}>
                    {w.sequence + 1}. {w.originalName}
                  </li>
                ))}
              </ul>

              <FlightPlanContentPackCard waypoints={planBundle.waypoints} />
            </ReviewedSection>
            <ReviewedSection
              id="widths"
              ref={(node) => { sectionRefs.current.widths = node }}
              title="Corridor widths"
              reviewed={Boolean(reviewMarks.widths)}
              problem={sectionProblems.widths ?? null}
              open={openSections.includes('widths')}
              onOpenChange={(open) => setSectionOpen('widths', open)}
            >
              <CorridorTrackPlanEditor
                part="widths"
                spanTrackRows={spanTrackRows}
                onSpanTrackRowsChange={(rows) => {
                  setSpanTrackRows(rows)
                  if (rows.some((row) => Number(row.leftNm) > 0 && Number(row.rightNm) > 0)) setWidthErr(null)
                }}
                firstOffsetNm={firstOffsetNm}
                stepNm={stepNm}
                onFirstOffsetNmChange={setFirstOffsetNm}
                onStepNmChange={setStepNm}
                widthBusy={widthBusy}
                widthErr={widthErr}
                spanTrackErr={spanTrackErr}
                isSeen={isSeen}
                markSeen={markSeen}
                widthLabels={widthLabels}
                widthHelp={WIDTH_SIDE_HELP}
                legPreview={legPreview ?? undefined}
              />
            </ReviewedSection>
            <ReviewedSection
              id="tracks"
              ref={(node) => { sectionRefs.current.tracks = node }}
              title="Survey tracks"
              reviewed={Boolean(reviewMarks.tracks)}
              problem={sectionProblems.tracks ?? null}
              open={openSections.includes('tracks')}
              onOpenChange={(open) => setSectionOpen('tracks', open)}
            >
              <CorridorTrackPlanEditor
                part="tracks"
                spanTrackRows={spanTrackRows}
                onSpanTrackRowsChange={setSpanTrackRows}
                firstOffsetNm={firstOffsetNm}
                stepNm={stepNm}
                onFirstOffsetNmChange={setFirstOffsetNm}
                onStepNmChange={setStepNm}
                widthBusy={widthBusy}
                widthErr={widthErr}
                spanTrackErr={spanTrackErr}
                isSeen={isSeen}
                markSeen={markSeen}
                widthLabels={widthLabels}
                widthHelp={WIDTH_SIDE_HELP}
                legPreview={legPreview ?? undefined}
              />
            </ReviewedSection>
            <ReviewedSection
              id="aircraft"
              ref={(node) => { sectionRefs.current.aircraft = node }}
              title="Aircraft and departures"
              reviewed={Boolean(reviewMarks.aircraft)}
              problem={sectionProblems.aircraft ?? null}
              open={openSections.includes('aircraft')}
              onOpenChange={(open) => setSectionOpen('aircraft', open)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Teams &amp; parameters</h2>
                <GuidedHint
                  hintId={HINT_COORD_TEAMS_FLOW}
                  stepNumber={5}
                  title="Staffing and run planner"
                  body={
                    <>
                      After corridor tracks are set in <strong>Scenario</strong>, choose planner mode, team
                      departures, sortie budget, and ferry policy here. Changing lane spacing in Scenario clears
                      results — run Compare or Run planner again to refresh sortie counts.
                      <br />
                      <br />
                      When the effort is designed, email each sortie <strong>.fpl</strong> to that aircraft&apos;s
                      Mission Pilot.
                      <br />
                      <br />
                      All compare modes use the <strong>same</strong> track plan from Scenario so staffing comparisons
                      stay fair.
                    </>
                  }
                  isSeen={isSeen(HINT_COORD_TEAMS_FLOW)}
                  onDismiss={markSeen}
                  surface="light"
                />
              </div>

              <fieldset className="mb-5">
                <legend className="text-sm font-medium text-gray-700 mb-2">Planner mode</legend>
                <div className="flex flex-col gap-3 text-sm">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="run-mode"
                      checked={runMode === 'single'}
                      onChange={() => setRunMode('single')}
                    />
                    Single scenario
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="run-mode"
                      checked={runMode === 'compare-1-2'}
                      onChange={() => setRunMode('compare-1-2')}
                    />
                    Compare 1 vs 2 teams
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="run-mode"
                      checked={runMode === 'compare-2-3'}
                      onChange={() => setRunMode('compare-2-3')}
                    />
                    Compare 2 vs 3 teams
                  </label>
                </div>
              </fieldset>

              {runMode === 'single' && (
                <fieldset className="mb-5">
                  <legend className="text-sm font-medium text-gray-700 mb-2">Aircraft count</legend>
                  <div className="flex flex-col gap-3 text-sm">
                    <label className="inline-flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="team-count"
                        className="mt-1"
                        checked={teamCount === 1}
                        onChange={() => {
                          setTeamCount(1)
                          setCrewSides((current) => ({ ...current, team2: null, team3: null }))
                        }}
                      />
                      <span>
                        1 team — one aircraft. Each sortie lists its side; fly the side shown.
                      </span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="team-count"
                        checked={teamCount === 2}
                        onChange={() => {
                          setTeamCount(2)
                          setCrewSides((current) => ({ ...current, team3: null }))
                        }}
                      />
                      2 teams (each stays on its side)
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="team-count"
                        checked={teamCount === 3}
                        onChange={() => {
                          setTeamCount(3)
                          setCrewSides((current) => ({ ...current, team3: null }))
                        }}
                      />
                      3 teams (geographic split)
                    </label>
                  </div>
                  {teamCount === 3 && (
                    <p className="text-sm text-gray-600 mt-2">
                      Route is divided into three contiguous segments. Each team flies <strong>both sides</strong> of
                      its segment from its own departure (~{sortieBudgetNm} NM, {formatSortieEndurance(sortieBudgetNm)}). Recommended:
                      each segment flies the opposite side from the segments next to it (e.g. segment 1 Inner, segment 2
                      Outer, segment 3 Inner). This is a recommendation, not guaranteed separation; pilots still
                      deconflict.
                    </p>
                  )}
                </fieldset>
              )}

              {runMode === 'compare-1-2' && (
                <p className="text-sm text-gray-600 mb-5">
                  Runs two what-if scenarios with the same budget: <strong>1 team</strong> flies the full corridor
                  (inner then outer, sequential sorties from Team 1&apos;s departure); <strong>2 teams</strong> work
                  neighboring sides at the same time, one from each departure.
                </p>
              )}

              {runMode === 'compare-2-3' && (
                <p className="text-sm text-gray-600 mb-5">
                  Runs two full-corridor scenarios: <strong>2 teams</strong> opposite-side (inner / outer) vs{' '}
                  <strong>3 teams</strong> geographic split with optimized segment boundaries and airport assignments.
                  Look up all three departures before running.
                </p>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5 text-sm">
                <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                  <p className="font-medium text-gray-900 mb-1">
                    {runMode === 'compare-2-3' || teamCount === 3
                      ? 'Team 1 — departure'
                      : runMode === 'compare-1-2' || teamCount === 1
                        ? 'Team 1 — both sides, sequential'
                        : 'Team 1 — inner'}
                  </p>
                  {isAnchorPlan ? (
                    <>
                      <div className="flex gap-2 min-w-0">
                        <input
                          ref={team1CodeInputRef}
                          type="text"
                          value={team1Code}
                          onChange={(e) => {
                            setTeam1Code(e.target.value.toUpperCase())
                            setTeam1Airport(null)
                            setTeam1Err(null)
                          }}
                          onKeyDown={(e) =>
                            onAirportCodeInputKeyDown(
                              e,
                              team1LookupRef.current,
                              runTeam1Lookup,
                              team1CanLookup
                            )
                          }
                          placeholder="e.g. KABQ"
                          className={AIRPORT_CODE_INPUT_CLASS}
                          aria-label="Team 1 departure airport code"
                        />
                        <button
                          ref={team1LookupRef}
                          type="button"
                          onClick={runTeam1Lookup}
                          aria-disabled={!team1CanLookup}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              if (team1CanLookup) runTeam1Lookup()
                            }
                          }}
                          className={`${AIRPORT_LOOKUP_BTN_CLASS}${team1CanLookup ? '' : ` ${AIRPORT_LOOKUP_BTN_IDLE_CLASS}`}`}
                        >
                          {team1Busy ? '…' : 'Look up'}
                        </button>
                      </div>
                      {team1Airport && (
                        <p className={AIRPORT_LOOKUP_RESULT_CLASS}>
                          {team1Airport.identifier} — {team1Airport.name}
                        </p>
                      )}
                      {team1Err && (
                        <p className="text-cap-pimento text-xs mt-2" role="alert">
                          {team1Err}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-gray-600">
                        Departure:{' '}
                        <span className="font-medium text-gray-900">
                          {planBundle.departure?.identifier ?? '— (set on flight plan)'}
                        </span>
                      </p>
                      {!planBundle.departure && (
                        <p className="text-cap-pimento text-xs mt-2">
                          Set a departure airport on the flight plan.
                        </p>
                      )}
                    </>
                  )}
                </div>

                {needsTeam2 && (
                  <div className="rounded-lg border border-gray-200 bg-slate-50 p-4">
                    <p className="font-medium text-gray-900 mb-2">
                      {runMode === 'compare-2-3' || teamCount === 3
                        ? 'Team 2 — departure'
                        : 'Team 2 — outer'}
                    </p>
                    <div className="flex gap-2 min-w-0">
                      <input
                        type="text"
                        value={team2Code}
                        onChange={(e) => {
                          setTeam2Code(e.target.value.toUpperCase())
                          setTeam2Airport(null)
                          setTeam2Err(null)
                        }}
                        onKeyDown={(e) =>
                          onAirportCodeInputKeyDown(
                            e,
                            team2LookupRef.current,
                            runTeam2Lookup,
                            team2CanLookup
                          )
                        }
                        placeholder="e.g. KROW"
                        className={AIRPORT_CODE_INPUT_CLASS}
                        aria-label="Team 2 departure airport code"
                      />
                      <button
                        ref={team2LookupRef}
                        type="button"
                        onClick={runTeam2Lookup}
                        aria-disabled={!team2CanLookup}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            if (team2CanLookup) runTeam2Lookup()
                            return
                          }
                          if (e.key === 'Tab' && !e.shiftKey && needsTeam3) {
                            e.preventDefault()
                            team3CodeInputRef.current?.focus()
                          }
                        }}
                        className={`${AIRPORT_LOOKUP_BTN_CLASS}${team2CanLookup ? '' : ` ${AIRPORT_LOOKUP_BTN_IDLE_CLASS}`}`}
                      >
                        {team2Busy ? '…' : 'Look up'}
                      </button>
                    </div>
                    {team2Airport && (
                      <p className={AIRPORT_LOOKUP_RESULT_CLASS}>
                        {team2Airport.identifier} — {team2Airport.name}
                      </p>
                    )}
                    {team2Err && (
                      <p className="text-cap-pimento text-xs mt-2" role="alert">
                        {team2Err}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      {runMode === 'compare-2-3' || teamCount === 3
                        ? 'Look up a second departure along or near the route.'
                        : 'Pre-filled from flight plan destination when it differs from departure.'}
                    </p>
                  </div>
                )}

                {needsTeam3 && (
                  <div className="rounded-lg border border-gray-200 bg-slate-50 p-4 xl:col-span-2">
                    <p className="font-medium text-gray-900 mb-2">Team 3 — departure</p>
                    <div className="flex gap-2 min-w-0">
                      <input
                        ref={team3CodeInputRef}
                        type="text"
                        value={team3Code}
                        onChange={(e) => {
                          setTeam3Code(e.target.value.toUpperCase())
                          setTeam3Airport(null)
                          setTeam3Err(null)
                        }}
                        onKeyDown={(e) =>
                          onAirportCodeInputKeyDown(
                            e,
                            team3LookupRef.current,
                            runTeam3Lookup,
                            team3CanLookup
                          )
                        }
                        placeholder="e.g. KROW"
                        className={AIRPORT_CODE_INPUT_CLASS}
                        aria-label="Team 3 departure airport code"
                      />
                      <button
                        ref={team3LookupRef}
                        type="button"
                        onClick={runTeam3Lookup}
                        aria-disabled={!team3CanLookup}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            if (team3CanLookup) runTeam3Lookup()
                          }
                        }}
                        className={`${AIRPORT_LOOKUP_BTN_CLASS}${team3CanLookup ? '' : ` ${AIRPORT_LOOKUP_BTN_IDLE_CLASS}`}`}
                      >
                        {team3Busy ? '…' : 'Look up'}
                      </button>
                    </div>
                    {team3Airport && (
                      <p className={AIRPORT_LOOKUP_RESULT_CLASS}>
                        {team3Airport.identifier} — {team3Airport.name}
                      </p>
                    )}
                    {team3Err && (
                      <p className="text-cap-pimento text-xs mt-2" role="alert">
                        {team3Err}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </ReviewedSection>
            <ReviewedSection
              id="distance"
              ref={(node) => { sectionRefs.current.distance = node }}
              title="Distance limit and landing"
              reviewed={Boolean(reviewMarks.distance)}
              problem={sectionProblems.distance ?? null}
              open={openSections.includes('distance')}
              onOpenChange={(open) => setSectionOpen('distance', open)}
            >
              <div className="max-w-xs">
                <label htmlFor="sortie-budget" className="block text-sm font-medium text-gray-700 mb-1">
                  Sortie distance budget (NM)
                </label>
                <input
                  id="sortie-budget"
                  type="number"
                  min={SORTIE_BUDGET_MIN_NM}
                  max={SORTIE_BUDGET_MAX_NM}
                  step={SORTIE_BUDGET_STEP_NM}
                  value={sortieBudgetNm}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    setSortieBudgetNm(Number.isFinite(next) ? next : SORTIE_BUDGET_DEFAULT_NM)
                    setBudgetClampNote(null)
                  }}
                  onBlur={(e) => setSortieBudgetNm(readSortieBudgetEntry(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <p className="mt-1 text-sm text-gray-600">{formatSortieEndurance(sortieBudgetNm)}</p>
                {budgetClampNote && (
                  <p className="mt-1 text-sm text-gray-700" role="status">
                    {budgetClampNote}
                  </p>
                )}
              </div>

              <fieldset className="mt-5">
                <legend className="text-sm font-medium text-gray-700 mb-2">Ferry / recovery model</legend>
                <div className="flex flex-col gap-2 text-sm mb-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="ferry-mode"
                      checked={ferryMode === 'return-home'}
                      onChange={() => setFerryMode('return-home')}
                    />
                    Return home after each sortie
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="ferry-mode"
                      checked={ferryMode === 'staged-refuel'}
                      onChange={() => setFerryMode('staged-refuel')}
                    />
                    Staged refuel (finish survey before weather)
                  </label>
                </div>
                {ferryMode === 'staged-refuel' && (
                  <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-slate-50 p-4 max-w-2xl">
                    <p className="font-medium text-gray-900 mb-2">
                      Refueling airport (shared)
                    </p>
                    <p className="text-xs text-gray-600 mb-3">
                      With <strong>2 teams</strong>, each crew stays on the side of the centerline it picks for every
                      sortie and lands here. The other crew flies the other side. The <strong>final sortie</strong>{' '}
                      returns home — combined with any remaining survey legs when total NM fits the budget, otherwise
                      a separate return-only sortie. With{' '}
                      <strong>1 team</strong>, sortie 1 flies the chosen side and lands here. Sortie 2 is already in
                      flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Sortie 2
                      is its own .fpl file.
                    </p>
                    <div className="flex gap-2 min-w-0">
                      <input
                        type="text"
                        value={refuelCode}
                        onChange={(e) => {
                          setRefuelCode(e.target.value.toUpperCase())
                          setRefuelAirport(null)
                          setRefuelErr(null)
                        }}
                        onKeyDown={(e) =>
                          onAirportCodeInputKeyDown(
                            e,
                            refuelLookupRef.current,
                            runRefuelLookup,
                            refuelCanLookup
                          )
                        }
                        placeholder="e.g. KCAO"
                        className={AIRPORT_CODE_INPUT_CLASS}
                        aria-label="Refueling airport code"
                      />
                      <button
                        ref={refuelLookupRef}
                        type="button"
                        onClick={runRefuelLookup}
                        aria-disabled={!refuelCanLookup}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            if (refuelCanLookup) runRefuelLookup()
                          }
                        }}
                        className={`${AIRPORT_LOOKUP_BTN_CLASS}${refuelCanLookup ? '' : ` ${AIRPORT_LOOKUP_BTN_IDLE_CLASS}`}`}
                      >
                        {refuelBusy ? '…' : 'Look up'}
                      </button>
                    </div>
                    {refuelAirport && (
                      <p className={AIRPORT_LOOKUP_RESULT_CLASS}>
                        {refuelAirport.identifier} — {refuelAirport.name}
                      </p>
                    )}
                    {refuelErr && (
                      <p className="text-cap-pimento text-xs mt-2" role="alert">
                        {refuelErr}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Pre-filled from flight plan destination when it differs from departure.
                    </p>
                  </div>
                  <PilotRefuelGuidanceBox className="max-w-2xl" />
                  </div>
                )}
              </fieldset>
            </ReviewedSection>
            <ReviewedSection
              id="results"
              ref={(node) => { sectionRefs.current.results = node }}
              title="Planner results and split"
              reviewed={Boolean(reviewMarks.results)}
              problem={sectionProblems.results ?? null}
              open={openSections.includes('results')}
              onOpenChange={(open) => setSectionOpen('results', open)}
            >
              {planBundle.waypoints.length < 2 && (
                <p className="text-sm text-gray-600 mt-3">
                  Need at least two resolved waypoints in the flight plan before running the planner.
                </p>
              )}
              {planBundle.waypoints.length >= 2 &&
                !widthBusy &&
                widthTexts.length === 0 &&
                !widthErr &&
                spanTrackRows.every((row) => !(Number(row.leftNm) > 0) || !(Number(row.rightNm) > 0)) && (
                <p className="text-sm text-gray-600 mt-3">
                  Load NASR corridor width in Scenario before running the planner.
                </p>
              )}
              {spanTrackErr && spanTrackRows.length > 0 && (
                <p className="text-sm text-cap-pimento mt-3" role="alert">
                  Fix corridor track plan in Scenario: {spanTrackErr}
                </p>
              )}
              {planBundle.waypoints.length >= 2 && widthErr && (
                <p className="text-sm text-gray-600 mt-3">
                  Fix the width error above, or confirm{' '}
                  <code className="text-xs bg-gray-100 px-1 rounded">npm run dev:all</code> is running (Node API on port
                  3001 proxies via Vite).
                </p>
              )}
              {(runMode === 'compare-2-3' ||
                (runMode === 'single' && teamCount === 3)) &&
                planBundle.waypoints.length < 4 && (
                <p className="text-sm text-gray-600 mt-3">
                  Three aircraft need at least 3 route segments (4 points).
                </p>
              )}
              {ferryMode === 'staged-refuel' && !refuelAirport && (
                <p className="text-sm text-gray-600 mt-3">Look up the shared refueling airport before running.</p>
              )}
              {isAnchorPlan && !team1Airport && (
                <p className="text-sm text-gray-600 mt-3">Look up Team 1 departure airport before running.</p>
              )}
              {needsTeam2 && !team2Airport && (
                <p className="text-sm text-gray-600 mt-3">Look up Team 2 departure airport before running.</p>
              )}
              {needsTeam3 && !team3Airport && (
                <p className="text-sm text-gray-600 mt-3">Look up Team 3 departure airport before running.</p>
              )}
              <button
                type="button"
                onClick={runPlanner}
                disabled={!canRun}
                className="mt-4 px-4 py-2.5 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
              >
                {widthBusy
                  ? 'Loading width data…'
                  : spanTrackErr
                    ? 'Fix corridor tracks in Scenario'
                    : runMode === 'compare-1-2'
                    ? 'Compare 1 vs 2 teams'
                    : runMode === 'compare-2-3'
                      ? 'Compare 2 vs 3 teams'
                      : 'Run planner'}
              </button>

            <SortieFragmentExportCard
              waypoints={planBundle.waypoints}
              teamDeparture={
                team1Airport ? airportResultToRecord(team1Airport) : planBundle.departure ?? null
              }
              routeLabel={
                routeMeta
                  ? `${routeMeta.routeType}${routeMeta.routeNumber}`
                  : planBundle.plan.name.replace(/\s+/g, '')
              }
              routeMeta={routeMeta}
              widthTexts={widthTexts}
              legWidths={
                legPreview
                  ? legPreview.map((leg) =>
                      leg.leftNm != null && leg.rightNm != null
                        ? { leftNm: leg.leftNm, rightNm: leg.rightNm }
                        : null
                    )
                  : null
              }
              departureMissingMessage={
                isAnchorPlan
                  ? 'Look up Team 1 departure airport above before exporting a sortie fragment.'
                  : 'Set a departure airport on this flight plan, or look up Team 1, before exporting a sortie fragment.'
              }
              onPilotBrief={setPilotBrief}
              trackPolicy={{ firstOffsetNm, stepNm }}
            />
              {geographicPlan && !geographicPlan.validation.ok && (
                  <div role="alert">
                    {geographicPlan.validation.messages.map((message) => (
                      <p key={message} className="text-sm text-red-700">
                        {message}
                      </p>
                    ))}
                  </div>
                )}
              {savedTeamPlan && legacySortieNote(savedTeamPlan.teams[0]) && (
                <p className="mb-4 text-sm text-amber-800" role="note">
                  {legacySortieNote(savedTeamPlan.teams.find((team) => legacySortieNote(team)) ?? savedTeamPlan.teams[0])}
                </p>
              )}
              {dispatchPlan && !('error' in dispatchPlan) && (
                <div className="mb-4 text-sm text-gray-800">
                  <p>{dispatchPlan.totalLine}</p>
                  {neighborSideWarning(
                    dispatchPlan.teams.map((team) => ({
                      label: team.ident,
                      ident: team.ident,
                      side: team.sorties.find((sortie) => sortie.side === 'inner' || sortie.side === 'outer')?.side ?? null,
                      from: team.fromPt,
                      to: team.toPt,
                    }))
                  ) && (
                    <p className="mt-1">
                      {neighborSideWarning(
                        dispatchPlan.teams.map((team) => ({
                          label: team.ident,
                          ident: team.ident,
                          side: team.sorties.find((sortie) => sortie.side === 'inner' || sortie.side === 'outer')?.side ?? null,
                          from: team.fromPt,
                          to: team.toPt,
                        }))
                      )}
                    </p>
                  )}
                  <ul className="mt-1 space-y-1">
                    {dispatchPlan.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-col gap-1">
                    {dispatchPlan.teams.flatMap((team) =>
                      team.sorties.map((sortie) =>
                        sortie.returnHomeOnly || sortie.offsetsNm.length === 0 ? (
                          <span key={`${team.ident}-${sortie.number}`} className="text-xs text-gray-500">
                            {team.ident} Sortie {sortie.number} — Ferry only, no survey file
                          </span>
                        ) : (
                          <button
                            key={`${team.ident}-${sortie.number}`}
                            type="button"
                            onClick={() => exportDispatchSortie(team.ident, sortie)}
                            className="text-xs font-medium text-cap-ultramarine hover:underline text-left"
                          >
                            {packedDownloadLabel(team.ident, sortie, sortieExportCtx?.points ?? [])}
                          </button>
                        )
                      )
                    )}
                  </div>
                </div>
              )}
              {dispatchPlan && 'error' in dispatchPlan && (
                <p className="mb-4 text-sm text-red-700" role="alert">
                  {dispatchPlan.error}
                </p>
              )}
              {planComparison && planComparison.options.length > 0 && (
                <ComparePlansPanel
                  options={planComparison.options}
                  spacingNote={planComparison.spacingNote}
                  onApply={applyComparison}
                />
              )}
            {resultsStale && !compareBundle && !plannerResult && (
              <section className="lg:col-span-2 xl:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-gray-900">Results are out of date — Run again</p>
                <button
                  type="button"
                  onClick={runPlanner}
                  disabled={!canRun}
                  className="mt-2 px-3 py-2 text-sm font-medium rounded-lg bg-cap-ultramarine text-white disabled:opacity-50"
                >
                  Run again
                </button>
              </section>
            )}

            {(compareBundle || plannerResult) && legsResult && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Results</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Sortie plan from Scenario corridor tracks and team parameters. Centerline{' '}
                  {legsResult.totalCenterlineNm} NM · Budget {legsResult.sortieBudgetNm} NM
                  {'ferryMode' in legsResult && legsResult.ferryMode === 'staged-refuel' && refuelAirport ? (
                    <>
                      {' '}
                      · Staged refuel at <strong>{refuelAirport.identifier}</strong>
                    </>
                  ) : null}
                </p>

                {geographicPlan && (
                    <div className="mb-8 rounded-lg border-2 border-cap-ultramarine/40 bg-slate-50 p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-semibold text-gray-900">Geographic assignment</h3>
                        <button
                          type="button"
                          disabled={
                            !(
                              plannerResult &&
                              'segmentAssignments' in plannerResult &&
                              plannerResult.segmentAssignments?.length
                            )
                          }
                          onClick={() => {
                            setUseSuggestedSegments(true)
                            setSegmentEdits(null)
                            setRefuelEdits(null)
                            setAppliedInsert(null)
                          }}
                          className="rounded-lg border border-cap-ultramarine px-3 py-1.5 text-sm font-medium text-cap-ultramarine disabled:opacity-50"
                        >
                          Reset to suggested split
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 mb-3">
                        {useSuggestedSegments && plannerResult && 'geographicSplits' in plannerResult ? (
                          <>
                            Suggested split at{' '}
                            <strong>
                              {plannerResult.geographicSplits
                                ?.map((split: { boundaryPt: string }) => split.boundaryPt)
                                .join(' and ') ?? '—'}
                            </strong>
                            .{' '}
                          </>
                        ) : (
                          <>Edited segments.{' '}
                          </>
                        )}
                        Saving writes the sortie list below. The miles include ferry.
                      </p>
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-300 text-left text-gray-600">
                            <th className="py-2 pr-3">Team</th>
                            <th className="py-2 pr-3">From</th>
                            <th className="py-2 pr-3">To</th>
                            <th className="py-2 pr-3">Refuel stop</th>
                            <th className="py-2 pr-3">Sorties</th>
                            <th className="py-2">NM, includes ferry</th>
                          </tr>
                        </thead>
                        <tbody>
                          {geographicPlan.rows.map((row) => (
                            <tr key={row.id} className="border-b border-gray-200 align-top">
                              <td className="py-2 pr-3 font-medium">{row.label}</td>
                              <td className="py-2 pr-3">
                                <select
                                  aria-label={`${row.label} from`}
                                  className="rounded border border-gray-300 bg-white px-2 py-1 font-mono"
                                  value={row.from}
                                  onChange={(event) => {
                                    const value = event.target.value
                                    setUseSuggestedSegments(false)
                                    setAssignmentLocked(true)
                                    setSegmentEdits((current) => {
                                      const base = Object.fromEntries(
                                        geographicPlan.rows.map((item) => [item.id, { from: item.from, to: item.to }])
                                      )
                                      return {
                                        ...(current ?? base),
                                        [row.id]: { ...(current?.[row.id] ?? base[row.id]), from: value },
                                      }
                                    })
                                  }}
                                >
                                  <option value="">—</option>
                                  {routePointIdents.map((ident) => (
                                    <option key={`${row.id}-from-${ident}`} value={ident}>
                                      {ident}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <select
                                  aria-label={`${row.label} to`}
                                  className="rounded border border-gray-300 bg-white px-2 py-1 font-mono"
                                  value={row.to}
                                  onChange={(event) => {
                                    const value = event.target.value
                                    setUseSuggestedSegments(false)
                                    setAssignmentLocked(true)
                                    setSegmentEdits((current) => {
                                      const base = Object.fromEntries(
                                        geographicPlan.rows.map((item) => [item.id, { from: item.from, to: item.to }])
                                      )
                                      return {
                                        ...(current ?? base),
                                        [row.id]: { ...(current?.[row.id] ?? base[row.id]), to: value },
                                      }
                                    })
                                  }}
                                >
                                  <option value="">—</option>
                                  {routePointIdents.map((ident) => (
                                    <option key={`${row.id}-to-${ident}`} value={ident}>
                                      {ident}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <RefuelStopField
                                  value={row.refuel}
                                  shared={refuelAirport}
                                  onChange={(airport) => {
                                    setAssignmentLocked(true)
                                    setRefuelEdits((current) => ({ ...(current ?? {}), [row.id]: airport }))
                                  }}
                                />
                              </td>
                              <td className="py-2 pr-3 tabular-nums">
                                {dispatchPlan && !('error' in dispatchPlan)
                                  ? (dispatchPlan.teams.find(
                                      (team) => team.ident.toUpperCase() === row.label.toUpperCase()
                                    )?.sortieCount ?? '—')
                                  : (row.day?.sorties.length ?? '—')}
                              </td>
                              <td className="py-2 tabular-nums">
                                {dispatchPlan && !('error' in dispatchPlan)
                                  ? (dispatchPlan.teams.find(
                                      (team) => team.ident.toUpperCase() === row.label.toUpperCase()
                                    )?.totalNm ?? '—')
                                  : (row.day?.totalNm ?? '—')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!geographicPlan.validation.ok && (
                        <div className="mt-3" role="alert">
                          {geographicPlan.validation.messages.map((message) => (
                            <p key={message} className="text-sm text-red-700">
                              {message}
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 text-sm text-gray-800">
                        {dispatchPlan && !('error' in dispatchPlan) ? (
                          dispatchPlan.totalLine
                        ) : (
                          <>
                            Wing total <strong>{geographicPlan.totalWingNm}</strong> NM · {geographicPlan.totalSorties}{' '}
                            sorties
                          </>
                        )}
                      </p>
                    </div>
                  )}

                {compareBundle?.kind === '1-2' && (
                  <div className="mb-8 rounded-lg border-2 border-cap-ultramarine/40 bg-slate-50 p-4">
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Staffing comparison (1 vs 2 teams)</h3>
                    <table className="min-w-full text-sm mb-4">
                      <thead>
                        <tr className="border-b border-gray-300 text-left text-gray-600">
                          <th className="py-2 pr-4">Scenario</th>
                          <th className="py-2 pr-4">Wing sorties</th>
                          <th className="py-2 pr-4">Wing NM</th>
                          <th className="py-2 pr-4">Coverage</th>
                          <th className="py-2">Over budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-200">
                          <td className="py-2 pr-4 font-medium">
                            1 team
                            <span className="block text-xs font-normal text-gray-500">
                              {compareBundle.data.team1DepLabel} · both sides, sequential
                            </span>
                          </td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.oneTeam.totalSorties}</td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.oneTeam.totalWingNm}</td>
                          <td className="py-2 pr-4 text-gray-700">Full corridor (inner then outer)</td>
                          <td className="py-2 tabular-nums">
                            {compareBundle.data.oneTeamOverBudgetSorties > 0
                              ? `${compareBundle.data.oneTeamOverBudgetSorties} sortie(s) ⚠`
                              : '—'}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4 font-medium">
                            2 teams
                            <span className="block text-xs font-normal text-gray-500">
                              {compareBundle.data.team1DepLabel} + {compareBundle.data.team2DepLabel} · inner / outer
                            </span>
                          </td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.twoTeams.totalSorties}</td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.twoTeams.totalWingNm}</td>
                          <td className="py-2 pr-4 text-gray-700">Full corridor (neighboring sides at the same time)</td>
                          <td className="py-2 tabular-nums">
                            {compareBundle.data.twoTeamsOverBudgetSorties > 0
                              ? `${compareBundle.data.twoTeamsOverBudgetSorties} sortie(s) ⚠`
                              : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-sm text-gray-800">
                      {compareBundle.data.deltaSorties === 0 ? (
                        <>
                          Both scenarios require <strong>{compareBundle.data.twoTeams.totalSorties} wing sorties</strong>{' '}
                          for full corridor coverage. A second aircraft lets the two teams work neighboring sides at the
                          same time; wing NM differs by <strong>{compareBundle.data.deltaWingNm} NM</strong> based on
                          each team&apos;s departure geometry.
                        </>
                      ) : compareBundle.data.deltaSorties > 0 ? (
                        <>
                          Two teams adds <strong>{compareBundle.data.deltaSorties} wing sortie(s)</strong> and{' '}
                          <strong>{compareBundle.data.deltaWingNm} NM</strong> versus one aircraft doing both sides
                          sequentially.
                        </>
                      ) : (
                        <>
                          Two teams reduces wing workload by{' '}
                          <strong>{Math.abs(compareBundle.data.deltaSorties)} sortie(s)</strong> and{' '}
                          <strong>{Math.abs(compareBundle.data.deltaWingNm)} NM</strong> versus one aircraft doing both
                          sides sequentially.
                        </>
                      )}
                    </p>
                  </div>
                )}

                {compareBundle?.kind === '2-3' && (
                  <div className="mb-8 rounded-lg border-2 border-cap-ultramarine/40 bg-slate-50 p-4">
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Staffing comparison (2 vs 3 teams)</h3>
                    <table className="min-w-full text-sm mb-4">
                      <thead>
                        <tr className="border-b border-gray-300 text-left text-gray-600">
                          <th className="py-2 pr-4">Scenario</th>
                          <th className="py-2 pr-4">Wing sorties</th>
                          <th className="py-2 pr-4">Wing NM</th>
                          <th className="py-2 pr-4">Coverage</th>
                          <th className="py-2">Over budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-200">
                          <td className="py-2 pr-4 font-medium">
                            2 teams
                            <span className="block text-xs font-normal text-gray-500">
                              {compareBundle.data.team1DepLabel} inner + {compareBundle.data.team2DepLabel} outer
                            </span>
                          </td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.twoTeams.totalSorties}</td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.twoTeams.totalWingNm}</td>
                          <td className="py-2 pr-4 text-gray-700">Full corridor (neighboring sides at the same time)</td>
                          <td className="py-2 tabular-nums">
                            {compareBundle.data.twoTeamsOverBudgetSorties > 0
                              ? `${compareBundle.data.twoTeamsOverBudgetSorties} sortie(s) ⚠`
                              : '—'}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4 font-medium">
                            3 teams
                            <span className="block text-xs font-normal text-gray-500">
                              {compareBundle.data.team1DepLabel}, {compareBundle.data.team2DepLabel},{' '}
                              {compareBundle.data.team3DepLabel} · geographic
                            </span>
                          </td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.threeTeams.totalSorties}</td>
                          <td className="py-2 pr-4 tabular-nums">{compareBundle.data.threeTeams.totalWingNm}</td>
                          <td className="py-2 pr-4 text-gray-700">Full corridor (3 segments)</td>
                          <td className="py-2 tabular-nums">
                            {compareBundle.data.threeTeamsOverBudgetSorties > 0
                              ? `${compareBundle.data.threeTeamsOverBudgetSorties} sortie(s) ⚠`
                              : '—'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {compareBundle.data.threeTeams.segmentAssignments && (
                      <p className="text-sm text-gray-700 mb-3">
                        3-team split at{' '}
                        <strong>
                          {compareBundle.data.threeTeams.geographicSplits
                            ?.map((s) => s.boundaryPt)
                            .join(' and ') ?? '—'}
                        </strong>
                        .
                      </p>
                    )}
                    <p className="text-sm text-gray-800">
                      {compareBundle.data.deltaSorties === 0 ? (
                        <>
                          Both scenarios require <strong>{compareBundle.data.twoTeams.totalSorties} wing sorties</strong>.
                          Three teams changes wing NM by <strong>{compareBundle.data.deltaWingNm} NM</strong> and
                          shortens per-aircraft geographic segments for weather recovery.
                        </>
                      ) : compareBundle.data.deltaSorties < 0 ? (
                        <>
                          Three teams saves <strong>{Math.abs(compareBundle.data.deltaSorties)} wing sortie(s)</strong>{' '}
                          and <strong>{Math.abs(compareBundle.data.deltaWingNm)} NM</strong> versus two-team
                          opposite-side staffing.
                        </>
                      ) : (
                        <>
                          Three teams adds <strong>{compareBundle.data.deltaSorties} wing sortie(s)</strong> and{' '}
                          <strong>{compareBundle.data.deltaWingNm} NM</strong> versus two-team opposite-side staffing.
                        </>
                      )}
                    </p>
                  </div>
                )}

                <table className="min-w-full text-sm mb-6">
                  <caption className="text-left text-sm font-semibold text-gray-900 mb-2">
                    Applied leg track plan
                  </caption>
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="py-2 pr-3">Leg</th>
                      <th className="py-2 pr-3">Left / Right NM</th>
                      <th className="py-2 pr-3">Offsets left</th>
                      <th className="py-2 pr-3">Offsets right</th>
                      <th className="py-2">Chain NM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legsResult.legs.map((leg) => (
                      <tr key={`${leg.fromPt}-${leg.toPt}`} className="border-b border-gray-100">
                        <td className="py-2 pr-3 font-mono">
                          {leg.fromPt}→{leg.toPt}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {leg.leftNm ?? '—'} / {leg.rightNm ?? '—'}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">
                          {leg.leftOffsets.join(', ') || '—'}
                          {leg.leftNote ? <span className="block font-sans text-gray-600">{leg.leftNote}</span> : null}
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">
                          {leg.rightOffsets.join(', ') || '—'}
                          {leg.rightNote ? <span className="block font-sans text-gray-600">{leg.rightNote}</span> : null}
                        </td>
                        <td className="py-2 tabular-nums">{leg.chainNm.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {compareBundle?.kind === '1-2' ? (
                  <>
                    <SurveyPlannerResults
                      title={`1 team — ${compareBundle.data.team1DepLabel} (both sides, sequential)`}
                      result={compareBundle.data.oneTeam}
                      exportCtx={sortieExportCtx}
                      onPilotBrief={setPilotBrief}
                      showRefuelGuidance={ferryMode === 'staged-refuel'}
                    />
                    <SurveyPlannerResults
                      title={`2 teams — ${compareBundle.data.team1DepLabel} + ${compareBundle.data.team2DepLabel} (inner / outer)`}
                      result={compareBundle.data.twoTeams}
                      exportCtx={sortieExportCtx}
                      onPilotBrief={setPilotBrief}
                      showRefuelGuidance={ferryMode === 'staged-refuel'}
                    />
                  </>
                ) : compareBundle?.kind === '2-3' ? (
                  <>
                    <SurveyPlannerResults
                      title={`2 teams — ${compareBundle.data.team1DepLabel} inner + ${compareBundle.data.team2DepLabel} outer`}
                      result={compareBundle.data.twoTeams}
                      exportCtx={sortieExportCtx}
                      onPilotBrief={setPilotBrief}
                      showRefuelGuidance={ferryMode === 'staged-refuel'}
                    />
                    <SurveyPlannerResults
                      title={`3 teams — geographic (${compareBundle.data.team1DepLabel}, ${compareBundle.data.team2DepLabel}, ${compareBundle.data.team3DepLabel})`}
                      result={compareBundle.data.threeTeams}
                      exportCtx={sortieExportCtx}
                      onPilotBrief={setPilotBrief}
                      showRefuelGuidance={ferryMode === 'staged-refuel'}
                    />
                  </>
                ) : null}

                <p className="text-sm font-bold text-cap-pimento mt-4" role="note">
                  {legsResult.disclaimer}
                </p>
              </div>
            )}
            </ReviewedSection>
            <ReviewedSection
              id="sides"
              ref={(node) => { sectionRefs.current.sides = node }}
              title="Sortie 1 sides"
              reviewed={Boolean(reviewMarks.sides)}
              problem={sectionProblems.sides ?? null}
              open={openSections.includes('sides')}
              onOpenChange={(open) => setSectionOpen('sides', open)}
            >
              <CoordinatorOffsetPlans
                key={planId}
                flightPlanId={planId}
                routeLabel={
                  routeMeta
                    ? `${routeMeta.routeType}${routeMeta.routeNumber}`
                    : planBundle.plan.name.replace(/\s+/g, '')
                }
                waypoints={planBundle.waypoints}
                widthTexts={widthTexts}
                widthBusy={widthBusy}
                widthError={widthErr}
                routeKind={offsetRouteKind}
                onReloadWidths={() => void loadWidth()}
                crews={offsetCrews}
                savedTeams={savedTeamPlan?.teams}
                sides={crewSides}
                onSidesChange={rememberSides}
              />
            </ReviewedSection>
          </div>
        )}
      </div>
      {planBundle && (
        <TeamDispatchSaveBar
          reviewedCount={TEAM_DISPATCH_SECTIONS.filter((section) => reviewMarks[section.id]).length}
          sectionCount={TEAM_DISPATCH_SECTIONS.length}
          status={saveBarStatus({
            stale: resultsStale,
            unsaved: dispatchUnsaved,
            saved: Boolean(savedTeamPlan),
          })}
          disabled={blocker.reason != null}
          disabledReason={blocker.reason}
          notice={teamPlanNotice}
          onDisabledReason={() => {
            if (blocker.sectionId) focusSection(blocker.sectionId)
          }}
          onSave={() => void saveTeamPlan()}
          onSaveAndMap={() => void saveAndOpenMap()}
        />
      )}
      </div>
    </div>
  )
}
