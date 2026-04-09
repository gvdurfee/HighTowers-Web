import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import {
  defaultTowerEntries,
  fromPersistedStructure,
  fromPersistedLighting,
} from '@/types/reportForm'
import {
  buildRouteSurveyTowerNotes,
  routeSurveyAglField,
  routeSurveyMslField,
} from '@/utils/routeSurveyTowerRow'
import type { WaypointRecord } from '@/db/schema'
import {
  generateAirForceReportPdf,
  type ReportFormData,
} from '@/services/pdfReportService'

function formatDateForDisplay(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

function formatCoordinate(value: number, isLatitude: boolean): string {
  const direction = isLatitude ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  const absVal = Math.abs(value)
  const d = Math.floor(absVal)
  const m = (absVal - d) * 60
  return `${direction}${d}°${m.toFixed(2)}'`
}

export function ExportDataPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as {
    missionId?: string
    reportData?: ReportFormData
  } | null

  const missions = useLiveQuery(() =>
    db.missions.toArray().then((a) => a.sort((x, y) => y.date.localeCompare(x.date)))
  )

  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(
    state?.missionId ?? null
  )
  const [formData, setFormData] = useState<ReportFormData | null>(state?.reportData ?? null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const selectedMission = selectedMissionId
    ? (missions ?? []).find((m) => m.id === selectedMissionId)
    : null

  useEffect(() => {
    if (state?.missionId && state?.reportData) {
      setSelectedMissionId(state.missionId)
      setFormData(state.reportData)
    }
  }, [state?.missionId, state?.reportData])

  useEffect(() => {
    if (!selectedMissionId || !selectedMission || formData) return
    const mission = selectedMission
    async function loadFormFromDb() {
      const m = await db.missions.get(mission.id)
      if (!m) return
      const reports = await db.towerReports
        .where('missionId')
        .equals(mission.id)
        .sortBy('reportDate')
      const locations = await Promise.all(
        reports.map((r) => db.towerLocations.get(r.towerLocationId))
      )
      let wps: WaypointRecord[] = []
      if (m.flightPlanId) {
        wps = await db.waypoints
          .where('flightPlanId')
          .equals(m.flightPlanId)
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
      setFormData({
        pocName: m.pocName ?? '',
        capUnit: m.capUnit ?? '',
        phone: m.phone ?? '',
        email: m.email ?? '',
        missionNumber: m.missionNumber ?? '',
        mtrRoute: m.mtrRoute ?? '',
        date: m.date ? formatDateForDisplay(m.date) : '',
        additionalNotes: m.notes ?? '',
        towerEntries: entries,
      })
    }
    loadFormFromDb()
  }, [selectedMissionId, selectedMission?.id, formData])

  const handleGeneratePdf = async () => {
    if (!selectedMissionId || !formData) {
      setErrorMessage('Please select a mission and ensure form data is loaded.')
      return
    }
    setIsGenerating(true)
    setErrorMessage(null)
    try {
      const pdfBytes = await generateAirForceReportPdf(selectedMissionId, formData)
      const mission = await db.missions.get(selectedMissionId)
      const name = mission?.name ?? 'Report'
      const dateStr = formData.date.replace(/\//g, '-')
      const fileName = `AirForce_Report_${name.replace(/\s+/g, '_')}_${dateStr}.pdf`
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Failed to generate PDF')
    } finally {
      setIsGenerating(false)
    }
  }

  const isReady = !!selectedMission && !!formData
  const isComplete =
    formData &&
    !!formData.pocName.trim() &&
    !!formData.capUnit.trim() &&
    !!formData.phone.trim() &&
    !!formData.email.trim() &&
    !!formData.missionNumber.trim() &&
    !!formData.mtrRoute.trim() &&
    !!formData.date.trim()

  return (
    <div className="app-page-shell overflow-auto">
      <div className="app-panel max-w-2xl mx-auto p-6 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Export Data</h1>
      <p className="text-gray-600 mb-6">
        Generate and download the Air Force Route Survey Report PDF. Includes a mission map
        (route and towers) when Mapbox is configured. Tower photos use a CAP-style location
        overlay and are compressed to ~500KB each for email sharing.
      </p>

      {!selectedMissionId && (missions ?? []).length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Mission
          </label>
          <select
            value={selectedMissionId ?? ''}
            onChange={(e) => {
              setSelectedMissionId(e.target.value || null)
              setFormData(null)
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">Choose a mission…</option>
            {(missions ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedMission && formData && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 mb-6">
          <h2 className="font-semibold text-gray-900 mb-2">{selectedMission.name}</h2>
          <p className="text-sm text-gray-600">
            {formData.missionNumber} · {formData.mtrRoute} · {formData.date}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            POC: {formData.pocName} · {formData.capUnit}
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleGeneratePdf}
          disabled={!isReady || !isComplete || isGenerating}
          className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? 'Generating…' : 'Generate & Download PDF'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/report-form')}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Back to Report Form
        </button>
      </div>

      {errorMessage && (
        <div className="mt-4 p-4 bg-red-50 text-cap-pimento rounded-lg">{errorMessage}</div>
      )}

      {selectedMissionId && !formData && (
        <p className="mt-4 text-sm text-gray-500">Loading mission data…</p>
      )}
      </div>
    </div>
  )
}
