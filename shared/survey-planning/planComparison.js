/**
 * Side-by-side survey plans. Nothing here is saved.
 * Lane spacing is one policy for the whole route, so a different step on one leg is not planned.
 */

import { parallelOffsetsForHalfWidth } from './surveyGeometry.js'
import { packSortiesForTeam } from './surveySortiePacker.js'
import { finalizeStagedRefuelTeamSorties } from './surveySortiePlanner.js'
import { nauticalMilesBetween } from './surveyGeometry.js'

export const PER_SEGMENT_SPACING_NOTE =
  'Lane spacing is one setting for the whole route. An 8 NM step on A–B only cannot be planned, so that variant is skipped.'

const TEAM_ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
]

function roundNm(value) {
  return Math.round(value * 10) / 10
}

function homeOf(place) {
  return { lat: place.latitude, lon: place.longitude, identifier: place.identifier }
}

function refuelOf(place) {
  return place ? { lat: place.latitude, lon: place.longitude, identifier: place.identifier } : null
}

function airportCopy(place) {
  if (!place) return null
  return {
    identifier: place.identifier,
    name: place.name || place.identifier,
    latitude: place.latitude,
    longitude: place.longitude,
    elevation: place.elevation,
  }
}

function flyDay(opts, team, from, to, refuel) {
  const points = opts.points ?? []
  const start = points.findIndex((point) => point.ptIdent === from)
  const end = points.findIndex((point) => point.ptIdent === to)
  const budgetNm = opts.budgetNm ?? 500
  const home = homeOf(team)
  const recovery = refuelOf(refuel)
  if (!home || start < 0 || end <= start) return { sorties: [], totalNm: 0 }
  const slicePoints = points.slice(start, end + 1)
  const sliceWidths = (opts.legWidths ?? []).slice(start, end)
  const legs = sliceWidths.map((width, index) => ({
    fromIdx: index,
    toIdx: index + 1,
    leftNm: width?.leftNm ?? null,
    rightNm: width?.rightNm ?? null,
    leftOffsets: width ? parallelOffsetsForHalfWidth(width.leftNm, opts.policy) : [],
    rightOffsets: width ? parallelOffsetsForHalfWidth(width.rightNm, opts.policy) : [],
  }))
  const crew = { label: home.identifier, side: 'left', depLat: home.lat, depLon: home.lon }
  const staged = recovery
    ? {
        home: { lat: home.lat, lon: home.lon, label: home.identifier },
        recovery: { lat: recovery.lat, lon: recovery.lon, label: recovery.identifier },
      }
    : null
  const packed = [
    ...packSortiesForTeam(slicePoints, legs, { ...crew, side: 'left' }, budgetNm, staged),
    ...packSortiesForTeam(slicePoints, legs, { ...crew, side: 'right' }, budgetNm, staged),
  ]
  const chained = staged
    ? finalizeStagedRefuelTeamSorties(slicePoints, crew, packed, staged, budgetNm, { appendReturnHomeIfNeeded: true }).sorties
    : packed
  const sorties = chained.map((sortie, index) => ({
    number: index + 1,
    distanceNm: sortie.totalNm,
    overBudget: Boolean(sortie.overBudget) || sortie.totalNm > budgetNm + 1e-6,
  }))
  const totalNm = Math.round(sorties.reduce((sum, sortie) => sum + sortie.distanceNm, 0) * 10) / 10
  return { sorties, totalNm }
}

function teamRow(team, from, to, refuel, day) {
  return {
    identifier: team.identifier,
    from,
    to,
    home: team.identifier,
    refuel: refuel?.identifier ?? null,
    refuelAirport: airportCopy(refuel),
    sorties: day.sorties.map((sortie) => ({
      number: sortie.number,
      distanceNm: sortie.distanceNm,
      overBudget: sortie.overBudget,
    })),
    totalNm: day.totalNm,
  }
}

function summarize(id, title, teams, extra = {}) {
  const refuelStops = teams.filter((team) => team.refuel).length
  const wingNm = roundNm(teams.reduce((sum, team) => sum + team.totalNm, 0))
  const allUnder = teams.length > 0 && teams.every((team) => team.sorties.length > 0 && team.sorties.every((sortie) => !sortie.overBudget))
  return {
    id,
    title,
    teams,
    refuelStops,
    wingNm,
    allUnder,
    recommended: false,
    insertedPoint: null,
    boundaryNote: null,
    ...extra,
  }
}

function optionRank(option) {
  const sorties = option.teams.reduce((sum, team) => sum + team.sorties.length, 0)
  const over = option.teams.reduce(
    (sum, team) => sum + team.sorties.filter((sortie) => sortie.overBudget).length,
    0
  )
  const maxSorties = option.teams.reduce((max, team) => Math.max(max, team.sorties.length), 0)
  const maxNm = option.teams.reduce((max, team) => Math.max(max, team.totalNm), 0)
  return { sorties, wingNm: option.wingNm, over, maxSorties, maxNm }
}

/** Fewest sorties, then fewest miles, then fewest over-budget sorties. */
function betterPlan(candidate, best) {
  if (!best) return true
  const left = optionRank(candidate)
  const right = optionRank(best)
  if (left.sorties !== right.sorties) return left.sorties < right.sorties
  if (left.wingNm !== right.wingNm) return left.wingNm < right.wingNm
  if (left.over !== right.over) return left.over < right.over
  if (left.maxSorties !== right.maxSorties) return left.maxSorties < right.maxSorties
  return left.maxNm < right.maxNm
}

function placeAlong(a, b, fraction) {
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lon: a.lon + (b.lon - a.lon) * fraction,
  }
}

function expandRoute(points, widths, inserted) {
  if (!inserted) return { points, widths }
  const index = points.findIndex((point) => point.ptIdent === inserted.afterIdent)
  if (index < 0 || index >= points.length - 1) return { points, widths }
  const nextPoints = [...points.slice(0, index + 1), inserted.point, ...points.slice(index + 1)]
  const width = widths[index]
  const nextWidths = [...widths.slice(0, index), width, width, ...widths.slice(index + 1)]
  return { points: nextPoints, widths: nextWidths }
}

export function expandPlanningRoute(points, widths, insertedPoint) {
  return expandRoute(points, widths, insertedPoint)
}

function twoCrewOption(opts, id, title, first, second) {
  let best = null
  const points = opts.points
  for (let boundary = 1; boundary <= points.length - 2; boundary++) {
    for (const order of [
      [first, second],
      [second, first],
    ]) {
      const chunks = [
        { team: order[0], from: points[0].ptIdent, to: points[boundary].ptIdent },
        { team: order[1], from: points[boundary].ptIdent, to: points[points.length - 1].ptIdent },
      ]
      const teams = chunks.map((chunk) => teamRow(chunk.team, chunk.from, chunk.to, null, flyDay(opts, chunk.team, chunk.from, chunk.to, null)))
      const option = summarize(id, title, teams)
      if (betterPlan(option, best)) best = option
    }
  }
  return best
}

/**
 * KSKX keeps the start of the route. The boundary moves from B back along A–B
 * when a published waypoint cannot bring both KSKX sorties under the budget.
 */
function nudgeKskxBoundary(opts, kskx, kabq) {
  const points = opts.points
  const published = teamRow(kskx, points[0].ptIdent, points[1].ptIdent, null, flyDay(opts, kskx, points[0].ptIdent, points[1].ptIdent, null))
  const kabqRest = teamRow(kabq, points[1].ptIdent, points[points.length - 1].ptIdent, null, flyDay(opts, kabq, points[1].ptIdent, points[points.length - 1].ptIdent, null))
  const publishedOption = summarize('kabq-kskx', 'Two crews from KABQ and KSKX, no refuel', [published, kabqRest], {
    boundaryNote: `Published waypoints have nothing between A and B. KSKX A–B is ${published.sorties.map((sortie) => sortie.distanceNm).join(' and ')} NM.`,
  })

  const legNm = nauticalMilesBetween(
    { lat: points[0].lat, lon: points[0].lon },
    { lat: points[1].lat, lon: points[1].lon }
  )
  let under = null
  let kskxUnder = null
  for (let step = 1; step <= 40; step++) {
    const fraction = step / 41
    const spot = placeAlong(points[0], points[1], fraction)
    const alongNm = roundNm(
      nauticalMilesBetween({ lat: points[0].lat, lon: points[0].lon }, spot)
    )
    const ident = `P${Math.round(alongNm)}`
    const inserted = {
      afterIdent: points[0].ptIdent,
      alongNm,
      point: {
        ptIdent: ident,
        lat: spot.lat,
        lon: spot.lon,
        g1000Name: ident,
        originalName: ident,
      },
    }
    const route = expandRoute(points, opts.legWidths, inserted)
    const local = { ...opts, points: route.points, legWidths: route.widths }
    const kskxDay = flyDay(local, kskx, points[0].ptIdent, ident, null)
    const kabqDay = flyDay(local, kabq, ident, points[points.length - 1].ptIdent, null)
    const option = summarize('kabq-kskx', 'Two crews from KABQ and KSKX, no refuel', [
      teamRow(kskx, points[0].ptIdent, ident, null, kskxDay),
      teamRow(kabq, ident, points[points.length - 1].ptIdent, null, kabqDay),
    ], {
      insertedPoint: inserted,
      boundaryNote: `Boundary ${ident} is ${alongNm} NM from A along A–B.`,
    })
    const kskxOk = option.teams[0].sorties.every((sortie) => !sortie.overBudget)
    if (kskxOk && (!kskxUnder || alongNm > kskxUnder.insertedPoint.alongNm)) kskxUnder = option
    if (option.allUnder && (!under || alongNm > under.insertedPoint.alongNm)) under = option
  }

  if (under) {
    return {
      ...under,
      boundaryNote: `${under.boundaryNote} That is the split closest to B with every sortie under the budget. ${PER_SEGMENT_SPACING_NOTE}`,
    }
  }
  if (kskxUnder) {
    const publishedNm = published.sorties.map((sortie) => sortie.distanceNm).join(' and ')
    const kabqOver = kskxUnder.teams[1].sorties.filter((sortie) => sortie.overBudget).map((sortie) => sortie.distanceNm)
    return {
      ...kskxUnder,
      boundaryNote: `Published A–B is ${publishedNm} NM per sortie. ${kskxUnder.boundaryNote} KSKX is under 500 NM there. KABQ sorties at ${kabqOver.join(' and ')} NM are over. No split along A–B keeps both crews under 500 NM. ${PER_SEGMENT_SPACING_NOTE}`,
    }
  }
  return {
    ...publishedOption,
    boundaryNote: `${publishedOption.boundaryNote} No point along A–B brings KSKX under 500 NM. ${PER_SEGMENT_SPACING_NOTE}`,
  }
}

function onlyKlruRefuels(opts, homes, refuel) {
  const points = opts.points
  const klru = homes.find((team) => team.identifier === 'KLRU')
  let best = null
  for (let first = 1; first <= points.length - 3; first++) {
    for (let second = first + 1; second <= points.length - 2; second++) {
      const chunks = [
        [points[0].ptIdent, points[first].ptIdent],
        [points[first].ptIdent, points[second].ptIdent],
        [points[second].ptIdent, points[points.length - 1].ptIdent],
      ]
      for (const order of TEAM_ORDERS) {
        const teams = order.map((teamIndex, chunkIndex) => {
          const team = homes[teamIndex]
          const stop = team.identifier === klru?.identifier ? refuel : null
          const day = flyDay(opts, team, chunks[chunkIndex][0], chunks[chunkIndex][1], stop)
          return teamRow(team, chunks[chunkIndex][0], chunks[chunkIndex][1], stop, day)
        })
        const option = summarize('klru-refuel', 'Return home, only KLRU refuels at KTCC', teams)
        if (betterPlan(option, best)) best = option
      }
    }
  }
  return best
}

function savedOption(opts, homes, refuel) {
  const budgetNm = opts.budgetNm ?? 500
  const teams = (opts.saved ?? []).map((row) => {
    const home = homes.find((team) => team.identifier === row.identifier)
    if (!home || !row.from || !row.to) return null
    if (Array.isArray(row.sorties) && row.sorties.length > 0) {
      const sorties = row.sorties.map((sortie) => ({
        number: sortie.number,
        distanceNm: sortie.distanceNm,
        overBudget: sortie.distanceNm > budgetNm + 1e-6,
      }))
      return {
        identifier: home.identifier,
        from: row.from,
        to: row.to,
        home: home.identifier,
        refuel: row.refuel ? refuel?.identifier ?? true : null,
        refuelAirport: row.refuel ? airportCopy(refuel) : null,
        sorties,
        totalNm: typeof row.totalNm === 'number' ? row.totalNm : roundNm(sorties.reduce((sum, sortie) => sum + sortie.distanceNm, 0)),
      }
    }
    const stop = row.refuel ? refuel : null
    const day = flyDay(opts, home, row.from, row.to, stop)
    return teamRow(home, row.from, row.to, stop, day)
  }).filter(Boolean)
  return summarize('saved', 'Current saved plan', teams)
}

function markRecommended(options) {
  const fitting = options.filter((option) => option.allUnder)
  const pool = fitting
  let winner = null
  for (const option of pool) {
    if (betterPlan(option, winner)) winner = option
  }
  return options.map((option) => ({ ...option, recommended: winner != null && option === winner }))
}

function permutations(items) {
  if (items.length <= 1) return [items]
  const out = []
  for (let index = 0; index < items.length; index++) {
    const rest = items.slice(0, index).concat(items.slice(index + 1))
    for (const perm of permutations(rest)) out.push([items[index], ...perm])
  }
  return out
}

/** Contiguous pieces covering the route. Each piece shares its boundary point with the next. */
function segmentRanges(pointCount, teamCount) {
  const ranges = []
  function walk(start, left, acc) {
    if (left === 1) {
      if (start < pointCount - 1) ranges.push([...acc, [start, pointCount - 1]])
      return
    }
    for (let end = start + 1; end <= pointCount - left; end++) {
      walk(end, left - 1, [...acc, [start, end]])
    }
  }
  if (teamCount >= 2 && pointCount >= teamCount + 1) walk(0, teamCount, [])
  return ranges
}

function geographicOption(opts, homes, useSharedRefuel) {
  const points = opts.points ?? []
  const refuel = useSharedRefuel ? opts.refuel ?? null : null
  if (homes.length < 2 || (useSharedRefuel && !refuel)) return null
  const ranges = segmentRanges(points.length, homes.length)
  if (ranges.length === 0) return null
  const masks = useSharedRefuel
    ? Array.from({ length: (1 << homes.length) - 1 }, (_, index) => index + 1)
    : [0]
  let best = null
  for (const range of ranges) {
    for (const order of permutations(homes)) {
      for (const mask of masks) {
        const teams = range.map((bounds, index) => {
          const team = order[index]
          const stop = mask & (1 << index) ? refuel : null
          const from = points[bounds[0]].ptIdent
          const to = points[bounds[1]].ptIdent
          return teamRow(team, from, to, stop, flyDay(opts, team, from, to, stop))
        })
        const id = useSharedRefuel ? 'shared-refuel' : 'geographic'
        const title = useSharedRefuel
          ? `${homes.length} crews, shared refuel at ${refuel.identifier}`
          : `${homes.length} crews, no refuel`
        const option = summarize(id, title, teams)
        if (betterPlan(option, best)) best = option
      }
    }
  }
  return best
}

/**
 * @param {object} opts
 * @param {Array<{ ptIdent: string, lat: number, lon: number, g1000Name?: string }>} opts.points
 * @param {Array<{ leftNm: number, rightNm: number } | null>} opts.legWidths
 * @param {Array<{ identifier: string, name?: string, latitude: number, longitude: number }>} opts.homes
 * @param {{ identifier: string, name?: string, latitude: number, longitude: number } | null} opts.refuel
 * @param {Array<{ identifier: string, from: string, to: string, refuel?: boolean }>} [opts.saved]
 * @param {{ firstOffsetNm?: number, stepNm?: number }} [opts.policy]
 * @param {number} [opts.budgetNm]
 * @param {{ teams: Array<{ ident: string, fromPt: string, toPt: string, totalNm: number, sorties: Array<{ number: number, distanceNm: number }> }>, refuelIdent?: string | null }} [opts.applied]
 */
export function compareSurveyPlans(opts) {
  const homes = opts.homes ?? []
  const refuel = opts.refuel ?? null
  const budgetNm = opts.budgetNm ?? 500
  const options = []
  if (opts.applied?.teams?.length) {
    const teams = opts.applied.teams.map((team) => ({
      identifier: team.ident,
      from: team.fromPt,
      to: team.toPt,
      home: team.ident,
      refuel: opts.applied.refuelIdent ?? null,
      refuelAirport:
        opts.applied.refuelIdent && refuel && refuel.identifier === opts.applied.refuelIdent
          ? airportCopy(refuel)
          : null,
      sorties: team.sorties.map((sortie) => ({
        number: sortie.number,
        distanceNm: sortie.distanceNm,
        overBudget: sortie.distanceNm > budgetNm + 1e-6,
      })),
      totalNm: team.totalNm,
    }))
    options.push(summarize('applied', 'Applied plan', teams))
  }
  if (opts.saved?.length) options.push(savedOption(opts, homes, refuel))
  const geographic = geographicOption(opts, homes, false)
  if (geographic) options.push(geographic)
  if (refuel) {
    const shared = geographicOption(opts, homes, true)
    if (shared) options.push(shared)
  }
  const applied = options.find((option) => option.id === 'applied')
  const quoted = []
  for (const option of options) {
    if (typeof opts.quote !== 'function' || option.id === 'applied' || option.id === 'saved') {
      quoted.push(option)
      continue
    }
    const priced = opts.quote(option)
    if (!priced) continue
    const different =
      applied != null &&
      option.teams.some((team) => {
        const row = applied.teams.find((item) => item.identifier === team.identifier)
        return !row || row.from !== team.from || row.to !== team.to
      })
    quoted.push({
      ...option,
      teams: priced.teams,
      wingNm: priced.wingNm,
      allUnder: priced.allUnder,
      refuelStops: priced.refuelStops,
      title: different ? `${option.title} · Alternative split` : option.title,
    })
  }
  return {
    perSegmentSpacing: false,
    spacingNote: PER_SEGMENT_SPACING_NOTE,
    options: markRecommended(quoted),
  }
}

/**
 * Load a comparison into the geographic assignment form. Does not save.
 * @param {object} option
 * @param {Array<{ id: string, identifier: string }>} crews
 */
export function assignmentEditsForOption(option, crews) {
  const segments = {}
  const refuels = {}
  for (const crew of crews) {
    const row = option.teams.find((team) => team.identifier === crew.identifier)
    if (!row) {
      segments[crew.id] = { from: '', to: '' }
      refuels[crew.id] = null
      continue
    }
    segments[crew.id] = { from: row.from, to: row.to }
    refuels[crew.id] = row.refuelAirport
  }
  return { segments, refuels, insertedPoint: option.insertedPoint ?? null }
}
