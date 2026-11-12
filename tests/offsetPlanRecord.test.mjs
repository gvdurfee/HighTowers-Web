import { describe, expect, it } from 'vitest'
import {
  assessSavedOffsetPlan,
  blankTrackRecord,
  freshnessForSavedPlan,
  memoryOffsetPlanStore,
  OFFSET_PLAN_VERSION,
  offsetFormIsDirty,
  offsetPlanFingerprint,
  offsetSequenceSignature,
  SPUR_PROPOSAL_VERSION,
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

function currentFor(plan, overrides = {}) {
  return freshnessForSavedPlan({
    waypoints,
    saved: plan,
    sortie1Side: 'inner',
    departureIdent: 'KABQ',
    destinationIdent: 'KAEG',
    ...overrides,
  })
}

function versioned(plan, overrides = {}) {
  const freshness = {
    waypoints,
    widths: plan.widths,
    trackOffsets: plan.widths.map(() => blankTrackRecord()),
    sortie1Side: 'inner',
    departureIdent: 'KABQ',
    destinationIdent: 'KAEG',
    spurDecision: 'unset',
    spurProposalVersion: SPUR_PROPOSAL_VERSION,
    ...overrides,
  }
  return {
    ...plan,
    ...overrides,
    planVersion: OFFSET_PLAN_VERSION,
    trackOffsets: freshness.trackOffsets,
    sortie1Side: freshness.sortie1Side,
    departureIdent: freshness.departureIdent,
    destinationIdent: freshness.destinationIdent,
    spurDecision: freshness.spurDecision,
    spurProposalVersion: freshness.spurProposalVersion,
    fingerprint: offsetPlanFingerprint(freshness),
  }
}

describe('saved offset plans', () => {
  it('restores a versioned plan after save, leave, and return', async () => {
    const signature = offsetSequenceSignature(waypoints)
    const store = memoryOffsetPlanStore()
    const plan = versioned(samplePlan(signature))
    await store.put(plan)

    const reloaded = assessSavedOffsetPlan(await store.get(plan.flightPlanId), currentFor(plan))
    expect(reloaded.status).toBe('match')
    if (reloaded.status !== 'match') return
    expect(reloaded.plan.widths).toEqual(plan.widths)
    expect(reloaded.plan.inner).toEqual(plan.inner)
    expect(reloaded.plan.outer).toEqual(plan.outer)
    expect(reloaded.plan.corridorLeft).toEqual(plan.corridorLeft)
    expect(reloaded.plan.corridorRight).toEqual(plan.corridorRight)
  })

  it('treats an unversioned payload as stale even when the waypoint sequence matches', async () => {
    const signature = offsetSequenceSignature(waypoints)
    const plan = samplePlan(signature)
    const decision = assessSavedOffsetPlan(plan, currentFor(plan))
    expect(decision.status).toBe('stale')
    expect(decision.reason).toBe('legacy')
  })

  it('does not reuse widths when the waypoint sequence changed', async () => {
    const signature = offsetSequenceSignature(waypoints)
    const store = memoryOffsetPlanStore()
    const plan = versioned(samplePlan(signature))
    await store.put(plan)
    const changed = [
      waypoints[0],
      { originalName: 'VR114-D', lat: 34.5, lon: -105.4 },
      waypoints[2],
    ]
    const reloaded = assessSavedOffsetPlan(
      await store.get('plan-ir112'),
      currentFor(plan, { waypoints: changed })
    )
    expect(reloaded.status).toBe('stale')
    expect(reloaded.reason).toBe('sequence')
    expect(reloaded.savedAt).toBe('2026-10-20T18:00:00.000Z')
    expect(reloaded.plan).toBeUndefined()
  })

  it('goes stale when only the track offset, width, or airport changes, and a side change does not', () => {
    const plan = versioned(samplePlan(offsetSequenceSignature(waypoints)))
    const base = currentFor(plan)
    expect(assessSavedOffsetPlan(plan, base).status).toBe('match')
    const offsetOnly = {
      ...base,
      trackOffsets: base.trackOffsets.map((track, index) =>
        index === 0 ? { ...track, leftMode: 'explicit', leftNm: 2.5 } : track
      ),
    }
    const widthOnly = {
      ...base,
      widths: base.widths.map((width, index) => (index === 0 ? { ...width, leftNm: width.leftNm + 1 } : width)),
    }
    expect(assessSavedOffsetPlan(plan, offsetOnly).reason).toBe('fingerprint')
    expect(assessSavedOffsetPlan(plan, widthOnly).reason).toBe('fingerprint')
    expect(assessSavedOffsetPlan(plan, { ...base, sortie1Side: 'outer' }).status).toBe('match')
    expect(assessSavedOffsetPlan(plan, { ...base, sortie1Side: null }).status).toBe('match')
    expect(assessSavedOffsetPlan(plan, { ...base, departureIdent: 'KFLG' }).reason).toBe('fingerprint')
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
