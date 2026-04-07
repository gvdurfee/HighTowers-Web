import Dexie, { type Table } from 'dexie'

/** Airport (departure/destination for flight plan) */
export interface AirportRecord {
  id: string
  identifier: string
  name: string
  latitude: number
  longitude: number
  elevation?: number
}

/** Waypoint along MTR route */
export interface WaypointRecord {
  id: string
  flightPlanId: string
  originalName: string
  g1000Name: string
  latitude: number
  longitude: number
  routeType: 'IR' | 'SR' | 'VR'
  sequence: number
}

/** Pending waypoint: not found in MTR DB, user must supply coordinates */
export interface PendingWaypoint {
  code: string
  sequence: number
}

/** How the plan was created (for reference; export behavior is unified). */
export type FlightPlanCreationLoadMethod = 'route' | 'sequence' | 'sequenceLibrary'

/** Flight plan */
export interface FlightPlanRecord {
  id: string
  name: string
  dateCreated: string
  dateModified: string
  departureAirportId?: string
  destinationAirportId?: string
  isActive: boolean
  /** Waypoints not found during create; user supplies coords on detail page */
  pendingWaypoints?: PendingWaypoint[]
  /** Set when created from New Flight Plan (optional on older records). */
  creationLoadMethod?: FlightPlanCreationLoadMethod
}

/** Tower base location */
export interface TowerLocationRecord {
  id: string
  latitude: number
  longitude: number
  elevation: number
  nearestWaypointId?: string
  distanceFromWaypoint?: number
  bearingFromWaypoint?: number
}

/** Camera metadata at time of photo */
export interface CameraDataRecord {
  id: string
  latitude: number
  longitude: number
  elevation: number
  focalLength: number
  sensorHeight: number
  timestamp: string
}

/** Tower report (one per surveyed tower) */
export interface TowerReportRecord {
  id: string
  missionId: string
  towerLocationId: string
  cameraDataId: string
  imageDataUrl?: string
  annotatedImageDataUrl?: string
  estimatedHeight?: number
  reportDate: string
  structureType?: string
  structureLighting?: string
  mtrRoute?: string
  notes?: string
}

/** Mission (Air Force report) */
export interface MissionRecord {
  id: string
  name: string
  date: string
  flightPlanId?: string
  missionNumber?: string
  mtrRoute?: string
  pocName?: string
  capUnit?: string
  phone?: string
  email?: string
  notes?: string
  isCompleted: boolean
}

export class HighTowersDB extends Dexie {
  airports!: Table<AirportRecord, string>
  waypoints!: Table<WaypointRecord, string>
  flightPlans!: Table<FlightPlanRecord, string>
  towerLocations!: Table<TowerLocationRecord, string>
  cameraData!: Table<CameraDataRecord, string>
  towerReports!: Table<TowerReportRecord, string>
  missions!: Table<MissionRecord, string>

  constructor() {
    super('HighTowersDB')
    this.version(1).stores({
      airports: 'id',
      waypoints: 'id, flightPlanId',
      flightPlans: 'id',
      towerLocations: 'id',
      cameraData: 'id',
      towerReports: 'id, missionId',
      missions: 'id',
    })
  }
}

export const db = new HighTowersDB()
