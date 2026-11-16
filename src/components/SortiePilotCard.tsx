import type { SortieFplPilotBrief } from '@/services/sortieFplExport'

type SortiePilotCardProps = {
  brief: SortieFplPilotBrief
  isOpen: boolean
  onClose: () => void
}

export function SortiePilotCard({ brief, isOpen, onClose }: SortiePilotCardProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sortie-pilot-card-title"
        className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-lg"
      >
        <h2 id="sortie-pilot-card-title" className="text-xl font-bold text-gray-900 mb-1">
          Sortie pilot brief
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          G1000 <code className="bg-gray-100 px-1 rounded text-xs">{brief.filename}</code> downloaded.
          The file already contains each offset lane. Fly the loaded route.
        </p>

        <dl className="text-sm space-y-2 mb-4">
          <div className="flex gap-2">
            <dt className="font-semibold text-gray-800 w-28 shrink-0">Team / dep</dt>
            <dd className="text-gray-700">{brief.teamLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-gray-800 w-28 shrink-0">Side</dt>
            <dd className="text-gray-700">{brief.side}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-gray-800 w-28 shrink-0">Ferry</dt>
            <dd className="text-gray-700 font-mono">
              {brief.ferryInLabel ?? brief.teamLabel} → {brief.ferryOutLabel ?? brief.teamLabel}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-gray-800 w-28 shrink-0">Range</dt>
            <dd className="text-gray-700 font-mono">{brief.rangeLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-gray-800 w-28 shrink-0">Start at</dt>
            <dd className="text-gray-700 font-mono">{brief.startAt}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-gray-800 w-28 shrink-0">Passes</dt>
            <dd className="text-gray-700">{brief.passCount}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-gray-800 w-28 shrink-0">Offsets (NM)</dt>
            <dd className="text-gray-700 font-mono">{brief.offsetsLabel}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-semibold text-gray-800 w-28 shrink-0">Route points</dt>
            <dd className="text-gray-700">{brief.routePointCount} user waypoints in serpentine</dd>
          </div>
        </dl>

        {brief.warnRoutePointLimit && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4" role="alert">
            This sortie has many route points. Confirm your G1000 accepts the full active route after import.
          </p>
        )}

        <div className="space-y-3 text-sm text-gray-700 leading-relaxed border-t border-gray-100 pt-4">
          <section>
            <h3 className="font-semibold text-gray-900 mb-1">Offset lanes</h3>
            <p className="text-sm text-gray-700 mb-2">
              Lane numbers are fixed: lane 1 = 2.5 NM from centerline on every sortie. Expect turns up to about {brief.turnDeg ?? 155}° at lane entry and exit; join the lane, don&apos;t cut the corner.
            </p>
            <p className="mb-2">Each sortie lists its side; fly the side shown.</p>
            {brief.sideNote && <p className="mb-2">{brief.sideNote}</p>}
            <p>
              Each lane is its own user waypoints at the offset coordinates. Load the route and fly it.
              Lane spacing for this sortie:{' '}
              <strong className="font-mono">{brief.offsetsLabel}</strong> NM.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-gray-900 mb-1">Sharp turns</h3>
            <p>
              The route follows the offset through each turn. Stay on the loaded flight plan.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-gray-900 mb-1">User waypoints</h3>
            <p>
              Clear survey-specific user waypoints in the G1000 before and after import per wing SOP. The{' '}
              <code className="bg-gray-100 px-0.5 rounded text-xs">.fpl</code> loads names once in the library and
              defines serpentine traversal in the active route.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-gray-900 mb-1">Multi-aircraft &amp; recovery days</h3>
            <p className="mb-2">
              When several aircraft survey the same corridor, <strong>deconfliction is pilot responsibility</strong>
              — maintain radio contact and <strong>stagger takeoff times</strong>. Announce entering and exiting each
              lane by waypoint name, for example &apos;entering {brief.laneExample ?? 'B1O'}&apos;.
            </p>
            {brief.crossingNote && <p className="mb-2">{brief.crossingNote}</p>}
            {brief.progressLines && brief.progressLines.length > 0 && (
              <div className="mb-2">
                {brief.progressLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}
            {(brief.sortieNumber ?? 1) > 1 && (
              <p>
                This sortie is already in flying order; load it and fly it as listed. Do not invert the flight plan on the
                G1000.
              </p>
            )}
          </section>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 focus:outline-none focus:ring-2 focus:ring-cap-ultramarine focus:ring-offset-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
