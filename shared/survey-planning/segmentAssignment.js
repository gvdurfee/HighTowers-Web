/**
 * Editable geographic segments. Sortie distance uses the same lane planner as Map View.
 */

import { planSideLanes } from './sortieLanePlan.js'

/**
 * @param {string[]} labels
 */
function nameList(labels) {
  if (labels.length <= 1) return labels[0] ?? ''
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

/**
 * @param {string[]} pointIdents route order
 * @param {Array<{ label: string, from?: string | null, to?: string | null }>} segments
 * @returns {{ ok: boolean, messages: string[] }}
 */
export function validateTeamSegments(pointIdents, segments) {
  /** @type {string[]} */
  const messages = []
  const index = new Map(pointIdents.map((ident, i) => [ident, i]))
  /** @type {Map<string, string[]>} */
  const covered = new Map()

  for (const segment of segments) {
    const label = segment.label || 'A team'
    if (!segment.from || !segment.to) {
      messages.push(`${label} has no segment.`)
      continue
    }
    const fromIdx = index.get(segment.from)
    const toIdx = index.get(segment.to)
    if (fromIdx == null || toIdx == null || fromIdx === toIdx) {
      messages.push(`${label} has no segment.`)
      continue
    }
    if (fromIdx > toIdx) {
      messages.push(`${label}: From is after To.`)
      continue
    }
    for (let leg = fromIdx; leg < toIdx; leg++) {
      const key = `${pointIdents[leg]}–${pointIdents[leg + 1]}`
      const who = covered.get(key) ?? []
      who.push(label)
      covered.set(key, who)
    }
  }

  for (let leg = 0; leg < pointIdents.length - 1; leg++) {
    const key = `${pointIdents[leg]}–${pointIdents[leg + 1]}`
    const who = covered.get(key) ?? []
    if (who.length === 0) messages.push(`No team covers ${key}.`)
    else if (who.length > 1) messages.push(`${key} is assigned to ${nameList(who)}.`)
  }

  return { ok: messages.length === 0, messages }
}

/**
 * One side of a segment, with the ferry ends that sortie actually uses.
 * @param {object} opts
 */
function planOneSide(opts) {
  const planned = planSideLanes({
    points: opts.points,
    legWidths: opts.legWidths,
    side: opts.side,
    policy: opts.policy,
    departure: opts.departure,
    landing: opts.landing,
  })
  const piece = planned.pieces[0]
  return {
    surveySide: opts.side,
    lanes: planned.lanes.length,
    waypoints: planned.routeSequence.length,
    distanceNm: planned.distanceNm,
    offsetsNm: planned.offsetsNm,
    routeSequence: planned.routeSequence,
    startAt: planned.startAt,
    offsets: piece?.offsets ?? [],
    ferryInNm: piece?.ferryInNm ?? 0,
    alongRouteNm: planned.pieces.reduce((sum, item) => sum + (item.alongRouteNm ?? 0), 0),
    ferryOutNm: planned.pieces.at(-1)?.ferryOutNm ?? 0,
    overBudget: planned.distanceNm > opts.budgetNm + 1e-6,
  }
}

/**
 * Both sides of one team's segment. Sortie 1 is the saved side; Sortie 2 is the other side.
 * A refuel stop lands Sortie 1 there and departs Sortie 2 from there.
 * @param {object} opts
 * @param {Array<{ ptIdent: string, lat: number, lon: number, g1000Name?: string }>} opts.points full route
 * @param {Array<{ leftNm: number, rightNm: number } | null>} opts.legWidths
 * @param {string} opts.fromPt
 * @param {string} opts.toPt
 * @param {{ lat: number, lon: number, identifier: string }} opts.home
 * @param {{ lat: number, lon: number, identifier: string } | null} [opts.refuel]
 * @param {'left' | 'right'} [opts.sortie1Side]
 * @param {{ firstOffsetNm?: number, stepNm?: number }} [opts.policy]
 * @param {number} [opts.budgetNm]
 */
export function planTeamSegmentDay(opts) {
  const points = opts.points ?? []
  const start = points.findIndex((point) => point.ptIdent === opts.fromPt)
  const end = points.findIndex((point) => point.ptIdent === opts.toPt)
  const budgetNm = opts.budgetNm ?? 500
  if (start < 0 || end <= start) {
    return { fromPt: opts.fromPt ?? '', toPt: opts.toPt ?? '', sorties: [], totalNm: 0, refuel: opts.refuel ?? null }
  }
  const slicePoints = points.slice(start, end + 1)
  const sliceWidths = (opts.legWidths ?? []).slice(start, end)
  const home = opts.home
  const refuel = opts.refuel ?? null
  const sortie1Side = opts.sortie1Side === 'right' ? 'right' : 'left'
  const sortie2Side = sortie1Side === 'left' ? 'right' : 'left'
  const landing1 = refuel ?? home
  const depart2 = refuel ?? home
  const shared = {
    points: slicePoints,
    legWidths: sliceWidths,
    policy: opts.policy,
    budgetNm,
  }
  const first = planOneSide({
    ...shared,
    side: sortie1Side,
    departure: home,
    landing: landing1,
  })
  const second = planOneSide({
    ...shared,
    side: sortie2Side,
    departure: depart2,
    landing: home,
  })
  const sorties = [
    {
      number: 1,
      ...first,
      departureIdent: home.identifier,
      landingIdent: landing1.identifier,
      startIdx: start,
      endIdx: end,
      waypointFrom: opts.fromPt,
      waypointTo: opts.toPt,
    },
    {
      number: 2,
      ...second,
      departureIdent: depart2.identifier,
      landingIdent: home.identifier,
      startIdx: start,
      endIdx: end,
      waypointFrom: opts.fromPt,
      waypointTo: opts.toPt,
    },
  ]
  const totalNm = Math.round(sorties.reduce((sum, sortie) => sum + sortie.distanceNm, 0) * 10) / 10
  return { fromPt: opts.fromPt, toPt: opts.toPt, sorties, totalNm, refuel }
}

/**
 * @param {{ sorties: Array<{ distanceNm: number }> }} day
 * @param {number} [budgetNm]
 */
export function teamNeedsRefuel(day, budgetNm = 500) {
  return day.sorties.some((sortie) => sortie.distanceNm > budgetNm + 1e-6)
}

/**
 * Best single boundary for two teams, both sides, no refuel stop.
 * @param {object} opts
 */
export function suggestTwoTeamSplit(opts) {
  const points = opts.points ?? []
  const teams = opts.teams ?? []
  let best = null
  for (let boundary = 1; boundary <= points.length - 2; boundary++) {
    for (const order of [
      [0, 1],
      [1, 0],
    ]) {
      const chunks = [
        { team: teams[order[0]], fromPt: points[0].ptIdent, toPt: points[boundary].ptIdent },
        { team: teams[order[1]], fromPt: points[boundary].ptIdent, toPt: points[points.length - 1].ptIdent },
      ]
      const days = chunks.map((chunk) => ({
        label: chunk.team.label,
        fromPt: chunk.fromPt,
        toPt: chunk.toPt,
        day: planTeamSegmentDay({
          points,
          legWidths: opts.legWidths,
          fromPt: chunk.fromPt,
          toPt: chunk.toPt,
          home: chunk.team,
          refuel: null,
          sortie1Side: 'left',
          policy: opts.policy,
          budgetNm: opts.budgetNm ?? 500,
        }),
      }))
      const over = days.reduce(
        (sum, item) => sum + item.day.sorties.filter((sortie) => sortie.overBudget).length,
        0
      )
      const totalNm = Math.round(days.reduce((sum, item) => sum + item.day.totalNm, 0) * 10) / 10
      if (
        !best ||
        over < best.over ||
        (over === best.over && totalNm < best.totalNm)
      ) {
        best = { over, totalNm, days }
      }
    }
  }
  return best
}
