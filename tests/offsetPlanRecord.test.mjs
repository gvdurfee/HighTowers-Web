import { describe, expect, it } from 'vitest'
import {
  assessSavedOffsetPlan,
  memoryOffsetPlanStore,
  offsetFormIsDirty,
  offsetSequenceSignature,
} from '../src/services/offsetPlanRecord.ts'

const waypoints = [
  { originalName: 'IR112-A', lat: 34.1, lon: -106.2 },
  { originalName: 'IR112-B', lat: 34.4, lon: -105.8 },
  { originalName: 'IR112-C', lat: 34.7, lon: -105.2 },
]

function samplePlan(signature) {
  return {
    flightPlanId: 'plan-ir112',
    savedAt: '2026-10-20T18:00:00.000Z',
    sequenceSignature: signature,
    widths: [
      { leftNm: 4, rightNm: 6 },
      { leftNm: 3, rightNm: 5 },
    ],
    mode: 'manual',
    manualMessage: 'Some FAA width text could not be read.',
    inner: [
      { ptIdent: 'A', g1000Name: 'LA112', lat: 34.11, lon: -106.19 },
      { ptIdent: 'B', g1000Name: 'LB112', lat: 34.41, lon: -105.79 },
      { ptIdent: 'C', g1000Name: 'LC112', lat: 34.71, lon: -105.19 },
    ],
    outer: [
      { ptIdent: 'A', g1000Name: 'RA112', lat: 34.09, lon: -106.22 },
      { ptIdent: 'B', g1000Name: 'RB112', lat: 34.39, lon: -105.82 },
      { ptIdent: 'C', g1000Name: 'RC112', lat: 34.69, lon: -105.22 },
    ],
    corridorLeft: [
      { ptIdent: 'A', lat: 34.12, lon: -106.18 },
      { ptIdent: 'B', lat: 34.42, lon: -105.78 },
    ],
    corridorRight: [
      { ptIdent: 'A', lat: 34.08, lon: -106.24 },
      { ptIdent: 'B', lat: 34.38, lon: -105.84 },
    ],
    flags: [],
  }
}

describe('saved offset plans', () => {
  it('restores widths and tracks after save, leave, and return', async () => {
    const signature = offsetSequenceSignature(waypoints)
    const store = memoryOffsetPlanStore()
    const plan = samplePlan(signature)
    await store.put(plan)

    const reloaded = assessSavedOffsetPlan(await store.get(plan.flightPlanId), signature)
    expect(reloaded.status).toBe('match')
    if (reloaded.status !== 'match') return
    expect(reloaded.plan.widths).toEqual(plan.widths)
    expect(reloaded.plan.inner).toEqual(plan.inner)
    expect(reloaded.plan.outer).toEqual(plan.outer)
    expect(reloaded.plan.corridorLeft).toEqual(plan.corridorLeft)
    expect(reloaded.plan.corridorRight).toEqual(plan.corridorRight)
  })

  it('does not reuse widths when the waypoint sequence changed', async () => {
    const signature = offsetSequenceSignature(waypoints)
    const store = memoryOffsetPlanStore()
    await store.put(samplePlan(signature))
    const changed = offsetSequenceSignature([
      waypoints[0],
      { originalName: 'IR112-D', lat: 34.5, lon: -105.4 },
      waypoints[2],
    ])
    const reloaded = assessSavedOffsetPlan(await store.get('plan-ir112'), changed)
    expect(reloaded.status).toBe('mismatch')
    expect(reloaded.savedAt).toBe('2026-10-20T18:00:00.000Z')
    expect(reloaded.plan).toBeUndefined()
  })

  it('treats an edited width row as unsaved', () => {
    const baseline = JSON.stringify([
      { left: '4', right: '6' },
      { left: '3', right: '5' },
    ])
    const edited = JSON.stringify([
      { left: '4', right: '8' },
      { left: '3', right: '5' },
    ])
    expect(offsetFormIsDirty(baseline, baseline)).toBe(false)
    expect(offsetFormIsDirty(baseline, edited)).toBe(true)
  })
})
