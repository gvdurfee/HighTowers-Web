import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { MissionRecord, WaypointRecord } from '@/db/schema'
import { generateId } from '@/utils/id'
import {
  defaultTowerEntries,
  fromPersistedStructure,
  fromPersistedLighting,
  STRUCTURE_OPTIONS,
  LIGHTING_OPTIONS,
  type TowerEntry,
  type StructureType,
  type Lighting,
} from '@/types/reportForm'
import {
  buildRouteSurveyTowerNotes,
  routeSurveyAglField,
  routeSurveyMslField,
} from '@/utils/routeSurveyTowerRow'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'
import {
  ADDITIONAL_NOTES_DEFAULT,
  ADDITIONAL_NOTES_MAX_LENGTH,
  clampAdditionalNotesInput,
} from '@/constants/reportCopy'

const HINT_REPORT_MISSION = 'reportForm.mission'
const HINT_REPORT_SAVE_FP = 'reportForm.saveFlightPlan'
const HINT_REPORT_POC = 'reportForm.pointOfContact'
const HINT_REPORT_MISSION_INFO = 'reportForm.missionInfo'
const HINT_REPORT_TOWERS = 'reportForm.towerObservations'
const HINT_REPORT_NOTES = 'reportForm.additionalNotes'

function missionNotesForForm(mission: MissionRecord): string {
  const t = (mission.notes ?? '').trim()
  return t.length > 0 ? t : ADDITIONAL_NOTES_DEFAULT
}

function notesToPersist(textareaValue: string): string | undefined {
  const t = textareaValue.trim()
  if (!t || t === ADDITIONAL_NOTES_DEFAULT) return undefined
  return t
}

function formatCoordinate(value: number, isLatitude: boolean): string {
  const direction = isLatitude ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  const absVal = Math.abs(value)
  const d = Math.floor(absVal)
  const m = (absVal - d) * 60
  return `${direction}${d}°${m.toFixed(2)}'`
}

function parseDate(s: string): Date | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  const mmddyyyyNoSlashes = trimmed.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (mmddyyyyNoSlashes) {
    const [, m, d, y] = mmddyyyyNoSlashes
    const date = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(d!, 10))
    return isNaN(date.getTime()) ? null : date
  }
  const mmddyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mmddyyyy) {
    const [, m, d, y] = mmddyyyy
    const date = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(d!, 10))
    return isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(trimmed)
  return isNaN(parsed.getTime()) ? null : parsed
}

function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

/** MTR route: uppercase letters and digits only (e.g. IR111, VR108) */
function normalizeMtrRouteInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8) // MMDDYYYY
  const mm = digits.slice(0, 2)
  const dd = digits.slice(2, 4)
  const yyyy = digits.slice(4, 8)
  if (digits.length <= 2) return mm
  if (digits.length <= 4) return `${mm}/${dd}`
  return `${mm}/${dd}/${yyyy}`
}

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10) // XXXXXXXXXX
  const a = digits.slice(0, 3)
  const b = digits.slice(3, 6)
  const c = digits.slice(6, 10)
  if (digits.length <= 3) return a
  if (digits.length <= 6) return `${a}-${b}`
  return `${a}-${b}-${c}`
}

export function ReportFormPage() {
  const navigate = useNavigate()
  const { isSeen, markSeen, resetAll } = useHintsSeen()
  const missions = useLiveQuery(() =>
    db.missions.toArray().then((a) => a.sort((x, y) => y.date.localeCompare(x.date)))
  )
  const flightPlans = useLiveQuery(() =>
    db.flightPlans.toArray().then((a) => a.sort((x, y) => x.name.localeCompare(y.name)))
  )

  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const [pocName, setPocName] = useState('')
  const [capUnit, setCapUnit] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [missionNumber, setMissionNumber] = useState('')
  const [mtrRoute, setMtrRoute] = useState('')
  const [date, setDate] = useState('')
  const [additionalNotes, setAdditionalNotes] = useState(ADDITIONAL_NOTES_DEFAULT)
  const [towerEntries, setTowerEntries] = useState<TowerEntry[]>(defaultTowerEntries())
  const [selectedFlightPlanToAssociate, setSelectedFlightPlanToAssociate] = useState<string | null>(null)
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  const selectedMission = selectedMissionId
    ? (missions ?? []).find((m) => m.id === selectedMissionId)
    : null

  const isComplete =
    !!pocName.trim() &&
    !!capUnit.trim() &&
    !!phone.trim() &&
    !!email.trim() &&
    !!missionNumber.trim() &&
    !!mtrRoute.trim() &&
    !!date.trim()

  const loadTowerEntries = useCallback(
    async (mission: MissionRecord) => {
      const reports = await db.towerReports
        .where('missionId')
        .equals(mission.id)
        .sortBy('reportDate')
      const locations = await Promise.all(
        reports.map((r) => db.towerLocations.get(r.towerLocationId))
      )
      let wps: WaypointRecord[] = []
      if (mission.flightPlanId) {
        wps = await db.waypoints
          .where('flightPlanId')
          .equals(mission.flightPlanId)
          .sortBy('sequence')
      }
      const entries = defaultTowerEntries()
      for (let i = 0; i < Math.min(reports.length, 6); i++) {
        const r = reports[i]
        const loc = locations[i]
        if (!loc) continue
        const notes = buildRouteSurveyTowerNotes(loc, wps, r.notes)
        entries[i] = {
          structureType: fromPersistedStructure(r.structureType),
          lighting: fromPersistedLighting(r.structureLighting),
          latitude: formatCoordinate(loc.latitude, true),
          longitude: formatCoordinate(loc.longitude, false),
          agl: routeSurveyAglField(loc, r.estimatedHeight),
          msl: routeSurveyMslField(loc),
          notes,
        }
      }
      setTowerEntries(entries)
    },
    []
  )

  const populateFromMission = useCallback((mission: MissionRecord) => {
    setPocName(mission.pocName ?? '')
    setCapUnit(mission.capUnit ?? '')
    setPhone(formatPhoneInput(mission.phone ?? ''))
    setEmail(mission.email ?? '')
    setMissionNumber(mission.missionNumber ?? '')
    setMtrRoute(normalizeMtrRouteInput(mission.mtrRoute ?? ''))
    setDate(mission.date ? formatDateForDisplay(new Date(mission.date)) : '')
    setAdditionalNotes(clampAdditionalNotesInput(missionNotesForForm(mission)))
  }, [])

  useEffect(() => {
    if (selectedMission && date) {
      loadTowerEntries(selectedMission)
    } else if (!selectedMissionId) {
      setTowerEntries(defaultTowerEntries())
    }
  }, [selectedMissionId, selectedMission, date, loadTowerEntries])

  useEffect(() => {
    if (selectedMission) {
      populateFromMission(selectedMission)
      loadTowerEntries(selectedMission)
    }
  }, [selectedMission?.id])

  useEffect(() => {
    if (missions && missions.length > 0 && !selectedMissionId && !missionNumber && !mtrRoute) {
      const recent = missions.find(
        (m) =>
          m.missionNumber &&
          m.mtrRoute &&
          !m.isCompleted
      )
      if (recent) {
        setSelectedMissionId(recent.id)
        populateFromMission(recent)
      }
    }
  }, [missions, selectedMissionId, missionNumber, mtrRoute, populateFromMission])

  const saveMission = async () => {
    setErrorMessage(null)
    const mn = missionNumber.trim()
    const mtr = mtrRoute.trim()
    const dateStr = date.trim()
    if (!mn || !mtr || !dateStr) {
      setErrorMessage('Please fill in Mission Number, MTR Route, and Date')
      return
    }
    const missionDate = parseDate(dateStr)
    if (!missionDate) {
      setErrorMessage('Invalid date format. Use MM/DD/YYYY')
      return
    }

    try {
      if (selectedMission) {
        await db.missions.update(selectedMission.id, {
          missionNumber: mn,
          mtrRoute: mtr,
          date: missionDate.toISOString(),
          name: `Mission ${mn} - ${mtr}`,
          pocName: pocName.trim() || undefined,
          capUnit: capUnit.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          notes: notesToPersist(additionalNotes),
        })
        const sortedReports = (
          await db.towerReports.where('missionId').equals(selectedMission.id).toArray()
        ).sort((a, b) => a.reportDate.localeCompare(b.reportDate))
        for (let i = 0; i < Math.min(towerEntries.length, sortedReports.length); i++) {
          await db.towerReports.update(sortedReports[i].id, {
            structureType: towerEntries[i].structureType || undefined,
            structureLighting: towerEntries[i].lighting || undefined,
            notes: towerEntries[i].notes.trim() || undefined,
          })
        }
        setShowSaveConfirmation(true)
        setTimeout(() => setShowSaveConfirmation(false), 2000)
      } else {
        const missionName = `Mission ${mn} - ${mtr}`
        const missionId = generateId()
        let flightPlanId: string | undefined
        const mtrUpper = mtr.toUpperCase()
        const plan = (flightPlans ?? []).find((p) => {
          const name = p.name.trim().toUpperCase()
          return name === mtrUpper || name.startsWith(mtrUpper + ' ') || name.startsWith(mtrUpper + '-')
        })
        if (plan) flightPlanId = plan.id

        await db.missions.add({
          id: missionId,
          name: missionName,
          date: missionDate.toISOString(),
          missionNumber: mn,
          mtrRoute: mtr,
          pocName: pocName.trim() || undefined,
          capUnit: capUnit.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          notes: notesToPersist(additionalNotes),
          isCompleted: false,
          flightPlanId,
        })
        setSelectedMissionId(missionId)
        setShowSaveConfirmation(true)
        setTimeout(() => setShowSaveConfirmation(false), 2000)
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  const associateFlightPlan = async () => {
    if (!selectedMission || !selectedFlightPlanToAssociate) return
    await db.missions.update(selectedMission.id, {
      flightPlanId: selectedFlightPlanToAssociate,
    })
    setSelectedFlightPlanToAssociate(null)
    const updated = await db.missions.get(selectedMission.id)
    if (updated) {
      setSelectedMissionId(null)
      setTimeout(() => setSelectedMissionId(updated.id), 0)
      loadTowerEntries(updated)
    }
  }

  const clearForm = () => {
    setSelectedMissionId(null)
    setPocName('')
    setCapUnit('')
    setPhone('')
    setEmail('')
    setMissionNumber('')
    setMtrRoute('')
    setDate('')
    setAdditionalNotes(ADDITIONAL_NOTES_DEFAULT)
    setTowerEntries(defaultTowerEntries())
  }

  const updateTowerEntry = (index: number, updates: Partial<TowerEntry>) => {
    setTowerEntries((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
  }

  return (
    <div className="app-page-shell overflow-auto">
      <div className="app-panel max-w-4xl mx-auto p-6 md:p-8">
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Air Force Report Form</h1>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <button
            type="button"
            onClick={resetAll}
            className="px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            aria-label="Reset guided tour hints"
          >
            Reset hints
          </button>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="p-2 text-cap-pimento hover:bg-red-50 rounded-full"
            aria-label="Help"
          >
            ❓
          </button>
          <GuidedHint
            hintId={HINT_REPORT_MISSION}
            stepNumber={1}
            title="Mission selection"
            body="Pick the mission you are reporting on, or start by filling Mission Information below and creating a new mission. The form loads saved POC details, dates, and any mission notes from storage."
            isSeen={isSeen(HINT_REPORT_MISSION)}
            onDismiss={markSeen}
            surface="light"
          />
          <select
            value={selectedMissionId ?? ''}
            onChange={(e) => {
              const id = e.target.value || null
              setSelectedMissionId(id)
              if (id) {
                const m = (missions ?? []).find((x) => x.id === id)
                if (m) populateFromMission(m)
              }
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select Mission</option>
            {(missions ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-6">
        {/* Header */}
        <section className="p-4 bg-white rounded-xl border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 text-center">
            AIR FORCE ROUTE SURVEY REPORT
          </h2>
          <div className="flex gap-4 items-center">
            <label className="text-sm font-medium text-gray-700 w-24">Date</label>
            <input
              type="text"
              value={date}
              onChange={(e) => setDate(formatDateInput(e.target.value))}
              placeholder="MM/DD/YYYY"
              inputMode="numeric"
              maxLength={10}
              className="flex-1 max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </section>

        {/* Save */}
        <section className="p-4 bg-white rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center gap-4">
            <GuidedHint
              hintId={HINT_REPORT_SAVE_FP}
              stepNumber={2}
              title="Save and flight plan"
              body="Create or update the mission once Mission Number, MTR Route, and Date are set. Associate a flight plan when prompted so tower notes can include distance and true bearing from the route."
              isSeen={isSeen(HINT_REPORT_SAVE_FP)}
              onDismiss={markSeen}
              surface="light"
            />
            <button
              type="button"
              onClick={saveMission}
              disabled={!missionNumber.trim() || !mtrRoute.trim() || !date.trim()}
              className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
            >
              {selectedMission ? 'Save Mission Changes' : 'Create Mission'}
            </button>
            {selectedMission && (
              <span className="text-sm text-gray-500">
                Editing: {selectedMission.name}
              </span>
            )}
            {showSaveConfirmation && (
              <span className="text-sm text-green-600 font-medium flex items-center gap-2">
                ✓ Mission saved successfully!
              </span>
            )}
          </div>

          {selectedMission && !selectedMission.flightPlanId && (flightPlans ?? []).length > 0 && (
            <div className="mt-4 p-4 bg-cap-yellow/20 rounded-lg border border-cap-yellow/50">
              <p className="text-sm text-gray-700 mb-3">
                No flight plan associated. Notes cannot be computed until you associate one.
              </p>
              <div className="flex gap-3 items-center">
                <select
                  value={selectedFlightPlanToAssociate ?? ''}
                  onChange={(e) => setSelectedFlightPlanToAssociate(e.target.value || null)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Select Flight Plan</option>
                  {(flightPlans ?? []).map((fp) => (
                    <option key={fp.id} value={fp.id}>
                      {fp.name}
                    </option>
                  ))}
                </select>
                {selectedFlightPlanToAssociate && (
                  <button
                    type="button"
                    onClick={associateFlightPlan}
                    className="px-3 py-2 bg-cap-ultramarine text-white rounded-lg text-sm"
                  >
                    Associate
                  </button>
                )}
              </div>
            </div>
          )}

          {selectedMission && (
            <p className="mt-4 text-sm text-gray-600">
              As each reported tower data is analyzed, its distance and True bearing from
              the route&apos;s closest waypoint will be computed and added to the Notes for
              the Tower Observation.
            </p>
          )}
        </section>

        {/* POC */}
        <section className="p-4 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="font-semibold text-gray-900">Point of Contact</h2>
            <GuidedHint
              hintId={HINT_REPORT_POC}
              stepNumber={3}
              title="Point of contact"
              body="Enter the customer POC exactly as it should appear on the report: name, CAP unit, phone, and email are required before you can generate the PDF."
              isSeen={isSeen(HINT_REPORT_POC)}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">POC Name</label>
              <input
                type="text"
                value={pocName}
                onChange={(e) => setPocName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CAP Unit</label>
              <input
                type="text"
                value={capUnit}
                onChange={(e) => setCapUnit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                inputMode="numeric"
                maxLength={12}
                placeholder="XXX-XXX-XXXX"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </section>

        {/* Mission Info */}
        <section className="p-4 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="font-semibold text-gray-900">Mission Information</h2>
            <GuidedHint
              hintId={HINT_REPORT_MISSION_INFO}
              stepNumber={4}
              title="Mission identifiers"
              body="Mission Number, MTR Route (letters and digits only, e.g. IR111), and the survey date identify this job on the form and in exports."
              isSeen={isSeen(HINT_REPORT_MISSION_INFO)}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mission Number</label>
              <input
                type="text"
                value={missionNumber}
                onChange={(e) => setMissionNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MTR Route</label>
              <input
                type="text"
                value={mtrRoute}
                onChange={(e) => setMtrRoute(normalizeMtrRouteInput(e.target.value))}
                placeholder="e.g. IR111"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg uppercase"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
          </div>
        </section>

        {/* Tower Observations */}
        <section className="p-4 bg-white rounded-xl border border-gray-200">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h2 className="font-semibold text-gray-900">Tower Observations</h2>
            <GuidedHint
              hintId={HINT_REPORT_TOWERS}
              stepNumber={5}
              title="Tower rows"
              body="Complete up to six towers. Coordinates and heights come from Tower Data Analysis; set structure type, lighting, and any extra wording here. Leave unused rows blank."
              isSeen={isSeen(HINT_REPORT_TOWERS)}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Document up to six towers. Leave any unused rows blank.
          </p>
          <div className="space-y-6">
            {towerEntries.map((entry, i) => (
              <TowerEntryRow
                key={i}
                index={i + 1}
                entry={entry}
                onChange={(u) => updateTowerEntry(i, u)}
              />
            ))}
          </div>
        </section>

        {/* Mission Summary */}
        {selectedMission && (
          <MissionSummary missionId={selectedMission.id} />
        )}

        {/* Additional Notes */}
        <section className="p-4 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-semibold text-gray-900">Additional Notes</h2>
            <GuidedHint
              hintId={HINT_REPORT_NOTES}
              stepNumber={6}
              title="Additional notes"
              body={`Scroll to the bottom of this form to find this section. The default line is fully editable—replace it with real notes when needed. The same text is printed again on the last page of the export PDF (the landscape mission map page), up to ${ADDITIONAL_NOTES_MAX_LENGTH} characters for the main form fields; the map box may show fewer lines if the note is long. The field stops accepting text at that limit. Leave the default or clear the field for the standard nothing-additional boilerplate in the PDF.`}
              isSeen={isSeen(HINT_REPORT_NOTES)}
              onDismiss={markSeen}
              surface="light"
            />
          </div>
          <textarea
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            rows={5}
            maxLength={ADDITIONAL_NOTES_MAX_LENGTH}
            className="w-full min-h-[8rem] px-3 py-3 border-2 border-gray-400 rounded-lg bg-white text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-cap-ultramarine focus:border-cap-ultramarine"
          />
          <p className="mt-1.5 text-sm text-gray-600 tabular-nums" aria-live="polite">
            {additionalNotes.length} / {ADDITIONAL_NOTES_MAX_LENGTH} characters
          </p>
        </section>

        {/* Actions */}
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={clearForm}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Clear Form
          </button>
          <button
            type="button"
            onClick={() =>
              navigate('/export', {
                state: {
                  missionId: selectedMission?.id,
                  reportData: {
                    pocName,
                    capUnit,
                    phone,
                    email,
                    missionNumber,
                    mtrRoute,
                    date,
                    additionalNotes,
                    towerEntries,
                  },
                },
              })
            }
            disabled={!selectedMission || !isComplete}
            className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
          >
            Generate PDF Report →
          </button>
        </div>

        {errorMessage && (
          <div className="p-4 bg-red-50 text-cap-pimento rounded-lg">{errorMessage}</div>
        )}
      </div>
      </div>

      {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Air Force Report Form Help</h2>
            <div className="space-y-4 text-sm text-gray-700">
              <p>
                Create a mission (Mission Number, MTR Route, Date) or select an existing one.
                Record tower observations in Tower Data Analysis, then return here to complete
                structure type, lighting, and notes.
              </p>
              <p>
                As each reported tower data is analyzed, its distance and True bearing from
                the route&apos;s closest waypoint is computed and added to the Notes for each
                Tower Observation. A mission must have an associated flight plan for this.
              </p>
              <p>
                Generate PDF requires a selected mission and all mandatory fields (POC Name, CAP Unit,
                Phone, Email, Mission Number, MTR Route, Date).
              </p>
              <p>
                Additional Notes are limited to {ADDITIONAL_NOTES_MAX_LENGTH} characters so they match
                what the PDF form can store; a counter appears under that field.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="mt-6 px-4 py-2 bg-cap-ultramarine text-white rounded-lg"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TowerEntryRow({
  index,
  entry,
  onChange,
}: {
  index: number
  entry: TowerEntry
  onChange: (u: Partial<TowerEntry>) => void
}) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <h3 className="font-medium text-gray-900 mb-3">Tower {index}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Structure Type</label>
          <select
            value={entry.structureType}
            onChange={(e) =>
              onChange({ structureType: (e.target.value || '') as StructureType })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {STRUCTURE_OPTIONS.map((o) => (
              <option key={o.value || 'x'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Lighting</label>
          <select
            value={entry.lighting}
            onChange={(e) =>
              onChange({ lighting: (e.target.value || '') as Lighting })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {LIGHTING_OPTIONS.map((o) => (
              <option key={o.value || 'x'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Latitude</label>
          <input
            type="text"
            value={entry.latitude}
            readOnly
            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Longitude</label>
          <input
            type="text"
            value={entry.longitude}
            readOnly
            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Height AGL (ft)</label>
          <input
            type="text"
            value={entry.agl}
            readOnly
            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Height MSL (ft)</label>
          <input
            type="text"
            value={entry.msl}
            readOnly
            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-sm"
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
        <input
          type="text"
          value={entry.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Distance and bearing from waypoint"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>
    </div>
  )
}

function MissionSummary({ missionId }: { missionId: string }) {
  const mission = useLiveQuery(() => db.missions.get(missionId), [missionId])
  const towerReports = useLiveQuery(
    async () => {
      if (!missionId) return []
      return db.towerReports.where('missionId').equals(missionId).toArray()
    },
    [missionId]
  )

  if (!mission) return null
  const total = towerReports?.length ?? 0
  const completed = towerReports?.filter((r) => r.estimatedHeight != null && r.estimatedHeight > 0).length ?? 0
  const heights = (towerReports ?? [])
    .map((r) => r.estimatedHeight)
    .filter((h): h is number => h != null && h > 0)
  const avg = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 0
  const max = heights.length ? Math.max(...heights) : 0

  return (
    <section className="p-4 bg-white rounded-xl border border-gray-200">
      <h2 className="font-semibold text-gray-900 mb-4">Mission Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Total Towers:</span> {total}
        </div>
        <div>
          <span className="text-gray-500">Completed:</span>{' '}
          <span className="text-green-600 font-medium">{completed}</span>
        </div>
        <div>
          <span className="text-gray-500">Average Height:</span> {Math.round(avg)} ft
        </div>
        <div>
          <span className="text-gray-500">Max Height:</span> {Math.round(max)} ft
        </div>
      </div>
    </section>
  )
}
