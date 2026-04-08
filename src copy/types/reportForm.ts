/** Air Force Report Form types - matches iPad AirForceReportData */

export type StructureType =
  | ''
  | 'Cell/Microwave'
  | 'Multiple Towers'
  | 'Other'

export type Lighting = '' | 'None' | 'Strobes' | 'Red' | 'Other'

export const STRUCTURE_OPTIONS: { value: StructureType; label: string }[] = [
  { value: '', label: 'Select' },
  { value: 'Cell/Microwave', label: 'Cell / Microwave' },
  { value: 'Multiple Towers', label: 'Multiple Towers' },
  { value: 'Other', label: 'Other' },
]

export const LIGHTING_OPTIONS: { value: Lighting; label: string }[] = [
  { value: '', label: 'Select' },
  { value: 'None', label: 'None' },
  { value: 'Strobes', label: 'Strobes' },
  { value: 'Red', label: 'Red' },
  { value: 'Other', label: 'Other' },
]

export interface TowerEntry {
  structureType: StructureType
  lighting: Lighting
  latitude: string
  longitude: string
  agl: string
  msl: string
  notes: string
}

export function defaultTowerEntries(): TowerEntry[] {
  return Array.from({ length: 6 }, () => ({
    structureType: '' as StructureType,
    lighting: '' as Lighting,
    latitude: '',
    longitude: '',
    agl: '',
    msl: '',
    notes: '',
  }))
}

export function fromPersistedStructure(value: string | undefined): StructureType {
  if (!value?.trim()) return ''
  if (value === 'Airfield') return 'Other'
  return (value as StructureType) || 'Other'
}

export function fromPersistedLighting(value: string | undefined): Lighting {
  if (!value?.trim()) return ''
  return (value as Lighting) || 'Other'
}
