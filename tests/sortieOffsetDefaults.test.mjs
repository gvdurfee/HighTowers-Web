import { describe, expect, it } from 'vitest'
import {
  defaultSortieOffsetsForFragment,
  defaultSortieOffsetsLabelFromWidthTexts,
} from '../src/services/sortieOffsetDefaults.ts'

describe('sortieOffsetDefaults', () => {
  it('uses 3 NM only for 5 NM entire route', () => {
    expect(
      defaultSortieOffsetsLabelFromWidthTexts([
        '5 NM EITHER SIDE OF CENTERLINE FOR THE ENTIRE ROUTE',
      ])
    ).toBe('3')
  })

  it('uses four offsets for 20 NM corridor', () => {
    expect(
      defaultSortieOffsetsLabelFromWidthTexts([
        '20 NM EITHER SIDE OF CENTERLINE FROM A TO B',
      ])
    ).toBe('3, 9, 15, 21')
  })

  it('fragment on 5 NM route uses 3 for N→F sub-range', () => {
    const wps = [
      { ptIdent: 'N', lat: 35.0, lon: -103.0 },
      { ptIdent: 'E', lat: 35.05, lon: -103.05 },
      { ptIdent: 'F', lat: 35.1, lon: -103.1 },
    ]
    expect(
      defaultSortieOffsetsForFragment({
        routeType: 'IR',
        routeNumber: '107',
        widthTexts: ['5 NM EITHER SIDE OF CENTERLINE FOR THE ENTIRE ROUTE'],
        waypoints: wps,
        fromPt: 'N',
        toPt: 'F',
      })
    ).toBe('3')
  })
})
