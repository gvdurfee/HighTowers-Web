declare module '@survey-planning/surveySortiePlanner.js' {
  export const DEFAULT_PARALLEL_TRACK_POLICY: {
    firstOffsetNm: number
    stepNm: number
    outerMarginNm: number
  }

  export function planSurveyScenario(input: {
    routeType?: string
    routeNumber?: string
    waypoints: { ptIdent: string; lat: number; lon: number }[]
    widthTexts: string[]
    teams: { label: string; depLat: number; depLon: number; side: 'left' | 'right' }[]
    sortieBudgetNm?: number
    assignmentModel?: string
  }): {
    status: string
    route: string
    sortieBudgetNm: number
    totalCenterlineNm: number
    totalSorties: number | null
    totalWingNm: number | null
    disclaimer: string
    legs: {
      fromPt: string
      toPt: string
      leftNm: number | null
      rightNm: number | null
      leftOffsets: number[]
      rightOffsets: number[]
      chainNm: number
    }[]
    teams: {
      label: string
      side: string
      entryWaypoint: string | null
      ferryInNm: number
      sortieCount: number | null
      totalNm?: number
      note: string | null
      sorties: {
        sortieNumber: number
        waypointFrom: string
        waypointTo: string
        startAt: string
        offsets: number[]
        ferryInNm: number
        alongRouteNm: number
        ferryOutNm: number
        totalNm: number
        overBudget?: boolean
      }[]
    }[]
  }
}
