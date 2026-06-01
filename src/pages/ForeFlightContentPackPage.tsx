import { Navigate } from 'react-router-dom'

/** Legacy route — content pack close-out now lives on Export Reported Data. */
export function ForeFlightContentPackPage() {
  return <Navigate to="/export" replace />
}
