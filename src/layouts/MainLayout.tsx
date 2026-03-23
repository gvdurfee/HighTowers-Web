import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { db } from '@/db/schema'

type DetailView =
  | 'workflow'
  | 'flight-plans'
  | 'tower-analysis'
  | 'map'
  | 'report-form'
  | 'export'
  | 'new-flight-plan'

const routeMap: Record<DetailView, string> = {
  workflow: '/workflow',
  'flight-plans': '/flight-plans',
  'tower-analysis': '/tower-analysis',
  map: '/map',
  'report-form': '/report-form',
  export: '/export',
  'new-flight-plan': '/flight-plans/new',
}

export function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const nav = (view: DetailView) => {
    navigate(routeMap[view])
  }

  const isActive = (view: DetailView) => {
    const path = routeMap[view]
    if (path === '/flight-plans') {
      return location.pathname === '/flight-plans' && !location.pathname.includes('/new')
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-white border-r border-gray-200 transition-all ${
          sidebarCollapsed ? 'w-14' : 'w-64'
        }`}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200">
          {!sidebarCollapsed && (
            <h1 className="text-lg font-bold text-cap-ultramarine">HighTowers</h1>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded hover:bg-gray-100"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="text-gray-600">{sidebarCollapsed ? '→' : '←'}</span>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="space-y-0.5">
            <li className="px-2 py-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 block">
                {!sidebarCollapsed && 'Getting Started'}
              </span>
              <button
                type="button"
                onClick={() => nav('workflow')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive('workflow')
                    ? 'bg-cap-ultramarine/10 text-cap-ultramarine font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span aria-hidden>📋</span>
                {!sidebarCollapsed && <span>Workflow Guide</span>}
              </button>
            </li>
            <li className="px-2 py-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 block">
                {!sidebarCollapsed && 'Mission Planning'}
              </span>
              <button
                type="button"
                onClick={() => nav('flight-plans')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive('flight-plans') || isActive('new-flight-plan')
                    ? 'bg-cap-ultramarine/10 text-cap-ultramarine font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span aria-hidden>✈️</span>
                {!sidebarCollapsed && <span>Flight Plans</span>}
              </button>
            </li>
            <li className="px-2 py-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 block">
                {!sidebarCollapsed && 'Mission Execution'}
              </span>
              <button
                type="button"
                onClick={() => nav('tower-analysis')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive('tower-analysis')
                    ? 'bg-cap-ultramarine/10 text-cap-ultramarine font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span aria-hidden>📷</span>
                {!sidebarCollapsed && <span>Tower Data Analysis</span>}
              </button>
              <button
                type="button"
                onClick={() => nav('map')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive('map')
                    ? 'bg-cap-ultramarine/10 text-cap-ultramarine font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span aria-hidden>🗺️</span>
                {!sidebarCollapsed && <span>Map View</span>}
              </button>
            </li>
            <li className="px-2 py-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 block">
                {!sidebarCollapsed && 'Reporting'}
              </span>
              <button
                type="button"
                onClick={() => nav('report-form')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive('report-form')
                    ? 'bg-cap-ultramarine/10 text-cap-ultramarine font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span aria-hidden>📄</span>
                {!sidebarCollapsed && <span>Air Force Report Form</span>}
              </button>
              <button
                type="button"
                onClick={() => nav('export')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive('export')
                    ? 'bg-cap-ultramarine/10 text-cap-ultramarine font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span aria-hidden>📤</span>
                {!sidebarCollapsed && <span>Export Data</span>}
              </button>
            </li>
            <li className="px-2 py-1 mt-4 border-t border-gray-200 pt-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 block">
                {!sidebarCollapsed && 'Data'}
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('Clear all data? This cannot be undone.')) return
                  await db.transaction('rw', ['towerReports', 'towerLocations', 'cameraData', 'missions', 'waypoints', 'airports', 'flightPlans'], async () => {
                    await db.towerReports.clear()
                    await db.towerLocations.clear()
                    await db.cameraData.clear()
                    await db.missions.clear()
                    await db.waypoints.clear()
                    await db.airports.clear()
                    await db.flightPlans.clear()
                  })
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-cap-scarlet hover:bg-red-50"
              >
                <span aria-hidden>🗑️</span>
                {!sidebarCollapsed && <span>Clear All Data</span>}
              </button>
            </li>
          </ul>
        </nav>
      </aside>
      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
