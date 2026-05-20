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

- `CORS_ORIGINS` (recommended for production): Comma-separated **browser** origins allowed to call this API (e.g. `https://youruser.github.io` for GitHub Pages, or your wing site origin). If unset, only local Vite/preview origins are allowed. See **`docs/API_HOSTING.md`**.
- `MTR_CYCLE_DATE` (optional): Override cycle date (YYYY-MM-DD) when the FAA index is unreachable (e.g. 403).
- `PORT` (optional): Server port (default 3001).

The server loads **`../.env`** from the HighTowers-Web root (via `dotenv`), so you can keep Mapbox and Copernicus variables in one file.

### NAIP overlay (Survey Location map patch)

Used by **`GET /api/recent-imagery`** (Survey Location → **Overlay NAIP map patch**). Fetches **USDA NAIP** orthoimagery from public ArcGIS ImageServer endpoints. **No API keys** or `.env` variables are required.

Imagery is **~60 cm** resolution in CONUS (program refresh is roughly **every 3 years** per area). The server returns attribution headers; the UI shows **Imagery © USDA Farm Service Agency (NAIP); distributed by USGS**.

Requires outbound HTTPS from the Node server to `naip.imagery1.arcgis.com` and/or `gis.apfo.usda.gov`.

## Endpoints

- `GET /api/mtr/cycle` — Current NASR effective date
- `GET /api/mtr/waypoints?routeType=IR&routeNumber=111&entry=A&exit=Q` — Waypoints for a route segment
- `GET /api/recent-imagery?lat=&lon=&halfMiles=0.5` — NAIP ortho patch (~1 mi square by default). Optional: `w`, `h` (256–1024, default **1024**). Response headers: `X-Imagery-Attribution`, optional `X-Imagery-Vintage`.
