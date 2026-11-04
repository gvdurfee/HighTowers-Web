import { describe, expect, it } from 'vitest'
import {
  assembleWidthClauses,
  parseWidthTexts,
} from '../shared/survey-planning/mtrWidthParser.js'
import { resolvePublishedLegWidths } from '../shared/survey-planning/offsetRoutePlan.js'

const IR112_ROWS = [
  '5 NM EITHER SIDE OF CENTERLINE FROM A TO D;',
  '5 NM LEFT AND 4 NM RIGHT OF CENTERLINE FROM D TO E; 5 NM EITHER',
  'SIDE OF CENTERLINE FROM E TO TN; 5 NM EITHER SIDE OF CENTERLINE',
  'FOR ALTERNATE EXIT I; 5 NM EITHER SIDE OF CENTERLINE FROM',
  'TN AND XM.',
]

const IR107_ROWS = [
  '7.5 NM EITHER SIDE OF CENTERLINE FOR ENTIRE ROUTE',
  'TO INCLUDE EXITS AND ALTERNATE ENTRIES.',
]

const IR111_ROWS = [
  '4 NM EITHER SIDE OF CENTERLINE FROM A TO K;',
  '6 NM EITHER SIDE CENTERLINE FROM K TO S;',
  '4 NM EITHER SIDE OF CENTERLINE ON ALL ALTERNATE',
  'ENTRY/EXITS.',
]

const IR113_ROWS = [
  '5 NM EITHER SIDE OF CENTERLINE FROM A TO C;',
  '4 NM EITHER SIDE OF CENTERLINE FROM C TO D;',
  '5 NM EITHER SIDE OF CENTERLINE FROM D TO M2;',
  '5 NM EITHER SIDE OF CENTERLINE FOR ALL ALTERNATE ENTRIES AND EXITS.',
]

const IR109_ROWS = [
  '5 NM EITHER SIDE OF CENTERLINE FROM A TO E;',
  '3 NM LEFT AND 1 NM RIGHT OF CENTERLINE FROM E TO AO; 5 NM LEFT',
  'AND 3 NM RIGHT OF CENTERLINE FROM AO TO AP; 5 NM EITHER SIDE OF',
  'CENTERLINE FROM AP TO END OF ROUTE; 5 NM EITHER SIDE OF CENTERLINE',
  'FOR ALTERNATE ENTRY I AND EXITS J, P, AND AE; 4 NM EITHER SIDE OF',
  'CENTERLINE FOR ALTERNATE ENTRY M. ALTERNATE EXIT AO; 3 NM LEFT',
  'AND 1 NM RIGHT OF CENTERLINE FROM F TO AO; 4 NM EITHER SIDE OF',
  'CENTERLINE FROM AO TO AR. 5 NM EACH',
  'SIDE OF CENTERLINE FOR ALTERNATE ENTRY D1',
]

const IR133_ROWS = [
  'STARTING AT N33-17.2 W105-21.3 TO N33-32',
  'W105-08 TO N34-06 W104-58 TO N34-13 W105-05 TO N34-31',
  'W105-05 TO N34-32 W104-58 TO N34-42 W105-13 TO N34-42',
  'W106-14 TO N34-16 W106-30 TO N33-50 W106-30 VIA THE',
  'SOUTHERN BOUNDARY OF R-5107C TO N33-45 W106-04 TO N33-39',
  'W105-49 TO N34-27 W105-49 TO N34-22 W105-30 TO N33-35',
  'W105-14 TO N33-20 W105-26.2 TO BEGINNING. ALTERNATE ENTRY',
  'ELK: 2 NM EITHER SIDE OF CENTERLINE FROM A2 TO A.',
]

function points(ids) {
  return ids.map((ptIdent) => ({ ptIdent, lat: 0, lon: 0 }))
}

function leg(resolved, fromPt, toPt) {
  return resolved.legs.find((item) => item && item.fromPt === fromPt && item.toPt === toPt)
}

describe('joined FAA width clauses', () => {
  it('reads IR-112 after the CSV rows are joined', () => {
    const resolved = resolvePublishedLegWidths(
      points(['A', 'B', 'C', 'D', 'E', 'TN', 'XM']),
      IR112_ROWS
    )
    expect(resolved.status).toBe('published')
    expect(leg(resolved, 'A', 'B')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(leg(resolved, 'B', 'C')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(leg(resolved, 'C', 'D')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(leg(resolved, 'D', 'E')).toMatchObject({ leftNm: 5, rightNm: 4 })
    expect(leg(resolved, 'E', 'TN')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(leg(resolved, 'TN', 'XM')).toMatchObject({ leftNm: 5, rightNm: 5 })

    const withExit = resolvePublishedLegWidths(
      points(['A', 'D', 'E', 'TN', 'XM', 'I']),
      IR112_ROWS
    )
    expect(withExit.status).toBe('published')
    expect(leg(withExit, 'XM', 'I')).toMatchObject({ leftNm: 5, rightNm: 5 })
  })

  it('covers every IR-112 leg between TN and XM, including the later visit to XM', () => {
    const resolved = resolvePublishedLegWidths(
      points(['XM', 'TN', 'AA', 'AB', 'AC', 'AD', 'XM']),
      IR112_ROWS
    )
    expect(resolved.status).toBe('published')
    for (const [fromPt, toPt] of [
      ['XM', 'TN'],
      ['TN', 'AA'],
      ['AA', 'AB'],
      ['AB', 'AC'],
      ['AC', 'AD'],
      ['AD', 'XM'],
    ]) {
      expect(leg(resolved, fromPt, toPt)).toMatchObject({ leftNm: 5, rightNm: 5 })
    }
  })

  it('keeps IR-107, IR-111, and IR-113 on published widths', () => {
    const ir107 = resolvePublishedLegWidths(points(['A', 'B', 'C']), IR107_ROWS)
    expect(ir107.status).toBe('published')
    expect(leg(ir107, 'A', 'B')).toMatchObject({ leftNm: 7.5, rightNm: 7.5 })

    const ir111 = resolvePublishedLegWidths(points(['A', 'F', 'K', 'S']), IR111_ROWS)
    expect(ir111.status).toBe('published')
    expect(leg(ir111, 'A', 'F')).toMatchObject({ leftNm: 4, rightNm: 4 })
    expect(leg(ir111, 'F', 'K')).toMatchObject({ leftNm: 4, rightNm: 4 })
    expect(leg(ir111, 'K', 'S')).toMatchObject({ leftNm: 6, rightNm: 6 })

    const ir113 = resolvePublishedLegWidths(points(['A', 'B', 'C', 'D', 'M2']), IR113_ROWS)
    expect(ir113.status).toBe('published')
    expect(leg(ir113, 'A', 'B')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(leg(ir113, 'B', 'C')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(leg(ir113, 'C', 'D')).toMatchObject({ leftNm: 4, rightNm: 4 })
    expect(leg(ir113, 'D', 'M2')).toMatchObject({ leftNm: 5, rightNm: 5 })
  })

  it('reads IR-109 E–AO as 3/1 and applies 4 NM to alternate entry M and exit AO', () => {
    const spans = parseWidthTexts(IR109_ROWS)
    const eao = spans.find((span) => span.fromPt === 'E' && span.toPt === 'AO')
    expect(eao).toMatchObject({ leftNm: 3, rightNm: 1 })
    const alternate = spans.find((span) => span.alternatePoints?.includes('M'))
    expect(alternate?.alternatePoints).toEqual(expect.arrayContaining(['M', 'AO']))
    expect(alternate).toMatchObject({ leftNm: 4, rightNm: 4 })
    const resolved = resolvePublishedLegWidths(
      points(['A', 'E', 'AO', 'AP', 'F', 'AR']),
      IR109_ROWS
    )
    expect(resolved.status).toBe('published')
    expect(resolved.unparsed.some((clause) => clause.includes('ALTERNATE EXIT AO'))).toBe(false)
    expect(leg(resolved, 'E', 'AO')).toMatchObject({ leftNm: 3, rightNm: 1 })
  })

  it('leaves IR-133 coordinate text for pilot entry and shows that clause', () => {
    const resolved = resolvePublishedLegWidths(points(['A', 'B']), IR133_ROWS)
    expect(resolved.status).toBe('partial')
    expect(resolved.legs).toEqual([null])
    expect(resolved.missing[0]).toMatchObject({ fromPt: 'A', toPt: 'B', reason: 'unreadable' })
    expect(resolved.unparsed[0]).toMatch(/N33-17\.2/)
    expect(assembleWidthClauses(IR133_ROWS)).toHaveLength(1)
  })
})
