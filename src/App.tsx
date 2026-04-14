import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { WorkflowGuidePage } from '@/pages/WorkflowGuidePage'
import { FlightPlanListPage } from '@/pages/FlightPlanListPage'
import { FlightPlanDetailPage } from '@/pages/FlightPlanDetailPage'
import { NewFlightPlanPage } from '@/pages/NewFlightPlanPage'
import { TowerAnalysisPage } from '@/pages/TowerAnalysisPage'
import { MissionMapPage } from '@/pages/MissionMapPage'
import { ReportFormPage } from '@/pages/ReportFormPage'
import { ExportDataPage } from '@/pages/ExportDataPage'

function App() {
  const basename =
    import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

  return (
    <BrowserRouter basename={basename}>
      <div className="h-full">
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/workflow" replace />} />
          <Route path="workflow" element={<WorkflowGuidePage />} />
          <Route path="flight-plans" element={<FlightPlanListPage />} />
          <Route path="flight-plans/new" element={<NewFlightPlanPage />} />
          <Route path="flight-plans/:id" element={<FlightPlanDetailPage />} />
          <Route path="tower-analysis" element={<TowerAnalysisPage />} />
          <Route path="map" element={<MissionMapPage />} />
          <Route path="report-form" element={<ReportFormPage />} />
          <Route path="export" element={<ExportDataPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
