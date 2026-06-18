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
          Use this card for parallel-track setup before flying.
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
            <h3 className="font-semibold text-gray-900 mb-1">Parallel track</h3>
            <p>
              Before each directed leg, activate <strong>Parallel Track</strong> in the flight plan menu at the
              matching offset (left or right per this sortie). Offsets for this sortie:{' '}
              <strong className="font-mono">{brief.offsetsLabel}</strong> NM.
            </p>
          </section>
          <section>
            <h3 className="font-semibold text-gray-900 mb-1">Heading mode (&gt;120° turns)</h3>
            <p>
              When a turn exceeds about 120°, parallel track may drop and GPS will proceed direct to the next fix.
              Use <strong>Heading</strong> mode to hold offset manually, then re-enable parallel track in the flight
              plan menu and return to <strong>GPS</strong> navigation.
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
