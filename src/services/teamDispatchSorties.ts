import type { SortieSide } from '@/services/offsetRouteFpl'
import { segmentCurveSide } from '@survey-planning/offsetRoutePlan.js'
import { packSortiesForTeam } from '@survey-planning/surveySortiePacker.js'
import {
  buildLegWidthSummaries,
  orderSortiesPreferredSide,
  planSingleTeamBothSides,
  planSurveyScenario,
  planThreeTeamGeographicScenario,
} from '@survey-planning/surveySortiePlanner.js'
import { CREW_DAY_LIMIT_HOURS, SURVEY_SPEED_KTAS, sortieEnduranceHours } from '@/services/sortieBudget'
import { spanTrackPlanFromRows, type SpanTrackRowState } from '@/utils/coordinatorSpanTrackPlan'
import { measurePackedSortieNm, type PackedTeamSortie, type SavedTeamPlan, type TeamPlanTeam } from '@/services/teamPlanRecord'

export type DispatchAirport = {
  identifier: string
  latitude: number
  longitude: number
}

export type DispatchSortieTeam = {
  ident: string
  fromPt: string
  toPt: string
  sortieCount: number
  totalNm: number
  sorties: PackedTeamSortie[]
}

export type DispatchSortiePlan = {
  totalSorties: number
  totalNm: number
  totalLine: string
  lines: string[]
  teams: DispatchSortieTeam[]
}

type PlannerSortie = {
  sortieNumber?: number
  side?: string
  offsets?: number[]
  waypointFrom?: string
  waypointTo?: string
  startAt?: string
  ferryInLabel?: string
  ferryOutLabel?: string
  totalNm?: number
  returnHomeOnly?: boolean
}

function sameIdent(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase()
}

function packedSortie(
  sortie: PlannerSortie,
  number: number,
  homeIdent: string,
  innerSide: 'left' | 'right'
): PackedTeamSortie {
  const surveySide = sortie.side === 'left' || sortie.side === 'right' ? sortie.side : null
  const startAt = sortie.startAt && sortie.startAt !== '—' && sortie.startAt !== '(return home)' ? sortie.startAt : null
  return {
    number,
    side: surveySide == null ? null : surveySide === innerSide ? 'inner' : 'outer',
    surveySide,
    offsetsNm: (sortie.offsets ?? []).filter((offset) => Number.isFinite(offset)),
    fromPt: sortie.waypointFrom ?? '',
    toPt: sortie.waypointTo ?? '',
    departureIdent: sortie.ferryInLabel || homeIdent,
    landingIdent: sortie.ferryOutLabel || homeIdent,
    distanceNm: Math.round((sortie.totalNm ?? 0) * 10) / 10,
    returnHomeOnly: Boolean(sortie.returnHomeOnly),
    startAt,
  }
}

function teamLine(ident: string, fromPt: string, toPt: string, count: number, nm: number): string {
  const range = fromPt && toPt ? `${fromPt}–${toPt}` : 'full route'
  const hours = sortieEnduranceHours(nm, SURVEY_SPEED_KTAS)
  const day =
    hours > CREW_DAY_LIMIT_HOURS
      ? ` ${ident} crew: ≈ ${hours.toFixed(1)} h total — long day. Consider a refuel airport, a closer crew, or another aircraft.`
      : ''
  return `${ident}: ${range}, ${count} sorties, ${nm} NM (≈ ${hours.toFixed(1)} h at ${SURVEY_SPEED_KTAS} KTAS), includes ferry.${day}`
}

/**
 * The same planner the wizard review uses.
 * Distance is ferry in, plus the lanes, plus ferry out.
 */
export function planDispatchSorties(opts: {
  aircraftCount: 1 | 2 | 3
  routeType?: string
  routeNumber?: string
  waypoints: Array<{ ptIdent: string; lat: number; lon: number }>
  widthTexts: string[]
  spans: SpanTrackRowState[]
  firstOffsetNm: number
  stepNm: number
  sortieBudgetNm: number
  ferryMode: 'return-home' | 'staged-refuel'
  refuel?: DispatchAirport | null
  airports: DispatchAirport[]
  /** The side each departure picked. Missing picks are not filled in. */
  sides?: Record<string, SortieSide | null | undefined>
  /** A hand edit or an applied comparison. When set, this assignment is packed instead of searching. */
  assignment?: Array<{ ident: string; fromPt: string; toPt: string; refuel: boolean }>
}): DispatchSortiePlan | { error: string } {
  const homes = opts.airports.filter((airport) => airport.identifier && Number.isFinite(airport.latitude))
  if (homes.length < opts.aircraftCount) return { error: 'Each aircraft needs a departure airport.' }
  if (opts.waypoints.length < 2) return { error: 'The route needs at least two points.' }
  if (opts.ferryMode === 'staged-refuel' && !opts.refuel) return { error: 'Look up the shared refueling airport.' }
  const pickedLateral = (airport: DispatchAirport, fallback: 'left' | 'right', fromPt: string, toPt: string) => {
    const pick = opts.sides?.[airport.identifier.toUpperCase()] ?? opts.sides?.[airport.identifier]
    if (pick !== 'inner' && pick !== 'outer') return fallback
    const curve = segmentCurveSide(opts.waypoints, fromPt, toPt)
    return pick === 'inner' ? curve.innerSide : curve.outerSide
  }
  const toTeam = (airport: DispatchAirport, side: 'left' | 'right') => ({
    label: airport.identifier,
    side,
    depLat: airport.latitude,
    depLon: airport.longitude,
  })
  const selected = homes.slice(0, opts.aircraftCount)
  const fullFrom = opts.waypoints[0]?.ptIdent ?? ''
  const fullTo = opts.waypoints[opts.waypoints.length - 1]?.ptIdent ?? ''
  const team1 = toTeam(selected[0], opts.aircraftCount === 2 ? pickedLateral(selected[0], 'left', fullFrom, fullTo) : 'left')
  const team2 = selected[1]
    ? toTeam(selected[1], opts.aircraftCount === 2 ? pickedLateral(selected[1], 'right', fullFrom, fullTo) : 'right')
    : team1
  const team3 = selected[2] ? toTeam(selected[2], 'left') : team1
  let spanTrackPlan
  try {
    spanTrackPlan = spanTrackPlanFromRows(opts.spans)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'The corridor tracks could not be read.' }
  }
  const input = {
    routeType: opts.routeType || 'VR',
    routeNumber: opts.routeNumber || '',
    waypoints: opts.waypoints,
    widthTexts: opts.widthTexts,
    teams: [team1],
    spanTrackPlan,
    sortieBudgetNm: opts.sortieBudgetNm,
    trackPolicy: { firstOffsetNm: opts.firstOffsetNm, stepNm: opts.stepNm },
    ferryMode: opts.ferryMode,
    recoveryAirport:
      opts.ferryMode === 'staged-refuel' && opts.refuel
        ? { lat: opts.refuel.latitude, lon: opts.refuel.longitude, label: opts.refuel.identifier }
        : undefined,
  }
  try {
    const result =
      opts.aircraftCount === 3
        ? planThreeTeamGeographicScenario(input, [team1, team2, team3])
        : opts.aircraftCount === 2
          ? planSurveyScenario({ ...input, teams: [team1, team2], assignmentModel: 'opposite-side' })
          : planSingleTeamBothSides(input)
    const assignments =
      'segmentAssignments' in result && Array.isArray(result.segmentAssignments) ? result.segmentAssignments : []
    const staged =
      opts.ferryMode === 'staged-refuel' && opts.refuel
        ? {
            home: { lat: 0, lon: 0, label: '' },
            recovery: { lat: opts.refuel.latitude, lon: opts.refuel.longitude, label: opts.refuel.identifier },
          }
        : null
    const packCrew = (
      raw: PlannerSortie[],
      airport: DispatchAirport,
      fromPt: string,
      toPt: string,
      stagedHere: typeof staged = staged
    ): PackedTeamSortie[] => {
      const curve = segmentCurveSide(opts.waypoints, fromPt, toPt)
      const pick = opts.sides?.[airport.identifier.toUpperCase()] ?? opts.sides?.[airport.identifier]
      const preferred = pick === 'inner' ? curve.innerSide : pick === 'outer' ? curve.outerSide : null
      const home = { lat: airport.latitude, lon: airport.longitude, label: airport.identifier }
      const ordered = orderSortiesPreferredSide(
        opts.waypoints,
        { label: airport.identifier, side: preferred ?? 'left', depLat: airport.latitude, depLon: airport.longitude },
        raw as unknown as Array<Record<string, unknown>>,
        preferred,
        stagedHere ? { ...stagedHere, home } : null,
        opts.sortieBudgetNm
      ) as unknown as PlannerSortie[]
      return ordered.map((sortie, index) => packedSortie(sortie, index + 1, airport.identifier, curve.innerSide))
    }
    const searched: DispatchSortieTeam[] =
      opts.aircraftCount === 1
        ? [
            (() => {
              const sorties = packCrew(
                (result.teams ?? []).flatMap((team) => (team.sorties ?? []) as PlannerSortie[]),
                selected[0],
                fullFrom,
                fullTo
              )
              const totalNm = Math.round(sorties.reduce((sum, sortie) => sum + sortie.distanceNm, 0) * 10) / 10
              return {
                ident: selected[0].identifier,
                fromPt: fullFrom,
                toPt: fullTo,
                sortieCount: sorties.length,
                totalNm,
                sorties,
              }
            })(),
          ]
        : (result.teams ?? []).map((team, index) => {
            const segment = assignments[index]
            const airport = selected.find((item) => sameIdent(item.identifier, segment?.teamLabel || team.label)) ?? selected[index]
            const ident = airport?.identifier || segment?.teamLabel || team.label || ''
            const fromPt = segment?.waypointFrom || fullFrom
            const toPt = segment?.waypointTo || fullTo
            const sorties = airport
              ? packCrew((team.sorties ?? []) as PlannerSortie[], airport, fromPt, toPt)
              : ((team.sorties ?? []) as PlannerSortie[]).map((sortie, sortieIndex) =>
                  packedSortie(sortie, sortieIndex + 1, ident, 'left')
                )
            const totalNm = Math.round(sorties.reduce((sum, sortie) => sum + sortie.distanceNm, 0) * 10) / 10
            return {
              ident,
              fromPt,
              toPt,
              sortieCount: sorties.length,
              totalNm,
              sorties,
            }
          })
    const assigned = (opts.assignment ?? []).filter((row) => row.fromPt && row.toPt && row.ident)
    const refuelOn = opts.ferryMode === 'staged-refuel' && Boolean(opts.refuel)
    const sameSplit =
      assigned.length === opts.aircraftCount &&
      assignments.length === assigned.length &&
      assigned.every(
        (row) =>
          Boolean(row.refuel) === refuelOn &&
          assignments.some(
            (item) =>
              sameIdent(item.teamLabel, row.ident) &&
              sameIdent(item.waypointFrom, row.fromPt) &&
              sameIdent(item.waypointTo, row.toPt)
          )
      )
    const teams =
      (assigned.length === opts.aircraftCount && !sameSplit
        ? assigned.map((row) => {
            const airport =
              selected.find((item) => sameIdent(item.identifier, row.ident)) ?? selected[0]
            const start = opts.waypoints.findIndex((point) => sameIdent(point.ptIdent, row.fromPt))
            const end = opts.waypoints.findIndex((point) => sameIdent(point.ptIdent, row.toPt))
            if (!airport || start < 0 || end <= start) {
              return {
                ident: row.ident,
                fromPt: row.fromPt,
                toPt: row.toPt,
                sortieCount: 0,
                totalNm: 0,
                sorties: [],
              }
            }
            const slice = opts.waypoints.slice(start, end + 1)
            const sliceLegs = buildLegWidthSummaries(input).slice(start, end)
            const curve = segmentCurveSide(opts.waypoints, row.fromPt, row.toPt)
            const pick = opts.sides?.[airport.identifier.toUpperCase()] ?? opts.sides?.[airport.identifier]
            const preferred = pick === 'inner' ? curve.innerSide : pick === 'outer' ? curve.outerSide : null
            const neighbors = {
              before: start > 0 ? opts.waypoints[start - 1] : null,
              after: end + 1 < opts.waypoints.length ? opts.waypoints[end + 1] : null,
            }
            const crew = {
              label: airport.identifier,
              side: 'left' as const,
              depLat: airport.latitude,
              depLon: airport.longitude,
            }
            const stagedForPack =
              row.refuel && opts.refuel
                ? {
                    home: { lat: airport.latitude, lon: airport.longitude, label: airport.identifier },
                    recovery: {
                      lat: opts.refuel.latitude,
                      lon: opts.refuel.longitude,
                      label: opts.refuel.identifier,
                    },
                    sideRole: 'single-side' as const,
                    hasOppositeSideAfter: false,
                  }
                : null
            const raw =
              opts.aircraftCount === 2 && preferred
                ? packSortiesForTeam(slice, sliceLegs, { ...crew, side: preferred }, opts.sortieBudgetNm, stagedForPack, neighbors)
                : [
                    ...packSortiesForTeam(slice, sliceLegs, { ...crew, side: 'left' }, opts.sortieBudgetNm, stagedForPack, neighbors),
                    ...packSortiesForTeam(slice, sliceLegs, { ...crew, side: 'right' }, opts.sortieBudgetNm, stagedForPack, neighbors),
                  ]
            const rowStaged =
              row.refuel && opts.refuel
                ? {
                    home: { lat: 0, lon: 0, label: '' },
                    recovery: { lat: opts.refuel.latitude, lon: opts.refuel.longitude, label: opts.refuel.identifier },
                  }
                : null
            const sorties = packCrew(raw as PlannerSortie[], airport, row.fromPt, row.toPt, rowStaged)
            const totalNm = Math.round(sorties.reduce((sum, sortie) => sum + sortie.distanceNm, 0) * 10) / 10
            return { ident: airport.identifier, fromPt: row.fromPt, toPt: row.toPt, sortieCount: sorties.length, totalNm, sorties }
          })
        : searched)
    const legWidths = opts.spans.map((row) => {
      const leftNm = Number(row.leftNm)
      const rightNm = Number(row.rightNm)
      return Number.isFinite(leftNm) && Number.isFinite(rightNm) ? { leftNm, rightNm } : null
    })
    const measuredPoints = opts.waypoints.map((point) => ({
      ptIdent: point.ptIdent,
      lat: point.lat,
      lon: point.lon,
      originalName: point.ptIdent,
      g1000Name: point.ptIdent,
    }))
    const airportOf = (ident: string) => {
      const found = [...opts.airports, ...(opts.refuel ? [opts.refuel] : [])].find((airport) => sameIdent(airport.identifier, ident))
      return found
        ? { identifier: found.identifier, name: found.identifier, latitude: found.latitude, longitude: found.longitude }
        : null
    }
    const drafted: TeamPlanTeam[] = teams.flatMap((team) => {
      const home = airportOf(team.ident)
      if (!home) return []
      const away = team.sorties.find(
        (sortie) =>
          (sortie.landingIdent && !sameIdent(sortie.landingIdent, team.ident)) ||
          (sortie.departureIdent && !sameIdent(sortie.departureIdent, team.ident))
      )
      const awayIdent = away
        ? !sameIdent(away.landingIdent, team.ident)
          ? away.landingIdent
          : away.departureIdent
        : ''
      return [
        {
          id: 'team1',
          label: team.ident,
          departure: home,
          landing: home,
          refuelStop: awayIdent ? airportOf(awayIdent) : null,
          segmentFrom: team.fromPt,
          segmentTo: team.toPt,
          startPoint: team.fromPt,
          sorties: [],
          packedSorties: team.sorties,
        },
      ]
    })
    for (const team of teams) {
      const draftedTeam = drafted.find((item) => sameIdent(item.label, team.ident))
      if (!draftedTeam) continue
      let changed = false
      for (const sortie of team.sorties) {
        if (sortie.returnHomeOnly || sortie.offsetsNm.length === 0 || !sortie.side) continue
        const miles = measurePackedSortieNm({
          team: draftedTeam,
          points: measuredPoints,
          legWidths,
          sortieNumber: sortie.number,
          firstOffsetNm: opts.firstOffsetNm,
          stepNm: opts.stepNm,
          homeIdent: team.ident,
          homes: teams.map((item) => item.ident),
        })
        if (miles == null) continue
        const gap = Math.abs(Math.round((miles - sortie.distanceNm) * 10) / 10)
        if (gap <= 0.1) continue
        sortie.distanceNm = miles
        changed = true
      }
      if (changed) team.totalNm = Math.round(team.sorties.reduce((sum, sortie) => sum + sortie.distanceNm, 0) * 10) / 10
    }
    const lines = teams.map((team) => teamLine(team.ident, team.fromPt, team.toPt, team.sortieCount, team.totalNm))
    const totalSorties = teams.reduce((sum, team) => sum + team.sortieCount, 0)
    const totalNm = Math.round(teams.reduce((sum, team) => sum + team.totalNm, 0) * 10) / 10
    return {
      totalSorties,
      totalNm,
      totalLine: `${totalSorties} sorties, ${totalNm} NM total, includes ferry.`,
      lines,
      teams,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'The planner could not build this sortie list.' }
  }
}

/** Copy the planner's sortie list onto the saved teams, matched by departure airport. */
export function attachPackedSorties(plan: SavedTeamPlan, dispatch: DispatchSortiePlan): SavedTeamPlan {
  return {
    ...plan,
    teams: plan.teams.map((team) => {
      const packed = dispatch.teams.find((item) => sameIdent(item.ident, team.departure?.identifier))
      if (!packed) return team
      return {
        ...team,
        segmentFrom: packed.fromPt || team.segmentFrom,
        segmentTo: packed.toPt || team.segmentTo,
        packedSorties: packed.sorties,
        sorties: packed.sorties.map((sortie) => ({
          number: sortie.number,
          side: sortie.side,
          order: 'forward' as const,
        })),
      }
    }),
  }
}
