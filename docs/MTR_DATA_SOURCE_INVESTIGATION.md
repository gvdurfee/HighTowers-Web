# MTR Data Source Investigation

## Executive Summary

The current ArcGIS MTR data (services3.arcgis.com) is **incomplete** compared to FAA/AP-1B. SR213 has waypoints A–G but **SR213H is missing**. ForeFlight and the FAA use the **28-Day NASR Subscription** as the authoritative source. Migrating to FAA NASR MTR data would require a **backend service** to download, parse, and serve the data.

---

## 1. ForeFlight’s Data Source

ForeFlight relies on **official FAA Aeronautical Information Services (AIS)** data, which includes:

- FAA Form 7110-4 (Military Training Route Data)
- **28-Day NASR (National Airspace System Resource) Subscription**
- Updated every 8 weeks for MTR (56-day cycle)

Same source as AP/1B and the FAA Enroute charts.

---

## 2. Current HighTowers Data Source

| Property        | Value |
|-----------------|-------|
| **Service**     | `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Military_Training_Routes/` |
| **Provider**    | Esri / NIFC (National Interagency Fire Center) Hub |
| **Format**      | ArcGIS FeatureServer, point-based (PT_IDENT, WGS_DLAT, WGS_DLONG) |
| **Layers**      | IR=3, SR=4, VR=5 |
| **Limitation**  | SR213 has A–G only; SR213H not present. Likely older or derived from a different source than NASR. |

---

## 3. FAA Official MTR Data

### 3.1 NASR 28-Day Subscription

**MTR download (CSV):**
```
https://nfdc.faa.gov/webContent/28DaySub/extra/19_Mar_2026_MTR_CSV.zip
```

**MTR download (Legacy TXT):**
```
https://nfdc.faa.gov/webContent/28DaySub/2026-03-19/MTR.zip
```

- Updated every 56 days (aligned with MTR cycle)
- Includes all MTR waypoints with coordinates
- MTR5 record: Route Type, Route ID, Point ID (A,B,C…H), Latitude, Longitude
- Layout: `https://nfdc.faa.gov/webContent/28DaySub/2026-03-19/Layout_Data/mtr_rf.txt`

### 3.2 FAA MTRSegment ArcGIS Service

| Property   | Value |
|-----------|--------|
| **Service** | `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/MTRSegment/FeatureServer` |
| **Provider** | FAA (Federal Aviation Administration) |
| **Format**   | Polyline segments (esriGeometryPolyline), not individual waypoints |
| **Fields**   | IDENT, NAME, ROUTETYPE, altitude, width, etc. |
| **Use case** | Route segments/corridors, not point lookup for SR213A, SR213H, etc. |

The MTRSegment service is segment-based and not suitable for direct waypoint coordinate lookup.

---

## 4. Implementation Options

### Option A: FAA NASR MTR CSV (Recommended for completeness)

**Flow:**
1. Backend (Node.js, Python, etc.) downloads the MTR CSV ZIP from nfdc.faa.gov.
2. Parse CSV into route + waypoint records.
3. Store in DB or cache (e.g., SQLite, PostgreSQL, or JSON).
4. Expose a REST API: `/api/mtr/:routeType/:routeNumber` returning waypoints.
5. Web app calls this API instead of the Esri service.

**Pros:**
- Same source as ForeFlight and AP/1B  
- Complete (includes SR213H and similar waypoints)  
- Free, public data  
- Updated every 56 days  

**Cons:**
- Needs a backend
- Initial setup for download/parse scripts
- Must re-download on each NASR cycle

### Option B: Hybrid – ArcGIS primary, NASR fallback

- Use current ArcGIS service first (no backend, quick).
- If a waypoint is missing (e.g. SR213H), fall back to NASR-based backend API when available.

### Option C: Proxy to NASR ZIP

- Backend fetches the MTR ZIP and parses it on demand or on a schedule.
- No public FAA REST API exists for per-waypoint lookup; NASR is file-based.

---

## 5. FAA NASR MTR File Structure (Reference)

From `mtr_rf.txt`:

**MTR5 (Route Point Data):**
- Record Type: MTR5
- Route Type: IR, VR, SR
- Route Identifier: e.g. 213
- **Route Point ID**: A, B, C, … H (5 chars)
- **MTT4**: Latitude (14 chars)
- **MTT5**: Longitude (14 chars)
- NAVAID ident, bearing, distance, segment text, etc.

CSV layout can be derived from the TXT-to-CSV mapping document:
`https://nfdc.faa.gov/webContent/28DaySub/TXT_to_CSV_Mapping.pdf`

---

## 6. Other Sources Considered

| Source                      | Notes |
|-----------------------------|-------|
| FAA api.faa.gov             | No documented MTR waypoint API |
| FAA Data Portal (data.faa.gov) | Catalog in development; no MTR endpoint found |
| SUA Data Gateway (sua.faa.gov) | MTR schedules (times, entry/exit), not coordinates |
| California MTR MapServer   | State-only, not national |
| DAFIF/NGA                  | Legacy; FAA NASR is the current replacement |

---

## 7. Recommendation

1. Add a small backend service to pull and parse FAA NASR MTR CSV.
2. Build an internal cache/API for waypoint lookup by route and point ID.
3. Update the HighTowers API layer to use this backend for waypoint coordinates.
4. Keep the ArcGIS service as an optional fallback if preferred, but treat NASR as the source of truth for completeness.

---

## 8. Implementation (Completed)

FAA NASR MTR backend added per recommendation:

| Component | Location |
|-----------|----------|
| Backend | `server/index.js` |
| Frontend API | `src/services/api.ts` (FAA first for IR/VR, ArcGIS fallback for SR) |
| Proxy | Vite `/api` → `localhost:3001` |

**Behavior:**
- On each flight plan creation (waypoint sequence or full route), the backend downloads the MTR CSV ZIP for the current 28-day cycle (or uses cached copy).
- Date check: Resolves cycle from FAA index or `MTR_CYCLE_DATE` env override.
- Uses `MTR_PT.csv` (ROUTE_TYPE_CODE, ROUTE_ID, ROUTE_PT_ID, LAT_DECIMAL, LONG_DECIMAL).
- IR and VR routes from FAA; SR routes continue to use ArcGIS (FAA MTR CSV has no SR).

**Run:** `npm run dev:all` (backend + Vite), or `npm run server` and `npm run dev` separately.

---

## 9. References

- [FAA NASR 28-Day Subscription (Mar 2026)](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/2026-03-19/)
- [MTR Layout Data (mtr_rf.txt)](https://nfdc.faa.gov/webContent/28DaySub/2026-03-19/Layout_Data/mtr_rf.txt)
- [FAA Form 7110-4 (MTR Data)](https://www.faa.gov/forms/index.cfm/go/document.information/documentID/181590)
- [FAA MTRSegment ArcGIS](https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/MTRSegment/FeatureServer)
- [ForeFlight Military Flight Bag](https://www.foreflight.com/products/military-flight-bag/)
