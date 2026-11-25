import { db } from '@/db/schema'

export const TEAM_DISPATCH_KEY_PREFIXES = [
  'htw.teamDispatch.reviewed.',
  'htw.teamDispatch.awaitingSave.',
  'htw.teamDispatch.unsaved.',
  'htw.teamDispatch.sortiesStale.',
] as const

export const CONTENT_PACK_ZIP_PREFIX = 'contentPack.localZipName.'

export const KEPT_STORAGE_KEYS = [
  'hightowers.contentPackApiKey',
  'HighTowers.adminToken.v1',
  'htw.map.detailsOpen',
  'htw.map.detailsHintSeen',
  'HighTowers.hintsSeen.v1',
] as const

type KeyValueStore = {
  length: number
  key(index: number): string | null
  removeItem(key: string): void
}

type ClearableTable = { clear(): Promise<unknown> }

type MissionDatabase = {
  tables: ClearableTable[]
  transaction(mode: 'rw', tables: ClearableTable[], scope: () => Promise<void>): Promise<unknown>
  teamPlans: { delete(id: string): Promise<unknown> }
}

export function removePrefixedKeys(storage: KeyValueStore, prefixes: readonly string[]): string[] {
  const doomed: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) doomed.push(key)
  }
  for (const key of doomed) storage.removeItem(key)
  return doomed
}

export async function clearAllMissionData(
  database: MissionDatabase = db as unknown as MissionDatabase,
  local: KeyValueStore = localStorage,
  session: KeyValueStore = sessionStorage
): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    for (const table of database.tables) await table.clear()
  })
  removePrefixedKeys(local, TEAM_DISPATCH_KEY_PREFIXES)
  removePrefixedKeys(session, [CONTENT_PACK_ZIP_PREFIX])
}

export async function deletePlanTeamData(
  flightPlanId: string,
  database: Pick<MissionDatabase, 'teamPlans'> = db,
  local: Pick<KeyValueStore, 'removeItem'> = localStorage
): Promise<void> {
  await database.teamPlans.delete(flightPlanId)
  for (const prefix of TEAM_DISPATCH_KEY_PREFIXES) local.removeItem(`${prefix}${flightPlanId}`)
}
