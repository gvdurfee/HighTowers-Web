# Smoke test — training readiness

Run checks **in order**: **GitHub Pages first** (what trainees use), then **local production preview** if you want parity before pushing or to debug without waiting on deploy.

**Live site (project Pages):**  
https://gvdurfee.github.io/HighTowers-Web/

---

## A. GitHub Pages (~5 minutes)

Use a **normal browser window** (not private) unless you intentionally want a cold IndexedDB — private windows start with empty local data.

| Step | Action | Pass if |
|------|--------|--------|
| A1 | Open the **live URL** above. | Page loads; title/branding visible; no blank screen. |
| A2 | **DevTools → Network:** hard refresh (⌘⇧R). | **200** on `index.html`; main JS/CSS under `/HighTowers-Web/assets/` load (no red failed requests for core bundles). |
| A3 | **Flight Plans** (`/flight-plans`) | Route works from nav; list or empty state renders. |
| A4 | **New Flight Plan** (`/flight-plans/new`) | Form loads; optional: type **`ir111`** in Name — see **IR** prefix behavior if that build includes it. |
| A5 | **Air Force Report Form** (`/report-form`) | Form loads; mission picker works if missions exist. |
| A6 | **Tower Analysis** (`/tower-analysis`) | Page loads; **Fly-Over Location** / image picker do **not** hard-crash. Map: needs **`VITE_MAPBOX_ACCESS_TOKEN`** in the Pages build (repo **secret**); if missing, you may see the Mapbox placeholder message — record that for training setup. |
| A7 | **Export Reported Data** (`/export`) | Page loads; PDF generation **may require** hosted API (**`vars.VITE_API_BASE_URL`**) + CORS for static Mapbox proxy — note failures for `docs/API_HOSTING.md`. |
| A7b | **ForeFlight Content Pack Update** (`/foreflight-content-pack`) | Page loads; mission picker; ZIP upload/preview (Chrome/Edge optional folder overwrite). |
| A8 | **Deep link refresh** — open `/HighTowers-Web/report-form` (or another child route) and refresh. | **404.html** SPA fallback: app still loads (not GitHub 404 page). |
| A9 | **Workflow guide** (`/workflow`) | Opens and reads correctly. |

**Optional training-critical path:** create a small mission, add tower data if API works, export PDF and open it (Notes + photo label match expectations).

---

## B. Local production preview (after A, or before push)

Mirrors **base path** and static build; closer to Pages than `npm run dev`.

```bash
cd HighTowers-Web
nvm use 20   # or your Node 20+
VITE_BASE_PATH=/HighTowers-Web/ npm run build
VITE_BASE_PATH=/HighTowers-Web/ npm run preview
```

Open **http://localhost:4173/HighTowers-Web/** (trailing path per Vite preview + your base).

Repeat **A3–A8** against localhost. To hit **local** `/api`, run **`npm run server`** in another terminal (preview proxies `/api` to port 3001 per `vite.config.ts`).

---

## When something fails

| Symptom | Likely cause |
|--------|----------------|
| Blank app, 404 on JS | Wrong **`VITE_BASE_PATH`** in CI; check `.github/workflows/pages.yml`. |
| Mapbox error on Tower Analysis / map pages | Missing or invalid **`VITE_MAPBOX_ACCESS_TOKEN`** secret on the repo. |
| Flight plans / NASR / PDF map errors on Pages | **`VITE_API_BASE_URL`** not set or API **CORS** / downtime — see **`docs/API_HOSTING.md`**. |
| Only fails on Pages, OK on dev | Compare **`import.meta.env.BASE_URL`** and use **Section B** preview. |

---

## Cadence

- **Before training:** run **Section A** on the live URL after the last deploy you care about.
- **After risky changes (routing, PDF, env):** **A** then **B** before merging if you want fast feedback.
