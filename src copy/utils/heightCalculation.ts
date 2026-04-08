/**
 * Tower height calculation - ported from HighTowers-2025 TowerAnalysisView.calculateHeight
 */

export interface HeightCalcInput {
  topSliderValue: number
  bottomSliderValue: number
  measurementAreaHeight: number
  focalLengthMm: number
  sensorHeightMm: number
  cameraAltitudeFt: number
  groundElevationFt: number
  cameraLat: number
  cameraLon: number
  towerLat: number
  towerLon: number
}

function haversineFt(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R_KM = 6372.8
  const lat1rad = (lat1 * Math.PI) / 180
  const lon1rad = (lon1 * Math.PI) / 180
  const lat2rad = (lat2 * Math.PI) / 180
  const lon2rad = (lon2 * Math.PI) / 180
  const dLat = lat2rad - lat1rad
  const dLon = lon2rad - lon1rad
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1rad) * Math.cos(lat2rad)
  const c = 2 * Math.asin(Math.sqrt(a))
  return R_KM * c * 3280.84
}

export function calculateTowerHeight(input: HeightCalcInput): number {
  const {
    topSliderValue,
    bottomSliderValue,
    measurementAreaHeight,
    focalLengthMm,
    sensorHeightMm,
    cameraAltitudeFt,
    groundElevationFt,
    cameraLat,
    cameraLon,
    towerLat,
    towerLon,
  } = input

  if (measurementAreaHeight <= 0) return 0

  const distanceToObjectTop = topSliderValue
  const distanceToObjectBase = bottomSliderValue
  const totalVerticalDistance = measurementAreaHeight

  if (
    distanceToObjectTop < 0 ||
    distanceToObjectBase < 0 ||
    distanceToObjectTop > totalVerticalDistance ||
    distanceToObjectBase > totalVerticalDistance
  ) {
    return 0
  }

  const focalLen = focalLengthMm || 50
  const aov = (2 * Math.atan(sensorHeightMm / 2 / focalLen))
  const beta1 = aov * (distanceToObjectBase / totalVerticalDistance)
  const beta2 = aov * (distanceToObjectTop / totalVerticalDistance)

  const cameraToTargetDistance = Math.max(100, haversineFt(cameraLat, cameraLon, towerLat, towerLon))
  let cameraAltitudeAboveBase = cameraAltitudeFt - groundElevationFt
  if (cameraAltitudeAboveBase <= 0) {
    cameraAltitudeAboveBase = 1000
  }
  const baseAngleRAD = Math.atan(cameraAltitudeAboveBase / cameraToTargetDistance)
  const tiltAngle = Math.PI / 2 - baseAngleRAD - beta1

  const towerHeight =
    cameraAltitudeAboveBase *
    Math.abs(1 - Math.tan(tiltAngle + beta1) / Math.tan(tiltAngle + beta2))

  return Math.max(0, towerHeight)
}
