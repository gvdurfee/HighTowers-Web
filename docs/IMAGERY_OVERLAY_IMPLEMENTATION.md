# Recent imagery overlay — implementation path

This document sketches how to add an **optional, georeferenced imagery patch** on top of the Survey Location map so users can **visually** spot newer structures when the default basemap is stale. **Recorded coordinates** remain the map center / crosshair (unchanged).

## Goals

- User clicks **“Load recent imagery overlay”** when the default satellite layer is outdated.
- A **~1 mile square** (configurable) patch centered on the current map center is **aligned in WGS‑84 / Web Mercator** with the Mapbox map.
- Overlay is **visual only**; **Record Location** still uses `viewState` center (same as today).

## Current implementation (Copernicus Data Space)

- **OAuth2** (client credentials): `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`
- **Process API:** `https://sh.dataspace.copernicus.eu/process/v1` — Sentinel-2 L2A true-color PNG for the bbox ([CDSE examples](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process/Examples/S2L2A.html)).
- **Server code:** `server/sentinelHubImagery.js` (bbox math + token cache + `fetchSentinel2TrueColorPng`).
- **Env (never commit):** `CDSE_OAUTH_CLIENT_ID` and `CDSE_OAUTH_CLIENT_SECRET` in `HighTowers-Web/.env`. Create an OAuth client under [Dashboard → User Settings → OAuth clients](https://shapps.dataspace.copernicus.eu/dashboard/#/account/settings).
- **Route:** `GET /api/recent-imagery?lat=&lon=&halfMiles=0.5` → `image/png` (last ~150 days, `leastCC` mosaicking, max cloud metadata ~85%).

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ SurveyMapModal  │────▶│ recentImageryOverlay │────▶│ Backend (opt.)  │
│ + Map image src │     │ service              │     │ Copernicus / etc.│
└─────────────────┘     └──────────────────────┘     └─────────────────┘
        │                         │
        │                         ▼
        │               ┌─────────────────────┐
        └──────────────▶│ mapOverlayGeometry  │
                        │ (bbox, 4 corners)   │
                        └─────────────────────┘
```

1. **`mapOverlayGeometry.ts`** — Pure math: given center `(lat, lon)` and half-width in miles/meters, compute **west, south, east, north** and the **four `[lng, lat]` corners** in Mapbox **image source** order (clockwise from top-left).
2. **`recentImageryOverlay.ts`** — Calls your chosen provider (or a **backend proxy**) and returns `{ url, coordinates }` for `map.addSource({ type: 'image', ... })`.
3. **`SurveyMapModal.tsx`** — Button triggers fetch; on success, adds a Mapbox **`image` source** + **`raster` layer** with partial opacity; **Remove overlay** clears the layer.

## Mapbox wiring (client)

- Use [`image` source](https://docs.mapbox.com/mapbox-gl-js/style-spec/sources/#image): `url` + `coordinates` (four corners, clockwise from top-left).
- Layer `type: 'raster'`, `paint: { 'raster-opacity': 0.75–0.9 }` so users still see the basemap for context.
- **CORS**: The image URL must allow your web origin, **or** you proxy the image through your own server (`/api/recent-imagery` returns PNG bytes with `Access-Control-Allow-Origin`).

## Provider options (pick one for production)

| Approach | Pros | Cons |
|----------|------|------|
| **Backend fetches Copernicus/Sentinel Hub** | Hides API keys; can pick least-cloudy scene; resize to PNG | Server work; rate limits |
| **Sentinel Hub OGC / Process API from browser** | No backend if public token + CORS OK | Key exposure unless restricted; CORS often blocks |
| **USGS / NAIP WMS** (where available) | High res in US | Not “&lt; 1 year” everywhere; GetMap URL varies |
| **Commercial** | Best recency/resolution | Cost + licensing |

**Realistic free default:** **Sentinel‑2** via **Copernicus Data Space** or **Sentinel Hub** — request a **bounding box**, **recent** acquisition, **least cloudy** in a date window; resample to a **single georeferenced PNG** (or GeoTIFF → PNG server-side). Expect **~10 m** resolution — label UI: *“May not show thin towers clearly.”*

## Backend sketch (Node, optional)

1. `GET /api/recent-imagery?lat=&lon=&halfMiles=0.5`  
   - Validates params; computes bbox (reuse `mapOverlayGeometry` or duplicate server-side).
2. Server calls provider (e.g. Sentinel Hub process API) with **bbox**, **date range** (last 90–180 days), **max cloud %**.
3. Returns **PNG** (or JPEG) bytes + **Content-Type**; client already knows `coordinates` from the same bbox math.

**Secrets:** use **`CDSE_OAUTH_CLIENT_ID` / `CDSE_OAUTH_CLIENT_SECRET`** — **never** embed in Vite; server + `.env` only.

## Client

- `fetchRecentImageryOverlay()` in `src/services/recentImageryOverlay.ts` calls `/api/recent-imagery` and builds a blob URL for the Mapbox `image` source.

## Testing checklist

- [ ] Overlay corners align with roads at bbox edges (sanity check).
- [ ] Pan/zoom: overlay stays **anchored** (image source moves with map).
- [ ] **Record Location** unchanged vs without overlay.
- [ ] Remove overlay restores default view.
- [ ] Modal close clears overlay state (no leak on reopen).

## Files

| File | Role |
|------|------|
| `src/utils/mapOverlayGeometry.ts` | Bbox + Mapbox `coordinates` array |
| `src/services/recentImageryOverlay.ts` | Fetch `{ url, coordinates }` from `/api/recent-imagery` |
| `src/components/SurveyMapModal.tsx` | Button + `Source`/`Layer` |
| `server/sentinelHubImagery.js` | CDSE OAuth + Process API |
| `server/index.js` | `GET /api/recent-imagery` |
