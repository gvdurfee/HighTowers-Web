import { SINGLE_AIRCREW_SPUR_HINT } from '@/content/spurHints'
import { SpurReviewSection } from '@/components/SpurReviewSection'
import { handledSpurTipIndexes } from '@/services/singleAircrewSpur'
import type { SpurPoint } from '@/services/spurPreview'
import type { OffsetLegWidth } from '@survey-planning/offsetRoutePlan.js'
import type { SortieSide } from '@/services/offsetRouteFpl'

/**
 * Single-aircrew plans never show Spur review. A detected spur replaces it
 * with the placeholder hint. Any other plan keeps Spur review, except a
 * coordinator anchor, which never had that section.
 */
export function SpurPlanNotice(props: {
  teamKnown: boolean
  singleAircrew: boolean
  isAnchorPlan: boolean
  waypoints: SpurPoint[]
  legWidths: OffsetLegWidth[] | null
  sortie1Side: SortieSide | null
}) {
  if (!props.teamKnown) return null
  const hasSpur = handledSpurTipIndexes(props.waypoints).length > 0
  if (props.singleAircrew) {
    if (!hasSpur) return null
    return (
      <section className="p-4 bg-white rounded-lg border border-gray-200" aria-label="Spur">
        <p className="text-sm text-gray-800">{SINGLE_AIRCREW_SPUR_HINT}</p>
      </section>
    )
  }
  if (props.isAnchorPlan) return null
  return (
    <SpurReviewSection
      waypoints={props.waypoints}
      legWidths={props.legWidths}
      sortie1Side={props.sortie1Side}
    />
  )
}
