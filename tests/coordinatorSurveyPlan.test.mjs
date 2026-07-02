import { describe, expect, it } from 'vitest'
import { isCoordinatorSurveyAnchor } from '../src/utils/coordinatorSurveyPlan.ts'

describe('isCoordinatorSurveyAnchor', () => {
  const base = {
    id: '1',
    name: 'IR107',
    dateCreated: '',
    dateModified: '',
    isActive: false,
  }

  it('returns true for coordinatorSurvey load method', () => {
    expect(
      isCoordinatorSurveyAnchor({ ...base, creationLoadMethod: 'coordinatorSurvey' })
    ).toBe(true)
  })

  it('returns false for other load methods and missing field', () => {
    expect(isCoordinatorSurveyAnchor({ ...base, creationLoadMethod: 'sequence' })).toBe(false)
    expect(isCoordinatorSurveyAnchor({ ...base, creationLoadMethod: 'route' })).toBe(false)
    expect(isCoordinatorSurveyAnchor({ ...base })).toBe(false)
  })
})
