type FlightPlanLoadMethodHelpModalProps = {
  isOpen: boolean
  onClose: () => void
}

/**
 * Explains Load full route, Waypoint sequence, and G1000 user waypoint library.
 */
export function FlightPlanLoadMethodHelpModal({
  isOpen,
  onClose,
}: FlightPlanLoadMethodHelpModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="flight-plan-load-help-title"
        className="bg-white rounded-xl p-6 max-w-2xl max-h-[85vh] overflow-y-auto shadow-lg"
      >
        <h2 id="flight-plan-load-help-title" className="text-xl font-bold text-gray-900 mb-4">
          How to load route waypoints
        </h2>
        <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
          <p>
            When you create a flight plan, you choose how to pull <strong>MTR</strong> (military
            training route) points from the database. All options produce coordinates and
            G1000-style names for export—the difference is <em>which</em> points you pull and{' '}
            <em>how you pick them</em>.
          </p>
          <p className="text-xs text-gray-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            <strong>Departure / destination:</strong> Use <strong>ICAO</strong> (e.g. KABQ){' '}
            <strong>or FAA location ID / NASR identifier</strong> (e.g. 0E0).{' '}
            <strong>Fetch</strong> looks up either against the FAA airport data the app uses.
          </p>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">Load full route</h3>
            <p>
              Picture the route as a <strong>published line of points in order</strong>. You enter
              the route name (for example <strong>IR109</strong>) and where you{' '}
              <strong>enter</strong> and <strong>leave</strong> that line (often letters like{' '}
              <strong>A</strong> to <strong>Q</strong>).
            </p>
            <p>
              The app loads <strong>every waypoint along that segment</strong>, in order—the same
              stretch you expect from ForeFlight Military Flight Bag or your AP/1B for that slice.
            </p>
            <p className="text-gray-600">
              <strong>Use this</strong> for the whole published segment in one step, including many{' '}
              <strong>round-robin</strong> flights (same airport departure and destination).
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">Waypoint sequence</h3>
            <p>
              Name only the <strong>specific points you need</strong>. Put the route in{' '}
              <strong>Route identifier</strong> once (e.g. <strong>IR109</strong>) and list suffixes
              separated by commas or spaces (e.g. <strong>AM, P1, AQ</strong>), or leave it blank
              and enter full IDs like <strong>IR109-AM</strong>.
            </p>
            <p className="text-gray-600">
              <strong>Use this</strong> for custom lists or blended routes. Repeating the same
              waypoint in the list is <strong>allowed</strong> when departure and destination are{' '}
              <strong>different</strong>—typical for longer sorties. Exported{' '}
              <code className="bg-gray-100 px-0.5 rounded text-xs">.fpl</code> files still use a
              clean <strong>waypoint table</strong> in the file (each G1000 name once) while
              preserving your full <strong>route order</strong>.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">G1000 user waypoint library</h3>
            <p>
              Same entry style as Waypoint sequence, but each <strong>G1000 waypoint name</strong>{' '}
              may appear <strong>only once</strong>. If you list a token that resolves to the same
              name as an earlier one, it is <strong>skipped</strong> and you are told after create.
            </p>
            <p>
              <strong>Requires two different airports</strong> (ICAO or FAA location ID / NASR
              identifier—not round-robin). For same airport both ends, use{' '}
              <strong>Waypoint sequence</strong> or <strong>Load full route</strong>.
            </p>
            <p>
              Goal: import a <code className="bg-gray-100 px-0.5 rounded text-xs">.fpl</code> into
              the G1000 so <strong>user waypoints</strong> load into the system; you can then delete
              this flight plan from the catalog on the avionics while keeping those waypoints for
              building shorter plans. Behavior can vary slightly by software version—confirm in your
              POH or supplement.
            </p>
            <p className="text-gray-600 text-xs border-l-2 border-amber-300 pl-3">
              <strong>Pilot responsibility:</strong> Remove or update survey-specific user
              waypoints when the season ends. Published routes and fixes are not guaranteed to match
              the following year.
            </p>
          </section>

          <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
            Use <strong>Fetch</strong> before creating the plan to confirm the database has your
            points. If you see missing points, still press <strong>Create Flight Plan</strong>—then
            <strong>scroll</strong> on the next page to enter coordinates for each missing waypoint
            before exporting. You can find coordinates in the <strong>AP/1B</strong>, or in{' '}
            <strong>ForeFlight</strong> by tapping a waypoint in the flight plan and copying the
            lat/long from the popup. Put{' '}
            <code className="bg-gray-100 px-0.5 rounded text-xs">.fpl</code> files in the{' '}
            <strong>root</strong> of a FAT32 SD card for G1000 import (see your avionics docs).
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90"
        >
          Done
        </button>
      </div>
    </div>
  )
}
