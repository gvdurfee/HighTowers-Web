import { useState, useEffect, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { WaypointRecord } from '@/db/schema'
import { generateId } from '@/utils/id'
import { apiService } from '@/services/api'
import { nearestWaypointInfo } from '@/utils/towerWaypointGeometry'
import { getSensorHeight } from '@/utils/cameraMetadata'
import { calculateTowerHeight } from '@/utils/heightCalculation'
import type { ImageMetadata } from '@/components/TowerImagePicker'
import { TowerImagePicker } from '@/components/TowerImagePicker'
import { SurveyMapModal, type SurveyMapRecordOptions } from '@/components/SurveyMapModal'
import { MeasureLinesPanel } from '@/components/MeasureLinesPanel'

function formatCoord(value: number, isLatitude: boolean): string {
  const dir = isLatitude ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  const abs = Math.abs(value)
  const d = Math.floor(abs)
  const m = (abs - d) * 60
  return `${dir}${d}°${m.toFixed(2)}'`
}

/** Re-encodes the analysis image as JPEG; measurement lines are omitted (PDF adds the info overlay). */
function buildAnnotatedImageDataUrl(
  image: HTMLImageElement,
  _baseY: number,
  _measH: number
): string {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return image.src
  ctx.drawImage(image, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.9)
}

export function TowerAnalysisPage() {
  const missions = useLiveQuery(() => db.missions.toArray(), [])
  const activeMission = (missions ?? []).find(
    (m) =>
      m.missionNumber &&
      m.mtrRoute &&
      !m.isCompleted
  )

  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null)
  const [imageMeta, setImageMeta] = useState<ImageMetadata | null>(null)
  const [towerLat, setTowerLat] = useState(35.0844)
  const [towerLon, setTowerLon] = useState(-106.6504)
  const [groundElevation, setGroundElevation] = useState(5200)
  const [hasLocationData, setHasLocationData] = useState(false)
  const [topSlider, setTopSlider] = useState(0)
  const [baseSlider, setBaseSlider] = useState(0)
  const [measurementHeight, setMeasurementHeight] = useState(0)
  const [estimatedHeight, setEstimatedHeight] = useState(0)
  const [showSurveyMap, setShowSurveyMap] = useState(false)
  const [showNoGpsAlert, setShowNoGpsAlert] = useState(false)
  /** From Fly-Over modal: tower could not be identified on the map. */
  const [surveyTowerNotVisibleOnMap, setSurveyTowerNotVisibleOnMap] = useState(false)
  const [bannerMessage, setBannerMessage] = useState<string | null>(null)
  const [bannerSuccess, setBannerSuccess] = useState(true)
  const [showHelp, setShowHelp] = useState(false)

  const cameraLat = imageMeta?.latitude ?? towerLat
  const cameraLon = imageMeta?.longitude ?? towerLon
  const focalLength = imageMeta?.focalLengthMm ?? 50
  const sensorHeight = getSensorHeight(imageMeta?.cameraModel)
  const cameraAltitude = (() => {
    const exif = imageMeta?.altitudeFt
    if (exif != null && exif > groundElevation) return exif
    return groundElevation + 1000
  })()

  const recalc = useCallback(() => {
    if (measurementHeight <= 0) {
      setEstimatedHeight(0)
      return
    }
    const h = calculateTowerHeight({
      topSliderValue: topSlider,
      bottomSliderValue: baseSlider,
      measurementAreaHeight: measurementHeight,
      focalLengthMm: focalLength,
      sensorHeightMm: sensorHeight,
      cameraAltitudeFt: cameraAltitude,
      groundElevationFt: groundElevation,
      cameraLat,
      cameraLon,
      towerLat,
      towerLon,
    })
    setEstimatedHeight(h)
  }, [
    topSlider,
    baseSlider,
    measurementHeight,
    focalLength,
    sensorHeight,
    cameraAltitude,
    groundElevation,
    cameraLat,
    cameraLon,
    towerLat,
    towerLon,
  ])

  useEffect(() => {
    recalc()
  }, [recalc, topSlider, baseSlider, measurementHeight])

  // Default: red at top (0), blue at bottom (measurementHeight) when image loads
  useEffect(() => {
    if (selectedImage && measurementHeight > 0) {
      setTopSlider(0)
      setBaseSlider(measurementHeight)
    }
  }, [selectedImage, measurementHeight])

  const handleImageSelect = (meta: ImageMetadata) => {
    setSelectedImage(meta.image)
    setImageMeta(meta)
    if (meta.latitude != null && meta.longitude != null) {
      setTowerLat(meta.latitude)
      setTowerLon(meta.longitude)
      setHasLocationData(true)
      if (meta.altitudeFt != null) {
        setGroundElevation(Math.round(meta.altitudeFt) - 500)
      }
    } else {
      setShowNoGpsAlert(true)
    }
    setSurveyTowerNotVisibleOnMap(false)
    setTopSlider(0)
    setBaseSlider(measurementHeight || 300)
    setEstimatedHeight(0)
  }

  const handleSurveyRecord = (
    lat: number,
    lon: number,
    elev: number,
    options?: SurveyMapRecordOptions
  ) => {
    setTowerLat(lat)
    setTowerLon(lon)
    setGroundElevation(Math.round(elev))
    setHasLocationData(true)
    setSurveyTowerNotVisibleOnMap(!!options?.towerNotVisibleOnMap)
    setShowSurveyMap(false)
  }

  const clearAnalysis = () => {
    setSelectedImage(null)
    setImageMeta(null)
    setTopSlider(0)
    setBaseSlider(0)
    setMeasurementHeight(0)
    setEstimatedHeight(0)
    setHasLocationData(false)
    setSurveyTowerNotVisibleOnMap(false)
  }

  const saveTower = async () => {
    if (!selectedImage) {
      setBannerMessage('No image selected')
      setBannerSuccess(false)
      setTimeout(() => setBannerMessage(null), 3000)
      return
    }
    if (!hasLocationData) {
      setBannerMessage('Tower location not surveyed')
      setBannerSuccess(false)
      setTimeout(() => setBannerMessage(null), 3000)
      return
    }
    if (estimatedHeight <= 0) {
      setBannerMessage('Invalid height calculation')
      setBannerSuccess(false)
      setTimeout(() => setBannerMessage(null), 3000)
      return
    }
    if (!activeMission) {
      setBannerMessage('No active mission. Create one in Air Force Report Form first.')
      setBannerSuccess(false)
      setTimeout(() => setBannerMessage(null), 3000)
      return
    }

    try {
      const towerLocId = generateId()
      const cameraId = generateId()
      const reportId = generateId()

      let nearestWaypointId: string | undefined
      let distanceFromWaypoint: number | undefined
      let bearingFromWaypoint: number | undefined

      if (activeMission.flightPlanId) {
        const wps = await db.waypoints
          .where('flightPlanId')
          .equals(activeMission.flightPlanId)
          .sortBy('sequence')
        const info = nearestWaypointInfo(towerLat, towerLon, wps)
        if (info) {
          nearestWaypointId = (info.waypoint as WaypointRecord).id
          distanceFromWaypoint = info.distanceNm
          bearingFromWaypoint = info.bearingDeg
        }
      }

      const noImageGps =
        imageMeta?.latitude == null || imageMeta?.longitude == null

      await db.towerLocations.add({
        id: towerLocId,
        latitude: towerLat,
        longitude: towerLon,
        elevation: groundElevation,
        nearestWaypointId,
        distanceFromWaypoint,
        bearingFromWaypoint,
        noImageGps,
        towerNotVisibleOnMap: surveyTowerNotVisibleOnMap || undefined,
      })

      await db.cameraData.add({
        id: cameraId,
        latitude: cameraLat,
        longitude: cameraLon,
        elevation: cameraAltitude,
        focalLength,
        sensorHeight,
        timestamp: new Date().toISOString(),
      })

      const annotatedDataUrl = buildAnnotatedImageDataUrl(
        selectedImage,
        baseSlider,
        measurementHeight
      )

      await db.towerReports.add({
        id: reportId,
        missionId: activeMission.id,
        towerLocationId: towerLocId,
        cameraDataId: cameraId,
        annotatedImageDataUrl: annotatedDataUrl,
        estimatedHeight,
        reportDate: new Date().toISOString(),
        mtrRoute: activeMission.mtrRoute ?? undefined,
      })

      setBannerMessage(`Tower saved to ${activeMission.missionNumber ?? 'mission'}!`)
      setBannerSuccess(true)
      setTimeout(() => setBannerMessage(null), 3000)
      clearAnalysis()
    } catch (e) {
      setBannerMessage(e instanceof Error ? e.message : 'Failed to save tower')
      setBannerSuccess(false)
      setTimeout(() => setBannerMessage(null), 3000)
    }
  }

  return (
    <div className="app-page-shell overflow-hidden relative">
      <div className="app-panel flex flex-col flex-1 min-h-0 overflow-hidden p-0 shadow-xl">
      <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 flex min-h-0">
        {/* Left panel - compact to maximize image area */}
        <div className="w-56 flex-shrink-0 p-4 border-r border-gray-200 bg-slate-50 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">
              Tower Data
              <br />
              Analysis
            </h1>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="p-1.5 text-cap-pimento hover:bg-red-50 rounded-full flex-shrink-0"
              aria-label="Help"
            >
              ❓
            </button>
          </div>
          {!selectedImage ? (
            <div>
              <h2 className="font-semibold text-gray-900 mb-2">Tower Image</h2>
              <TowerImagePicker onSelect={handleImageSelect} />
            </div>
          ) : (
            <>
              <div>
                <h2 className="font-semibold text-gray-900 mb-2">Tower Location</h2>
                <button
                  type="button"
                  onClick={() => setShowSurveyMap(true)}
                  className="w-full py-2 px-3 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                  Fly-Over Location
                </button>
                {hasLocationData && (
                  <div className="mt-3 text-sm space-y-1">
                    <p>
                      <span className="text-gray-500">Lat:</span>{' '}
                      {formatCoord(towerLat, true)}
                    </p>
                    <p>
                      <span className="text-gray-500">Lon:</span>{' '}
                      {formatCoord(towerLon, false)}
                    </p>
                    <p>
                      <span className="text-gray-500">Elevation:</span>{' '}
                      {Math.round(groundElevation)} ft
                    </p>
                  </div>
                )}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 mb-2">Heights</h2>
                <p className="text-sm">
                  <span className="text-gray-500">AGL:</span>{' '}
                  <span className="font-medium">{Math.round(estimatedHeight)} ft</span>
                </p>
                <p className="text-sm">
                  <span className="text-gray-500">MSL (terrain):</span>{' '}
                  <span className="font-medium">{Math.round(groundElevation)} ft</span>
                </p>
              </div>
              <div className="mt-auto flex flex-col gap-2">
                <button
                  type="button"
                  onClick={clearAnalysis}
                  className="w-full py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={saveTower}
                  disabled={estimatedHeight <= 0}
                  className="w-full py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
                >
                  Save Tower
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right panel - measurement; maximize image + sliders */}
        <div className="flex-1 flex flex-col min-w-0 p-4 min-h-0 bg-white">
          <h2 className="font-semibold text-gray-900 mb-1 text-sm">Height Measurement</h2>
          <p className="text-xs text-gray-500 mb-2">
            Red = top. Blue = bottom. Drag sliders to align.
          </p>
          <MeasureLinesPanel
            image={selectedImage}
            topSlider={topSlider}
            baseSlider={baseSlider}
            measurementHeight={measurementHeight}
            onTopChange={setTopSlider}
            onBaseChange={setBaseSlider}
            onHeightMeasured={setMeasurementHeight}
          />
        </div>
      </div>
      </div>
      </div>

      {!activeMission && (
        <div className="absolute top-20 right-4 max-w-sm p-4 bg-cap-yellow/20 border border-cap-yellow rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">No Active Mission</p>
          <p className="text-sm text-gray-700 mt-1">
            Create a mission in Air Force Report Form (Mission Number, MTR Route, Date)
            before saving towers.
          </p>
        </div>
      )}

      {bannerMessage && (
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg ${
            bannerSuccess ? 'bg-green-600 text-white' : 'bg-cap-pimento text-white'
          }`}
        >
          {bannerMessage}
        </div>
      )}

      {showNoGpsAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md">
            <p className="text-gray-700">
              This image has no GPS metadata. Use Fly-Over Location to set the tower
              position manually.
            </p>
            <button
              type="button"
              onClick={() => setShowNoGpsAlert(false)}
              className="mt-4 px-4 py-2 bg-cap-ultramarine text-white rounded-lg"
            >
              OK
            </button>
          </div>
        </div>
      )}

      <SurveyMapModal
        isOpen={showSurveyMap}
        onClose={() => setShowSurveyMap(false)}
        initialLat={towerLat}
        initialLon={towerLon}
        onRecord={handleSurveyRecord}
        fetchElevation={apiService.fetchElevation}
      />

      {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Tower Data Analysis Help</h2>
            <div className="space-y-4 text-sm text-gray-700">
              <div>
                <h3 className="font-semibold">What is Tower Analysis?</h3>
                <p>
                  Tower Analysis measures obstruction heights along MTRs using a photo
                  and triangulation to estimate height in feet AGL and MSL.
                </p>
              </div>
              <div>
                <h3 className="font-semibold">Fly-Over Location</h3>
                <p>
                  Pan the map so the crosshair is on the tower base (or best position), then
                  record to fetch ground elevation. If the photo has no GPS, Fly-Over supplies the
                  tower coordinates for the survey form. If the tower cannot be seen on the map,
                  use the checkbox before recording — MSL/AGL will read “See Notes” with an
                  explanation and bearing/distance from the route.
                </p>
              </div>
              <div>
                <h3 className="font-semibold">Height Measurement</h3>
                <p>
                  Red line = top of tower, blue line = base. Drag the sliders to align
                  each line with the tower. Height updates automatically.
                </p>
              </div>
              <div>
                <h3 className="font-semibold">Save Tower</h3>
                <p>
                  Saves the tower report to your active mission. Create a mission in
                  Air Force Report Form first.
                </p>
              </div>
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
