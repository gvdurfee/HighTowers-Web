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

  const navButton = (active: boolean) =>
    `w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      active
        ? 'bg-white/15 text-cap-yellow font-medium ring-1 ring-cap-yellow/40'
        : 'text-white/90 hover:bg-white/10'
    }`

  return (
    <div className="flex h-screen min-h-0 bg-cap-ultramarine">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-black/25 border-r border-white/15 backdrop-blur-sm transition-all ${
          sidebarCollapsed ? 'w-14' : 'w-64'
        }`}
      >
        <div className="flex items-center justify-between h-14 px-3 border-b border-white/10 shrink-0">
          {!sidebarCollapsed && (
            <h1 className="text-lg font-bold text-white tracking-tight">
              High<span className="text-cap-yellow">Towers</span>
            </h1>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-md text-white/90 hover:bg-white/10"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span aria-hidden>{sidebarCollapsed ? '→' : '←'}</span>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 min-h-0">
          <ul className="space-y-0.5">
            <li className="px-2 py-1">
              <span className="text-[11px] font-semibold text-cap-yellow/90 uppercase tracking-wider px-3 py-2 block">
                {!sidebarCollapsed && 'Getting Started'}
              </span>
              <button
                type="button"
                onClick={() => nav('workflow')}
                className={navButton(isActive('workflow'))}
              >
                <span aria-hidden>📋</span>
                {!sidebarCollapsed && <span>Workflow Guide</span>}
              </button>
            </li>
            <li className="px-2 py-1">
              <span className="text-[11px] font-semibold text-cap-yellow/90 uppercase tracking-wider px-3 py-2 block">
                {!sidebarCollapsed && 'Mission Planning'}
              </span>
              <button
                type="button"
                onClick={() => nav('flight-plans')}
                className={navButton(isActive('flight-plans') || isActive('new-flight-plan'))}
              >
                <span aria-hidden>✈️</span>
                {!sidebarCollapsed && <span>Flight Plans</span>}
              </button>
            </li>
            <li className="px-2 py-1">
              <span className="text-[11px] font-semibold text-cap-yellow/90 uppercase tracking-wider px-3 py-2 block">
                {!sidebarCollapsed && 'Mission Execution'}
              </span>
              <button
                type="button"
                onClick={() => nav('tower-analysis')}
                className={navButton(isActive('tower-analysis'))}
              >
                <span aria-hidden>📷</span>
                {!sidebarCollapsed && <span>Tower Data Analysis</span>}
              </button>
              <button
                type="button"
                onClick={() => nav('map')}
                className={navButton(isActive('map'))}
              >
                <span aria-hidden>🗺️</span>
                {!sidebarCollapsed && <span>Map View</span>}
              </button>
            </li>
            <li className="px-2 py-1">
              <span className="text-[11px] font-semibold text-cap-yellow/90 uppercase tracking-wider px-3 py-2 block">
                {!sidebarCollapsed && 'Reporting'}
              </span>
              <button
                type="button"
                onClick={() => nav('report-form')}
                className={navButton(isActive('report-form'))}
              >
                <span aria-hidden>📄</span>
                {!sidebarCollapsed && <span>Air Force Report Form</span>}
              </button>
              <button
                type="button"
                onClick={() => nav('export')}
                className={navButton(isActive('export'))}
              >
                <span aria-hidden>📤</span>
                {!sidebarCollapsed && <span>Export Data</span>}
              </button>
            </li>
            <li className="px-2 py-1 mt-4 border-t border-white/10 pt-2">
              <span className="text-[11px] font-semibold text-cap-yellow/90 uppercase tracking-wider px-3 py-2 block">
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
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-cap-pimento hover:bg-white/10 border border-transparent hover:border-cap-pimento/40"
              >
                <span aria-hidden>🗑️</span>
                {!sidebarCollapsed && <span>Clear All Data</span>}
              </button>
            </li>
          </ul>
        </nav>
      </aside>
      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-auto bg-cap-ultramarine">
        <Outlet />
      </main>
    </div>
  )
}
