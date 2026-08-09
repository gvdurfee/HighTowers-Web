# Gemini tower-locate experiment (Phase A)

**Branch:** `cursor/gemini-tower-locate`  
**Goal:** Test whether Gemini Vision can propose a tower-base location near a GPS prior (photo / G1000 flyover), and measure error against human map picks when the pad is visible.

This is an **experiment**, not a production authority. Humans still confirm or reject every suggestion before **Record Location**.

---

## Setup

1. Create an API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Add to local `.env` (never commit; never use a `VITE_` prefix):

```bash
GEMINI_API_KEY=your_key_here
# optional:
# GEMINI_MODEL=gemini-2.0-flash
```

3. Ensure Mapbox is configured (`VITE_MAPBOX_ACCESS_TOKEN`) — the server fetches a satellite tile for Gemini.
4. Restart `npm run dev:all`.

Check: `GET /api/tower-locate/status` → `{ "geminiConfigured": true, ... }`.

---

## How to run one comparison

1. **Tower Data Analysis** — select a tower photo that has GPS (or set coordinates from G1000).
2. **Look for Tower on Map** — pan the crosshair onto the true pad (human reference).
3. In the experiment panel:
   - Leave **Log comparison row** checked.
   - Click **Suggest with Gemini**.
4. The map flies to Gemini’s suggestion. The UI shows **error vs crosshair** (meters / NM).
5. Rows append under `data/tower-locate-eval/comparisons.csv` and `comparisons.jsonl` (gitignored).

**Important:** Gemini receives the tower photo + satellite tile around the **prior** (photo/G1000 seed). It does **not** receive the human crosshair coordinates. Those are used only server-side for the eval table.

---

## Comparison table columns

| Column | Meaning |
|--------|---------|
| priorLat/Lon | Search center (photo GPS / G1000 seed) |
| humanLat/Lon | Map crosshair at suggest time |
| geminiLat/Lon | Model estimate |
| errorMeters / errorNm | Haversine human → Gemini |
| confidence | Model 0–100 |
| model | e.g. `gemini-2.0-flash` |
| imagerySource | Mapbox satellite tile |

API list: `GET /api/tower-locate/eval?limit=100`

---

## Success criteria (suggested)

Before any crew-facing default:

- ≥20 easy cases where the pad is clearly on Mapbox/NAIP
- Median error **&lt; 50 m**
- Document failure modes (canopy, new pads, bad priors)

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/tower-locate/status` | Key configured? |
| POST | `/api/tower-locate/suggest` | Suggest (+ optional eval log) |
| GET | `/api/tower-locate/eval` | Recent comparison rows |

---

## Security

- `GEMINI_API_KEY` stays on the Node server only.
- Do not put ChatGPT/Google account passwords in the app or repo.
- Eval logs may contain mission coordinates — keep `data/` local / wing-controlled.
