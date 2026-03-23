# FAA NASR MTR Backend

Provides MTR waypoint data from the official FAA 28-Day NASR dataset (same source as ForeFlight).

## Behavior

- **Date check**: On each flight plan creation (waypoint sequence or full route), the backend:
  1. Resolves the current NASR cycle date (from FAA index or fallback)
  2. Downloads `{date}_MTR_CSV.zip` from nfdc.faa.gov if not cached
  3. Parses `MTR_PT.csv` and returns waypoints for the requested route

- **Routes**: Only IR and VR routes are in FAA MTR CSV. SR routes fall back to ArcGIS in the frontend.

- **Cache**: Extracted CSVs are cached under `server/.mtr-cache` by effective date to avoid repeated downloads.

## Running

```bash
# From HighTowers-Web/
npm run server        # Backend only (port 3001)
npm run dev:all       # Backend + Vite (proxy /api -> 3001)
```

## Environment

- `MTR_CYCLE_DATE` (optional): Override cycle date (YYYY-MM-DD) when the FAA index is unreachable (e.g. 403).
- `PORT` (optional): Server port (default 3001).

## Endpoints

- `GET /api/mtr/cycle` — Current NASR effective date
- `GET /api/mtr/waypoints?routeType=IR&routeNumber=111&entry=A&exit=Q` — Waypoints for a route segment
