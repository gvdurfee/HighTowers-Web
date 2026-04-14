import { useNavigate } from 'react-router-dom'

export function WorkflowGuidePage() {
  const navigate = useNavigate()

  const steps = [
    {
      number: 1,
      title: 'Flight Planning',
      summary:
        'Create a flight plan that matches the one in ForeFlight. Use Map View for a visual check. Export a .fpl file for import into the G1000.',
      path: '/flight-plans/new',
    },
    {
      number: 2,
      title: 'Air Force Report Form',
      summary:
        'Start the report foundation for the Air Force customer. This view accumulates tower measurements and bearing/distance information.',
      path: '/report-form',
    },
    {
      number: 3,
      title: 'Tower Data Analysis',
      summary:
        'Select an image. Use Look for Tower on Map to set tower coordinates. Complete Height Measurement and store the results.',
      path: '/tower-analysis',
    },
    {
      number: 4,
      title: 'Export Data',
      summary:
        'Generate the Air Force Route Survey Report PDF and email or share it with the customer.',
      path: '/export',
    },
  ]

  return (
    <div className="app-page-shell overflow-auto">
      <div className="app-panel max-w-2xl mx-auto p-6 md:p-8">
        <h1 className="text-2xl font-bold text-cap-ultramarine mb-2">
          Workflow Guide
        </h1>
        <p className="text-gray-600 mb-8">
          Follow these steps in order to complete an Air Force Route Survey.
        </p>
        <div className="mb-8 rounded-xl border border-gray-200 bg-slate-50 p-4 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900 mb-2">Guided tips (lightbulb icons)</h2>
          <p className="mb-3">
            The four steps below are the full path to complete the customer report. Throughout those
            workflow areas, the app can show optional <strong>numbered lightbulb tips</strong> on key
            screens—for example <strong>New Flight Plan</strong>, <strong>Air Force Report Form</strong>,{' '}
            <strong>Tower Data Analysis</strong>, and <strong>Look for Tower on Map</strong>. They are
            there to help <strong>first-time users</strong> get oriented and to act as a{' '}
            <strong>refresher</strong> when you come back to the app season after season.
          </p>
          <p className="mb-3">
            Reading or dismissing tips does <strong>not</strong> change how the underlying features work.
            If you do not need to review any of them, you can ignore the lightbulbs and move through all
            four sections in order to finish the report the same way.
          </p>
          <p className="mb-2">
            Open a tip when you want context, then close it with <strong>Got it</strong> (or{' '}
            <strong>Not now</strong>) when you are ready to continue.
          </p>
          <p className="mb-2">
            Dismissed tips are remembered in <strong>browser storage on this device</strong> so they do
            not repeat every visit.
          </p>
          <p className="mb-3">
            <strong>Reset hints</strong> on New Flight Plan, Air Force Report Form, or Tower Data
            Analysis clears every dismissed tip for the whole app (the same storage is shared across
            those screens).
          </p>
          <p>
            On the <strong>Air Force Report Form</strong>, optional <strong>Additional Notes</strong>{' '}
            sit at the <strong>bottom</strong> of the page; the export PDF repeats them on the{' '}
            <strong>last appendix page</strong> under the mission map.
          </p>
        </div>
        <div className="space-y-4">
          {steps.map((step) => (
            <div
              key={step.number}
              className="p-4 rounded-xl bg-slate-50 border border-gray-200"
            >
              <div className="flex gap-4">
                <span className="flex-shrink-0 w-9 h-9 rounded-full bg-cap-ultramarine text-white font-bold flex items-center justify-center shadow-sm">
                  {step.number}
                </span>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-gray-900">{step.title}</h2>
                  <p className="text-sm text-gray-600 mt-1">{step.summary}</p>
                  <button
                    type="button"
                    onClick={() => navigate(step.path)}
                    className="mt-3 text-sm font-medium text-cap-ultramarine hover:underline"
                  >
                    Go to {step.title} →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
