declare module '@survey-planning/surveySortieFplRoute.js' {
  export const SORTIE_FPL_ROUTE_POINT_WARN: number
  export function sliceFragmentWaypoints(
    allWaypoints: unknown[],
    startIdx: number,
    endIdx: number
  ): unknown[]
  export function buildSerpentineRouteSequence(
    fragment: { ptIdent: string; g1000Name: string }[],
    startAt: string,
    offsets: number[]
  ): { routeSequence: string[]; routePointCount: number; warnRoutePointLimit: boolean }
  export function buildSortieFplExportInput(opts: {
    sortie: {
      sortieNumber: number
      startIdx: number
      endIdx: number
      startAt: string
      waypointFrom: string
      waypointTo: string
      offsets: number[]
    }
    fragmentWaypoints: { ptIdent: string; g1000Name: string; lat: number; lon: number }[]
    teamDeparture: { identifier: string; name?: string; lat: number; lon: number; elevation?: number }
    routeLabel: string
  }): {
    routeLabel: string
    sortieNumber: number
    waypointFrom: string
    waypointTo: string
    offsets: number[]
    startAt: string
    fragmentWaypoints: { ptIdent: string; g1000Name: string; lat: number; lon: number }[]
    routeSequence: string[]
    routePointCount: number
    warnRoutePointLimit: boolean
    teamDeparture: {
      identifier: string
      name: string
      latitude: number
      longitude: number
      elevation?: number
    }
  }
  export function formatSortieFplFilename(opts: {
    dep: string
    routeName: string
    from: string
    to: string
    sortieNumber: number
  }): string
}

declare module '@survey-planning/surveySortiePlanner.js' {
  export const DEFAULT_PARALLEL_TRACK_POLICY: {
    firstOffsetNm: number
    stepNm: number
    outerMarginNm: number
  }

  export function planThreeTeamGeographicScenario(
    input: {
      routeType?: string
      routeNumber?: string
      waypoints: { ptIdent: string; lat: number; lon: number }[]
      widthTexts: string[]
      teams: { label: string; depLat: number; depLon: number; side: 'left' | 'right' }[]
      sortieBudgetNm?: number
      fullRoutePtIdents?: string[]
    },
    teams: { label: string; depLat: number; depLon: number; side: 'left' | 'right' }[]
  ): Awaited<ReturnType<typeof planSurveyScenario>> & {
    geographicSplits: { boundaryIdx: number; boundaryPt: string }[]
    segmentAssignments: {
      teamLabel: string
      waypointFrom: string
      waypointTo: string
      startIdx: number
      endIdx: number
      sortieCount: number
      totalNm: number
    }[]
  }

  export function planSingleTeamBothSides(
    input: {
      routeType?: string
      routeNumber?: string
      waypoints: { ptIdent: string; lat: number; lon: number }[]
      widthTexts: string[]
      teams: { label: string; depLat: number; depLon: number; side: 'left' | 'right' }[]
      sortieBudgetNm?: number
      assignmentModel?: string
    }
  ): Awaited<ReturnType<typeof planSurveyScenario>>

  export function compareTwoVsThreeTeamStaffing(
    input: {
      routeType?: string
      routeNumber?: string
      waypoints: { ptIdent: string; lat: number; lon: number }[]
      widthTexts: string[]
      teams: { label: string; depLat: number; depLon: number; side: 'left' | 'right' }[]
      sortieBudgetNm?: number
    },
    team2: { label: string; depLat: number; depLon: number; side: 'left' | 'right' },
    team3: { label: string; depLat: number; depLon: number; side: 'left' | 'right' },
    labels?: { team1DepLabel?: string; team2DepLabel?: string; team3DepLabel?: string }
  ): {
    sortieBudgetNm: number
    team1DepLabel: string
    team2DepLabel: string
    team3DepLabel: string
    twoTeams: Awaited<ReturnType<typeof planSurveyScenario>>
    threeTeams: Awaited<ReturnType<typeof planThreeTeamGeographicScenario>>
    deltaSorties: number
    deltaWingNm: number
    twoTeamsOverBudgetSorties: number
    threeTeamsOverBudgetSorties: number
  }

  export function compareOneVsTwoTeamStaffing(
    input: {
      routeType?: string
      routeNumber?: string
      waypoints: { ptIdent: string; lat: number; lon: number }[]
      widthTexts: string[]
      teams: { label: string; depLat: number; depLon: number; side: 'left' | 'right' }[]
      sortieBudgetNm?: number
      assignmentModel?: string
    },
    team2: { label: string; depLat: number; depLon: number; side: 'left' | 'right' },
    labels?: { team1DepLabel?: string; team2DepLabel?: string }
  ): {
    sortieBudgetNm: number
    team1DepLabel: string
    team2DepLabel: string
    oneTeam: Awaited<ReturnType<typeof planSurveyScenario>>
    twoTeams: Awaited<ReturnType<typeof planSurveyScenario>>
    deltaSorties: number
    deltaWingNm: number
    oneTeamOverBudgetSorties: number
    twoTeamsOverBudgetSorties: number
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
    assignmentModel?: string
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
        startIdx: number
        endIdx: number
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
