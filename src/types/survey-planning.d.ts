declare module '@survey-planning/corridorTrackPlan.js' {
  export type SpanTrackPlanEntry = {
    fromPt: string
    toPt: string
    leftNm: number
    rightNm: number
    leftOffsets: number[]
    rightOffsets: number[]
    rawText?: string
  }

  export function defaultSpanTrackPlanFromWidthTexts(
    widthTexts: string[],
    policy?: { firstOffsetNm?: number; stepNm?: number; outerMarginNm?: number }
  ): SpanTrackPlanEntry[]

  export function findSpanTrackEntryForLeg(
    spanTrackPlan: SpanTrackPlanEntry[],
    fromPt: string,
    toPt: string,
    orderedRoutePtIdents?: string[]
  ): SpanTrackPlanEntry | null

  export function parseOffsetsListInput(raw: string): number[]
  export function formatOffsetsList(offsets: number[]): string
  export function validateSpanTrackPlan(plan: SpanTrackPlanEntry[]): string | null
}

declare module '@survey-planning/mtrWidthParser.js' {
  export function parseWidthTexts(widthTexts: string[]): {
    fromPt: string
    toPt: string
    leftNm: number
    rightNm: number
    rawText?: string
  }[]
}

declare module '@survey-planning/surveyGeometry.js' {
  export const DEFAULT_PARALLEL_TRACK_POLICY: {
    firstOffsetNm: number
    stepNm: number
    outerMarginNm: number
  }
  export const NO_PUBLISHED_WIDTH_NOTE: string
  export const NO_OFFSET_INSIDE_NOTE: string
  export const OFFSET_PAST_EDGE_NOTE: string
  export function parallelOffsetsForHalfWidth(
    halfWidthNm: number,
    policy?: { firstOffsetNm?: number; stepNm?: number; outerMarginNm?: number }
  ): number[]
  export function offsetsInsidePublishedWidth(
    offsets: number[] | null | undefined,
    halfWidthNm: number | null | undefined
  ): { offsets: number[]; dropped: number[]; note: string | null }
  export function formatOffsetsPerSide(leftOffsets: number[], rightOffsets: number[]): string
}

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
      routeSequence?: string[]
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

  export function buildLegWidthSummaries(input: {
    routeType?: string
    routeNumber?: string
    waypoints: { ptIdent: string; lat: number; lon: number }[]
    widthTexts: string[]
    teams: unknown[]
    sortieBudgetNm?: number
    spanTrackPlan?: import('@survey-planning/corridorTrackPlan.js').SpanTrackPlanEntry[]
  }): {
    fromPt: string
    toPt: string
    leftNm: number | null
    rightNm: number | null
    leftOffsets: number[]
    rightOffsets: number[]
    leftNote: string | null
    rightNote: string | null
    chainNm: number
  }[]

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
      leftNote?: string | null
      rightNote?: string | null
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

declare module '@survey-planning/g1000Names.js' {
  export const G1000_USER_WAYPOINT_ID_MAX_LEN: number
  export const G1000_ROUTE_NAME_MAX_LEN: number
  export function assignOffsetWaypointNames(
    inputs: Array<{ originalName: string; side: 'inner' | 'outer'; sequence?: number }>
  ): { names: Array<{ g1000Name: string }>; error: string | null }
  export function laneWaypointName(
    originalName: string,
    side: 'inner' | 'outer',
    laneNumber: number
  ): { name: string; error: string | null }
  export function assignG1000WaypointNames(
    inputs: Array<{ originalName: string; prefix?: string }>
  ): { names: Array<{ g1000Name: string }>; error: string | null }
  export function sortieRouteName(
    routeLabel: string,
    sortieNumber: 1 | 2,
    side: 'inner' | 'outer'
  ): string
  export function sortieFileName(
    routeLabel: string,
    sortieNumber: 1 | 2,
    side: 'inner' | 'outer'
  ): string
}

declare module '@survey-planning/offsetRoutePlan.js' {
  export const G1000_USER_WAYPOINT_ID_MAX_LEN: number

  export type OffsetRoutePoint = {
    ptIdent: string
    g1000Name?: string
    originalName?: string
    lat: number
    lon: number
  }

  export type OffsetLegWidth = {
    leftNm: number
    rightNm: number
    /** Flown distance. Omitted means half of leftNm. Not halved again. */
    trackLeftNm?: number | null
    /** Flown distance. Omitted means half of rightNm. Not halved again. */
    trackRightNm?: number | null
    fromPt?: string
    toPt?: string
  }

  export function trackDistanceNm(explicitNm: number | null | undefined, corridorNm: number): number

  export type OffsetFlag = {
    index: number
    ptIdent: string
    side: 'left' | 'right'
    reason: 'foldBack' | 'outsideCorridor' | 'straightWidthChange'
    message: string
    lat: number
    lon: number
  }

  export type OffsetTrack = {
    side: 'left' | 'right'
    label?: 'inner' | 'outer'
    waypoints: OffsetRoutePoint[]
    flags: OffsetFlag[]
    nameError?: string | null
  }

  export function courseChangeDeg(
    a: { lat: number; lon: number },
    b: { lat: number; lon: number },
    c: { lat: number; lon: number }
  ): number

  export function crossTrackNm(
    point: { lat: number; lon: number },
    a: { lat: number; lon: number },
    b: { lat: number; lon: number }
  ): number

  export function buildOffsetTrack(
    waypoints: OffsetRoutePoint[],
    offsetNmPerLeg: number[],
    corridorNmPerLeg: number[],
    side: 'left' | 'right'
  ): OffsetTrack

  export function reverseOffsetTrack(waypoints: OffsetRoutePoint[]): OffsetRoutePoint[]

  export type RouteCurve = {
    innerSide: 'left' | 'right'
    outerSide: 'left' | 'right'
    sense: 'clockwise' | 'counterclockwise' | 'unclear'
    netTurnDeg: number
    note: string | null
  }

  export function routeCurveSide(
    waypoints: Array<{ lat: number; lon: number; ptIdent?: string; originalName?: string }>
  ): RouteCurve

  export function buildOffsetRoutes(
    waypoints: OffsetRoutePoint[],
    legWidths: OffsetLegWidth[],
    shapePoints?: Array<{ lat: number; lon: number; ptIdent?: string; originalName?: string }>
  ): {
    inner: OffsetTrack
    outer: OffsetTrack
    corridorLeft: OffsetRoutePoint[]
    corridorRight: OffsetRoutePoint[]
    flags: OffsetFlag[]
    nameError: string | null
    curve: RouteCurve
  }

  export function listUnparsedWidthTexts(widthTexts: string[]): string[]

  export function resolvePublishedLegWidths(
    waypoints: OffsetRoutePoint[],
    widthTexts: string[]
  ): {
    status: 'published' | 'partial'
    reason: 'unparsed' | 'missing' | null
    unparsed: string[]
    exclusions: string[]
    missing: {
      index: number
      fromPt: string
      toPt: string
      reason: 'unreadable' | 'not-covered'
      clause: string | null
    }[]
    legs: ({ fromPt: string; toPt: string } & OffsetLegWidth | null)[]
  }
}

declare module '@survey-planning/sortieLanePlan.js' {
  export function planSideLanes(opts: {
    points: Array<{
      ptIdent: string
      lat: number
      lon: number
      g1000Name?: string
      originalName?: string
    }>
    legWidths: Array<{ leftNm: number; rightNm: number } | null>
    side: 'left' | 'right'
    policy?: { firstOffsetNm?: number; stepNm?: number }
    departure?: { lat: number; lon: number; identifier?: string } | null
    landing?: { lat: number; lon: number; identifier?: string } | null
  }): {
    side: 'left' | 'right'
    pieces: Array<{
      startAt: string
      offsets: number[]
      routeSequence: string[]
      distanceNm: number
      ferryInNm?: number
      alongRouteNm?: number
      ferryOutNm?: number
      ferryInLabel?: string
      ferryOutLabel?: string
      fromPt: string
      toPt: string
    }>
    lanes: Array<{
      offsetNm: number
      laneIndex: number
      laneGroup: number
      direction: 'forward' | 'reverse'
      waypoints: import('@survey-planning/offsetRoutePlan.js').OffsetRoutePoint[]
    }>
    offsetsNm: number[]
    routeSequence: string[]
    distanceNm: number
    startAt: string | null
    note: string | null
  }
}

declare module '@survey-planning/segmentAssignment.js' {
  export function validateTeamSegments(
    pointIdents: string[],
    segments: Array<{ label: string; from?: string | null; to?: string | null }>
  ): { ok: boolean; messages: string[] }

  export function planTeamSegmentDay(opts: {
    points: Array<{ ptIdent: string; lat: number; lon: number; g1000Name?: string }>
    legWidths: Array<{ leftNm: number; rightNm: number } | null>
    fromPt: string
    toPt: string
    home: { lat: number; lon: number; identifier: string }
    refuel?: { lat: number; lon: number; identifier: string } | null
    sortie1Side?: 'left' | 'right'
    policy?: { firstOffsetNm?: number; stepNm?: number }
    budgetNm?: number
  }): {
    fromPt: string
    toPt: string
    totalNm: number
    refuel: { lat: number; lon: number; identifier: string } | null
    sorties: Array<{
      number: 1 | 2
      surveySide: 'left' | 'right'
      lanes: number
      waypoints: number
      distanceNm: number
      offsetsNm: number[]
      routeSequence: string[]
      startAt: string | null
      offsets: number[]
      ferryInNm: number
      alongRouteNm: number
      ferryOutNm: number
      overBudget: boolean
      departureIdent: string
      landingIdent: string
      startIdx: number
      endIdx: number
      waypointFrom: string
      waypointTo: string
    }>
  }

  export function teamNeedsRefuel(
    day: { sorties: Array<{ distanceNm: number }> },
    budgetNm?: number
  ): boolean

  export function suggestTwoTeamSplit(opts: {
    points: Array<{ ptIdent: string; lat: number; lon: number; g1000Name?: string }>
    legWidths: Array<{ leftNm: number; rightNm: number } | null>
    teams: Array<{ label: string; lat: number; lon: number; identifier: string }>
    policy?: { firstOffsetNm?: number; stepNm?: number }
    budgetNm?: number
  }): {
    over: number
    totalNm: number
    days: Array<{
      label: string
      fromPt: string
      toPt: string
      day: ReturnType<typeof planTeamSegmentDay>
    }>
  } | null
}

declare module '@survey-planning/planComparison.js' {
  export const PER_SEGMENT_SPACING_NOTE: string

  export type PlanningInsert = {
    afterIdent: string
    alongNm: number
    point: { ptIdent: string; lat: number; lon: number; g1000Name?: string; originalName?: string }
  }

  export type ComparisonAirport = {
    identifier: string
    name: string
    latitude: number
    longitude: number
    elevation?: number
  }

  export type ComparisonTeam = {
    identifier: string
    from: string
    to: string
    home: string
    refuel: string | null
    refuelAirport: ComparisonAirport | null
    sorties: Array<{ number: number; distanceNm: number; overBudget: boolean }>
    totalNm: number
  }

  export type ComparisonOption = {
    id: string
    title: string
    teams: ComparisonTeam[]
    refuelStops: number
    wingNm: number
    allUnder: boolean
    recommended: boolean
    insertedPoint: PlanningInsert | null
    boundaryNote: string | null
  }

  export function expandPlanningRoute(
    points: Array<{ ptIdent: string; lat: number; lon: number; g1000Name?: string; originalName?: string }>,
    widths: Array<{ leftNm: number; rightNm: number } | null>,
    insertedPoint: PlanningInsert | null
  ): {
    points: Array<{ ptIdent: string; lat: number; lon: number; g1000Name?: string; originalName?: string }>
    widths: Array<{ leftNm: number; rightNm: number } | null>
  }

  export function compareSurveyPlans(opts: {
    points: Array<{ ptIdent: string; lat: number; lon: number; g1000Name?: string }>
    legWidths: Array<{ leftNm: number; rightNm: number } | null>
    homes: Array<{ identifier: string; name?: string; latitude: number; longitude: number; elevation?: number }>
    refuel?: { identifier: string; name?: string; latitude: number; longitude: number; elevation?: number } | null
    saved?: Array<{ identifier: string; from: string; to: string; refuel?: boolean }>
    policy?: { firstOffsetNm?: number; stepNm?: number }
    budgetNm?: number
  }): { perSegmentSpacing: boolean; spacingNote: string; options: ComparisonOption[] }

  export function assignmentEditsForOption(
    option: ComparisonOption,
    crews: Array<{ id: string; identifier: string }>
  ): {
    segments: Record<string, { from: string; to: string }>
    refuels: Record<string, ComparisonAirport | null>
    insertedPoint: PlanningInsert | null
  }
}
