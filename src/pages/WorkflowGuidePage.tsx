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
        'Select an image. Use Survey Location to populate fly-over coordinates. Complete Height Measurement and store the results.',
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
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-cap-ultramarine mb-2">
        Workflow Guide
      </h1>
      <p className="text-gray-600 mb-8">
        Follow these steps in order to complete an Air Force Route Survey.
      </p>
      <div className="space-y-4">
        {steps.map((step) => (
          <div
            key={step.number}
            className="p-4 rounded-xl bg-cap-silver/20 border border-gray-200"
          >
            <div className="flex gap-4">
              <span className="flex-shrink-0 w-9 h-9 rounded-full bg-cap-ultramarine text-white font-bold flex items-center justify-center">
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
  )
}
