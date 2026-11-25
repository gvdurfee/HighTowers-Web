import { describe, expect, it } from 'vitest'
import {
  CONTENT_PACK_ZIP_PREFIX,
  KEPT_STORAGE_KEYS,
  TEAM_DISPATCH_KEY_PREFIXES,
  clearAllMissionData,
  deletePlanTeamData,
} from '../src/services/clearAllMissionData.ts'
import { bannerRecommended, fetchPublishedVersionId, versionJsonUrl } from '../src/services/versionNotice.ts'

function memoryStore(seed) {
  const map = new Map(Object.entries(seed))
  return {
    get length() {
      return map.size
    },
    key(index) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key) {
      map.delete(key)
    },
    keys() {
      return [...map.keys()]
    },
  }
}

describe('clear all mission data', () => {
  it('clears every table and the Team Dispatch keys, and leaves the keep-list', async () => {
    const cleared = []
    const tables = ['teamPlans', 'cachedServerContentPacks', 'flightPlans'].map((name) => ({
      name,
      clear: async () => {
        cleared.push(name)
      },
    }))
    const database = {
      tables,
      transaction: async (_mode, _tables, scope) => scope(),
    }
    const local = memoryStore({
      'htw.teamDispatch.reviewed.plan-1': '1',
      'htw.teamDispatch.awaitingSave.plan-1': '1',
      'htw.teamDispatch.unsaved.plan-1': '1',
      'htw.teamDispatch.sortiesStale.plan-1': '1',
      'hightowers.contentPackApiKey': 'secret',
      'HighTowers.adminToken.v1': 'token',
      'htw.map.detailsOpen': '1',
      'htw.map.detailsHintSeen': '1',
      'HighTowers.hintsSeen.v1': '{}',
    })
    const session = memoryStore({
      [`${CONTENT_PACK_ZIP_PREFIX}mission-1`]: 'pack.zip',
      'other.session': 'keep',
    })
    await clearAllMissionData(database, local, session)
    expect(cleared).toEqual(['teamPlans', 'cachedServerContentPacks', 'flightPlans'])
    for (const prefix of TEAM_DISPATCH_KEY_PREFIXES) {
      expect(local.keys().some((key) => key.startsWith(prefix))).toBe(false)
    }
    for (const key of KEPT_STORAGE_KEYS) expect(local.keys()).toContain(key)
    expect(session.keys()).toEqual(['other.session'])
  })

  it('removes only that plan’s Team Dispatch keys', async () => {
    const deleted = []
    const local = {
      removed: [],
      removeItem(key) {
        this.removed.push(key)
      },
    }
    await deletePlanTeamData('plan-9', { teamPlans: { delete: async (id) => deleted.push(id) } }, local)
    expect(deleted).toEqual(['plan-9'])
    expect(local.removed).toEqual(TEAM_DISPATCH_KEY_PREFIXES.map((prefix) => `${prefix}plan-9`))
    expect(local.removed.some((key) => key.includes('plan-8'))).toBe(false)
  })
})

describe('version notice', () => {
  it('builds the Pages version URL from the base path', () => {
    expect(versionJsonUrl('/HighTowers-Web/', 5)).toBe('/HighTowers-Web/version.json?v=5')
    expect(versionJsonUrl('/HighTowers-Web', 5)).toBe('/HighTowers-Web/version.json?v=5')
  })

  it('recommends the banner only when the published id differs', () => {
    expect(bannerRecommended('abc', 'def')).toBe(true)
    expect(bannerRecommended('abc', 'abc')).toBe(false)
    expect(bannerRecommended('abc', null)).toBe(false)
  })

  it('returns null when version.json is missing or the fetch fails', async () => {
    const missing = await fetchPublishedVersionId('/', async () => ({ ok: false, json: async () => ({}) }))
    expect(missing).toBeNull()
    const failed = await fetchPublishedVersionId('/', async () => {
      throw new Error('offline')
    })
    expect(failed).toBeNull()
  })
})
