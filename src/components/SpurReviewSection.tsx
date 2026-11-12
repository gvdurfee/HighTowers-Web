import { useState } from 'react'
import { buildSpurPreview, type SpurPoint } from '@/services/spurPreview'
import type { OffsetLegWidth } from '@survey-planning/offsetRoutePlan.js'
import type { SortieSide } from '@/services/offsetRouteFpl'

export function SpurReviewSection(props: {
  waypoints: SpurPoint[]
  legWidths: OffsetLegWidth[] | null
  sortie1Side: SortieSide | null
}) {
  const preview = buildSpurPreview({
    waypoints: props.waypoints,
    legWidths: props.legWidths,
    sortie1Side: props.sortie1Side,
  })
  const [open, setOpen] = useState(false)
  const [rejected, setRejected] = useState(false)
  if (!preview.detected) return null

  return (
    <section className="p-4 bg-white rounded-lg border border-gray-200" aria-labelledby="spur-review">
      <div className="flex items-start justify-between gap-2">
        <h2 id="spur-review" className="font-semibold text-gray-900">Spur review</h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="spur-review-details"
          onClick={() => setOpen((current) => !current)}
          className="px-3 py-1.5 text-sm font-medium text-cap-ultramarine border border-cap-ultramarine/40 rounded-lg hover:bg-cap-ultramarine/5"
        >
          {open ? 'Collapse' : 'Expand'}
        </button>
      </div>
      <p className="text-sm text-gray-600 mt-1">
        Optional and advisory. This only matters when a route goes out and back along the same leg. Nothing here changes your sortie files.
      </p>
      {open ? (
        <div id="spur-review-details">
          <p className="text-sm text-gray-800 mt-3">{preview.discrepancy}</p>
          <p className="text-sm text-gray-800 mt-2">{preview.sortie2}</p>
          {preview.hits.map((hit) => (
            <p key={`${hit.index}-${hit.turnName}`} className="text-sm text-gray-800 mt-2">
              Out-and-back at {hit.turnName}: {hit.outboundName} to {hit.turnName} and back to {hit.returnName}. Course change {hit.courseChangeDeg.toFixed(0)}°.
            </p>
          ))}
          <div className="mt-3 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-600">
                <tr>
                  <th className="py-1 pr-2">Leg</th>
                  <th className="py-1 pr-2">Travel</th>
                  <th className="py-1 pr-2">Inner track side</th>
                  <th className="py-1">Proposal role</th>
                </tr>
              </thead>
              <tbody>
                {preview.legs.map((leg) => (
                  <tr key={`${leg.from}-${leg.to}-${leg.travel}`} className="border-t border-gray-100 align-top">
                    <td className="py-1 pr-2">{leg.from} → {leg.to}</td>
                    <td className="py-1 pr-2">{leg.travel}</td>
                    <td className="py-1 pr-2">{leg.geographicSide}</td>
                    <td className="py-1">{leg.proposalRole}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.distinctPoints.length > 0 && (
            <ul className="mt-3 text-sm text-gray-800 list-disc pl-5">
              {preview.distinctPoints.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {preview.warnings.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-900">Warnings, still visible</p>
              <ul className="text-sm text-gray-800 list-disc pl-5">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-gray-800 mt-3">
            The turn between the two offset endpoints is UNRESOLVED. No savings are claimed.
            Excluded from any distance: {preview.efficiency.excluded.join(' ')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              aria-disabled="true"
              title={preview.acceptBlockedReason}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-medium"
            >
              Accept spur change
            </button>
            <button
              type="button"
              onClick={() => setRejected(true)}
              className="px-4 py-2 rounded-lg border border-gray-400 text-gray-900 font-medium"
            >
              Reject
            </button>
          </div>
          <p className="text-sm text-gray-800 mt-2">{preview.acceptBlockedReason}</p>
          {rejected && (
            <p className="text-sm text-gray-900 mt-2" role="status">
              Original plan kept. Nothing was written.
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}
