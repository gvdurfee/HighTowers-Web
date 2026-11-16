import { describe, expect, it } from 'vitest'
import { readMtrWidth } from '../shared/survey-planning/mtrWidthParser.js'
import { resolvePublishedLegWidths } from '../shared/survey-planning/offsetRoutePlan.js'
import {
  downloadBlockReason,
  mergeReloadedWidths,
  pilotEntryMessage,
  publishedWidthNote,
} from '../src/services/offsetPilotEntry.ts'

/** Real WIDTH_TEXT rows from server/.mtr-cache/2026-10-01_MTR_WDTH.csv. */
const IR038_ROWS = ['10 NM EITHER SIDE OF CENTERLINE.']
const IR185_ROWS = [
  '3 NM LEFT AND 2 NM RIGHT OF CENTERLINE FROM A TO C,',
  '3 NM LEFT AND 4 NM RIGHT OF CENTERLINE FROM C TO E,',
  '3 NM EITHER SIDE OF CENTERLINE FROM E TO G,',
  '4 NM EITHER SIDE OF CENTERLINE FROM G TO H,',
  '3 NM LEFT AND 4 NM RIGHT OF CENTERLINE FROM H TO I,',
  '2 NM LEFT AND 4 NM RIGHT OF CENTERLINE FROM I TO K.',
]
const IR139_ROWS = [
  '5 NM EITHER SIDE OF CENTERLINE A TO D; 10',
  'NM EITHER SIDE OF CENTERLINE D TO E; 5 NM EITHER SIDE OF',
  'CENTERLINE E TO F.',
]
const IR103_ROWS = ['10 NM EITHER SIDE OF COURSE FROM A TO D; 2', 'NM EITHER SIDE OF COURSE FROM D TO F.']
const VR259_ROWS = [
  '3NM EITHER SIDE OF CENTERLINE FROM A TO E;',
  '3NM EITHER SIDE OF CENTERLINE FROM E TO K; 4NM EITHER SIDE OF',
  'CENTERLINE FROM K TO L.',
]
const IR117_ROWS = [
  '3 NM EITHER SIDE OF CENTERLINE FROM A TO  D;',
  '2 NM EITHER SIDE OF CENTERLINE FROM D TO  E;',
  '2 NM LEFT AND 10 NM RIGHT OF CENTERLINE FROM E TO  F;',
  '2 NM EITHER SIDE OF CENTERLINE FROM F TO G (UNTIL ENTERING R-2402).',
]
const IR112_ROWS = [
  '5 NM EITHER SIDE OF CENTERLINE FROM A TO D;',
  '5 NM LEFT AND 4 NM RIGHT OF CENTERLINE FROM D TO E; 5 NM EITHER',
  'SIDE OF CENTERLINE FROM E TO TN; 5 NM EITHER SIDE OF CENTERLINE',
  'FOR ALTERNATE EXIT I; 5 NM EITHER SIDE OF CENTERLINE FROM',
  'TN AND XM.',
]
const IR112_CHAIN = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'EH', 'I', 'J', 'EK', 'L', 'XM', 'TN', 'O', 'TN*',
  'AA', 'AB', 'AC', 'AD', 'XM*', 'EH1', 'I1', 'EK1', 'L1', 'I*', 'XI', 'L2', 'XM1',
]
const VR222_ROWS = [
  '5 NM EITHER SIDE OF CENTERLINE FROM A TO D;',
  '5 NM LEFT AND 3 NM RIGHT OF CENTERLINE FROM D TO E;',
  '5 NM EITHER SIDE OF CENTERLINE FROM E TO G.',
]
const VR222_CHAIN = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'C1', 'E1', 'E2', 'E2X', 'EE1', 'E2*', 'E3', 'E3X']
const IR133_ROWS = [
  'STARTING AT N33-17.2 W105-21.3 TO N33-32 W105-08 TO BEGINNING.',
]

function points(ids) {
  return ids.map((ptIdent) => ({ ptIdent, lat: 0, lon: 0 }))
}

function leg(resolved, fromPt, toPt) {
  return resolved.legs.find((item) => item && item.fromPt === fromPt && item.toPt === toPt)
}

describe('width reader coverage fixes', () => {
  it('applies a lone width with no endpoints to every primary leg', () => {
    const resolved = resolvePublishedLegWidths(points(['A', 'B', 'C', 'D', 'E', 'F', 'G']), IR038_ROWS)
    expect(resolved.status).toBe('published')
    expect(leg(resolved, 'A', 'B')).toMatchObject({ leftNm: 10, rightNm: 10 })
    expect(leg(resolved, 'F', 'G')).toMatchObject({ leftNm: 10, rightNm: 10 })
  })

  it('splits several widths in one FAA sentence and keeps each span', () => {
    const resolved = resolvePublishedLegWidths(
      points(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']),
      IR185_ROWS
    )
    expect(resolved.status).toBe('published')
    expect(leg(resolved, 'A', 'B')).toMatchObject({ leftNm: 3, rightNm: 2 })
    expect(leg(resolved, 'C', 'D')).toMatchObject({ leftNm: 3, rightNm: 4 })
    expect(leg(resolved, 'I', 'J')).toMatchObject({ leftNm: 2, rightNm: 4 })
  })

  it('accepts a missing FROM, OF COURSE, a missing space before NM, and a parenthetical exclusion', () => {
    const missingFrom = resolvePublishedLegWidths(points(['A', 'B', 'C', 'D', 'E', 'F']), IR139_ROWS)
    expect(missingFrom.status).toBe('published')
    expect(leg(missingFrom, 'C', 'D')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(leg(missingFrom, 'D', 'E')).toMatchObject({ leftNm: 10, rightNm: 10 })

    const course = resolvePublishedLegWidths(points(['A', 'B', 'C', 'D', 'E', 'F']), IR103_ROWS)
    expect(course.status).toBe('published')
    expect(leg(course, 'A', 'B')).toMatchObject({ leftNm: 10, rightNm: 10 })
    expect(leg(course, 'D', 'E')).toMatchObject({ leftNm: 2, rightNm: 2 })

    const tight = resolvePublishedLegWidths(
      points(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']),
      VR259_ROWS
    )
    expect(tight.status).toBe('published')
    expect(leg(tight, 'K', 'L')).toMatchObject({ leftNm: 4, rightNm: 4 })

    const excluded = readMtrWidth(IR117_ROWS)
    expect(excluded.exclusions.join(' ')).toMatch(/R-2402/)
    const ir117 = resolvePublishedLegWidths(points(['A', 'B', 'C', 'D', 'E', 'F', 'G']), IR117_ROWS)
    expect(ir117.status).toBe('published')
    expect(leg(ir117, 'F', 'G')).toMatchObject({ leftNm: 2, rightNm: 2 })
    expect(leg(ir117, 'E', 'F')).toMatchObject({ leftNm: 2, rightNm: 10 })
  })

  it('covers the published IR-112 chain through XM* and leaves the spur after XM*', () => {
    const resolved = resolvePublishedLegWidths(points(IR112_CHAIN), IR112_ROWS)
    expect(resolved.status).toBe('partial')
    expect(leg(resolved, 'D', 'E')).toMatchObject({ leftNm: 5, rightNm: 4 })
    expect(leg(resolved, 'TN', 'O')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(leg(resolved, 'O', 'TN*')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(leg(resolved, 'AD', 'XM*')).toMatchObject({ leftNm: 5, rightNm: 5 })
    for (const [fromPt, toPt] of [
      ['XM*', 'EH1'],
      ['EH1', 'I1'],
      ['L2', 'XM1'],
    ]) {
      const gap = resolved.missing.find((leg) => leg.fromPt === fromPt && leg.toPt === toPt)
      expect(gap?.reason).toBe('not-covered')
    }
  })

  it('fills VR-222 A–G and leaves the later E2* spur for the pilot', () => {
    const resolved = resolvePublishedLegWidths(points(VR222_CHAIN), VR222_ROWS)
    expect(resolved.status).toBe('partial')
    expect(leg(resolved, 'A', 'B')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(leg(resolved, 'D', 'E')).toMatchObject({ leftNm: 5, rightNm: 3 })
    expect(leg(resolved, 'F', 'G')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(resolved.missing.find((leg) => leg.fromPt === 'E2*' && leg.toPt === 'E3')?.reason).toBe(
      'not-covered'
    )
    const starred = resolvePublishedLegWidths(points(VR222_CHAIN), [
      ...VR222_ROWS,
      '4 NM EITHER SIDE OF CENTERLINE FROM E2 TO E3',
    ])
    expect(leg(starred, 'E2*', 'E3')).toMatchObject({ leftNm: 4, rightNm: 4 })
    expect(leg(starred, 'EE1', 'E2*')).toMatchObject({ leftNm: 4, rightNm: 4 })
  })

  it('does not parse coordinate width text', () => {
    const resolved = resolvePublishedLegWidths(points(['A', 'B']), IR133_ROWS)
    expect(resolved.status).toBe('partial')
    expect(resolved.missing[0].reason).toBe('unreadable')
    expect(resolved.unparsed[0]).toMatch(/N33-17\.2/)
  })

  it('fills readable legs and asks the pilot only for the blank ones', () => {
    const resolved = resolvePublishedLegWidths(points(['A', 'B', 'Z']), [
      '5 NM EITHER SIDE OF CENTERLINE FROM A TO B',
      'WIDTH DEFINED BY COORDINATES N33-10 W106-00',
    ])
    expect(resolved.status).toBe('partial')
    expect(leg(resolved, 'A', 'B')).toMatchObject({ leftNm: 5, rightNm: 5 })
    expect(resolved.missing[0]).toMatchObject({ fromPt: 'B', toPt: 'Z', reason: 'unreadable' })
    const filled = resolved.legs.filter(Boolean).length
    expect(pilotEntryMessage(filled, resolved.legs.length)).toMatch(/filled for 1 of 2 legs/)
    expect(pilotEntryMessage(filled, resolved.legs.length)).toMatch(/AP\/1B or Military Flight Bag/)
  })

  it('keeps downloads off until every leg has both widths, and keeps pilot entries on reload', () => {
    const blank = [
      { left: '5', right: '5', source: 'faa', reason: null, clause: null },
      { left: '', right: '', source: 'empty', reason: 'not-covered', clause: null },
    ]
    expect(downloadBlockReason(blank)).toMatch(/every leg/)
    const ready = [
      { left: '5', right: '5', source: 'faa', reason: null, clause: null },
      { left: '4', right: '4', source: 'pilot', reason: 'not-covered', clause: null },
    ]
    expect(downloadBlockReason(ready)).toBeNull()
    const reloaded = mergeReloadedWidths(
      [
        { left: '6', right: '6', source: 'faa', reason: null, clause: null },
        { left: '', right: '', source: 'empty', reason: 'not-covered', clause: null },
      ],
      ready
    )
    expect(reloaded[0]).toMatchObject({ left: '6', right: '6', source: 'faa' })
    expect(reloaded[1]).toMatchObject({ left: '4', right: '4', source: 'pilot' })
  })

  it('builds the offset note from the route widths and names each width once', () => {
    const resolved = resolvePublishedLegWidths(points(IR112_CHAIN), IR112_ROWS)
    const legs = resolved.legs.filter(Boolean)
    const note = publishedWidthNote('IR112', legs)
    expect(note).toBe('Tracks: first 2.5 NM, then every 5 NM, to the published edge.')
    expect(publishedWidthNote('IR112', legs, true)).toBe(`${note} Some widths entered by pilot.`)
    expect(
      publishedWidthNote('IR038', [
        { fromPt: 'A', toPt: 'B', leftNm: 10, rightNm: 10 },
        { fromPt: 'B', toPt: 'C', leftNm: 10, rightNm: 10 },
      ])
    ).toBe('Tracks: first 2.5 NM, then every 5 NM, to the published edge.')
    expect(
      publishedWidthNote('VR100', [
        { fromPt: 'A', toPt: 'B', leftNm: 5, rightNm: 4 },
        { fromPt: 'B', toPt: 'C', leftNm: 5, rightNm: 5 },
        { fromPt: 'C', toPt: 'D', leftNm: 5, rightNm: 4 },
      ])
    ).toBe('Tracks: first 2.5 NM, then every 5 NM, to the published edge.')
    expect(publishedWidthNote('IR112', [])).toBeNull()
  })
})
