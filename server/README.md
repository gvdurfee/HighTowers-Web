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

The server loads **`../.env`** from the HighTowers-Web root (via `dotenv`), so you can keep Mapbox and Copernicus variables in one file.

### Copernicus Data Space (recent Sentinel-2 overlay)

Used by **`GET /api/recent-imagery`** (Survey Location map in the app). Requires an OAuth **client** from your Copernicus account:

1. Open [Copernicus Data Space Dashboard](https://shapps.dataspace.copernicus.eu/dashboard/#/account/settings) → **User Settings** → **OAuth clients** → **Create**.
2. Copy **Client ID** and **Client secret** (secret is shown once).
3. Add to **`HighTowers-Web/.env`** (same folder as `VITE_*` vars):

```env
CDSE_OAUTH_CLIENT_ID=your_client_id
CDSE_OAUTH_CLIENT_SECRET=your_client_secret
```

Restart `npm run server` or `npm run dev:all`. Without these variables, the endpoint returns **503** with a short explanation.

Imagery is **Sentinel-2 L2A** true-color (RGB), **~10 m** resolution; mosaicking prefers **least cloudy** scenes in the last ~150 days.

## Endpoints

- `GET /api/mtr/cycle` — Current NASR effective date
- `GET /api/mtr/waypoints?routeType=IR&routeNumber=111&entry=A&exit=Q` — Waypoints for a route segment
- `GET /api/recent-imagery?lat=&lon=&halfMiles=0.5` — PNG patch (~1 mi square by default) for overlay; requires `CDSE_OAUTH_*` (see above). Optional: `w`, `h` (256–1024) output dimensions (default **1024** for sharper on-screen sampling; Sentinel-2 remains ~10&nbsp;m on the ground).
