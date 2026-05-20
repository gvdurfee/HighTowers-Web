# Recent imagery overlay — implementation path

This document describes the **optional, georeferenced imagery patch** on top of the Survey Location map so users can **visually** spot structures when the default basemap is stale. **Recorded coordinates** remain the map center / crosshair (unchanged).

## Goals

- User clicks **“Overlay NAIP map patch”** when the default satellite layer is outdated or the tower is hard to see.
- A **~1 mile square** (configurable) patch centered on the current map center is **aligned in WGS‑84 / Web Mercator** with the Mapbox map.
- Overlay is **visual only**; **Record Location** still uses `viewState` center (same as today).
- **Attribution** for USDA NAIP is shown in the modal when the patch is active.

## Current implementation (USDA NAIP)

- **Source:** Public [NAIP](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-aerial-photography-national-agriculture-imagery-program-naip) orthoimagery via ArcGIS **ImageServer** `exportImage` (Esri-hosted and USDA APFO fallback).
- **Resolution:** ~**0.6 m** (60 cm) standard since 2018 in CONUS; refresh is roughly **every 3 years** per area (not annual everywhere).
- **Server code:** `server/naipImagery.js` (bbox → Web Mercator → PNG/JPEG patch); `server/imageryBbox.js` (shared bbox math).
- **No API keys** required for the overlay endpoint.
- **Route:** `GET /api/recent-imagery?lat=&lon=&halfMiles=0.5` → image bytes; response headers:
  - `X-Imagery-Source: NAIP`
  - `X-Imagery-Attribution` — USDA/USGS credit line
  - `X-Imagery-Vintage` — acquisition year when `identify` returns metadata (optional)

Legacy Sentinel-2 / Copernicus code remains in `server/sentinelHubImagery.js` but is **not** used by the app.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ SurveyMapModal  │────▶│ recentImageryOverlay │────▶│ Node proxy      │
│ + Map image src │     │ service              │     │ NAIP ImageServer│
└─────────────────┘     └──────────────────────┘     └─────────────────┘
        │                         │
        │                         ▼
        │               ┌─────────────────────┐
        └──────────────▶│ mapOverlayGeometry  │
                        │ (bbox, 4 corners)   │
                        └─────────────────────┘
```

1. **`mapOverlayGeometry.ts`** — Client bbox corners for Mapbox `image` source.
2. **`recentImageryOverlay.ts`** — Calls `/api/recent-imagery`; returns `{ url, coordinates, attribution, vintage? }`.
3. **`SurveyMapModal.tsx`** — Button, attribution line, Mapbox **`image` source** + **`raster` layer**.

## Mapbox wiring (client)

- Use [`image` source](https://docs.mapbox.com/mapbox-gl-js/style-spec/sources/#image): `url` + `coordinates` (four corners, clockwise from top-left).
- Layer `type: 'raster'`, `paint: { 'raster-opacity': 0.75–0.9 }` so users still see the basemap for context.
- **CORS:** NAIP services block browser direct access; the **Node server proxies** the patch.

## Testing checklist

- [ ] Overlay corners align with roads at bbox edges (sanity check).
- [ ] Pan/zoom: overlay stays **anchored** (image source moves with map).
- [ ] **Record Location** unchanged vs without overlay.
- [ ] Remove overlay restores default view.
- [ ] Modal close clears overlay state (no leak on reopen).
- [ ] Attribution line visible when patch is loaded.

## Files

| File | Role |
|------|------|
| `src/utils/mapOverlayGeometry.ts` | Bbox + Mapbox `coordinates` array |
| `src/services/recentImageryOverlay.ts` | Fetch overlay + attribution from `/api/recent-imagery` |
| `src/components/SurveyMapModal.tsx` | Button + `Source`/`Layer` + attribution |
| `server/imageryBbox.js` | WGS-84 square bbox |
| `server/naipImagery.js` | NAIP exportImage + optional vintage |
| `server/index.js` | `GET /api/recent-imagery` |
