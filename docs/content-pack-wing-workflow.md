# Wing content pack workflow (crew & coordinator)

This document captures **product and operations decisions** for how ForeFlight content packs are handled in HighTowers-Web. It complements the technical API/admin guides:

- [CONTENT_PACK_ADMIN.md](./CONTENT_PACK_ADMIN.md) — Wing Administrator console
- [CONTENT_PACK_API.md](./CONTENT_PACK_API.md) — API contract
- [API_HOSTING.md](./API_HOSTING.md) — deploying the optional Node API

**Audience:** seasonal Wing coordinators, aircrew doing Low Level Route Surveys, and developers maintaining the app.

---

## 1. Core idea: packs are “next-year prep,” not live mission data

ForeFlight content packs bridge **last season’s surveyed towers** to **next season’s flight prep**. During a mission, crews work towers in the browser (IndexedDB). The pack itself does not need to stay “online” in the app until the following year—often with a **different** pilot or aircrew.

**Decision:** Treat the **updated content pack ZIP** (plus the Air Force customer PDF) as artifacts stored on **Wing shared storage**, not as something every crew member must fetch from an in-app database on Pages.

The optional **content-pack server** (SQLite + ZIP files under `data/content-packs/`) remains in the codebase for Wings that want centralized publish/apply; it is **not required** for day-to-day close-out when using the local-ZIP workflow.

---

## 2. What lives where

| Data | Location | Notes |
|------|----------|--------|
| Missions, flight plans, towers, report notes | **This browser** — IndexedDB (`HighTowersDB`) | Per device/browser; not synced by GitHub Pages deploy |
| Content pack files on a **Wing server** | Folders the **coordinator** assigns each season | UNC/SharePoint/etc.; paths change year to year |
| Content packs on optional **HighTowers API** | Deployed `server/` + env | Only when `VITE_API_BASE_URL` points at a live API |
| Local ZIP during close-out | **In-memory** in the ForeFlight page tab | Lost on refresh until the user picks the file again; see §6 |

GitHub Pages hosts **only** the static SPA. Without a deployed API, the app will correctly show that **no server pack** exists for a route; crews use **local ZIP** + Wing folders.

---

## 3. Wing folders (coordinator-driven)

Each survey season, the Wing **coordinator** tells assigned aircrew (distributed statewide) where to find and store packs on the Wing server. Folder **paths are not baked into the app**—the coordinator communicates current locations in assignment messages each year.

Use **stable folder names** in training and UI copy so they match the coordinator’s email:

| Folder role | Typical label | Purpose |
|-------------|---------------|---------|
| **Baseline** | *Content Packs for Flight Planning* | Prior-season (or trimmed canonical) `.zip` files used when prepping the route in ForeFlight |
| **Output** | *Updated Content Packs* | Save the **updated** `.zip` after mission close-out, alongside the customer PDF |

**Why hints omit paths:** Aircrew already know where to navigate on the Wing server from assignment comms. In-app hints explain **which kind of folder** and **why**, not UNC paths that may move.

---

## 4. Recommended crew workflow

### A. Flight planning (baseline)

1. Open the pack from **Content Packs for Flight Planning** on the Wing server (per coordinator directions).
2. Import into ForeFlight as usual.
3. In the app, create/load the flight plan and mission for the route.

**Why:** The baseline pack is the reference for tower names and coordinates during this season’s survey.

### B. Tower survey (mission work)

1. Complete **Tower Data Analysis** and the **Air Force Report Form** in the app.
2. Tower coordinates live in IndexedDB; no content pack must stay loaded in the browser for every step.

### C. Mission close-out (PDF + optional pack)

1. Open **Export Reported Data** (sidebar).
2. **Generate & Download PDF** for the Air Force customer.
3. If this mission did **not** add towers or change coordinates versus the pack you flew with, check **No content pack update for this mission** and stop.
4. Otherwise, uncheck that box, upload the **same baseline** pack ZIP you used in ForeFlight (from *Content Packs for Flight Planning*).
5. **Preview** — refinements (≤30 m) vs new appends vs unchanged after four-decimal rounding (towers with saved survey photos only).
6. **Download updated Content Pack (.zip)** when there are changes to apply.
7. **Manually copy** that file from the browser’s download location into **Updated Content Packs** on the Wing server and email it to your Wing content-pack maintainer when directed.

**Why:** Next year’s crew (and the coordinator) need one obvious place for “latest pack for route X” plus the signed report.

### D. Next season

1. Coordinator points crews to the current **Content Packs for Flight Planning** location (may include last year’s *Updated* pack after Wing review/trim).
2. Repeat the cycle.

---

## 5. Coordinator checklist (assignment email template)

Suggested bullets for seasonal aircrew assignments:

- Where to download **baseline** packs (*Content Packs for Flight Planning*).
- Where to upload **updated** packs after close-out (*Updated Content Packs*).
- Store **updated ZIP + Air Force PDF** together for the same mission.
- Remind crews: browser **Download** goes to the local Downloads folder first; **copy to Wing storage** is a deliberate step.

---

## 6. App behavior crews should know

### Content pack on Export Reported Data

- Picking a ZIP runs **preview in the browser**; nothing is uploaded to a server.
- Mission **Additional Notes** may gain auto-generated ForeFlight paragraphs after preview (regenerate the PDF if you already downloaded it).
- The ZIP file is **not** saved in IndexedDB. After refresh, **pick the ZIP again** on Export.

### Preview shows 0 refinements / 0 appends

Often means tower coordinates **already match** the pack after four-decimal rounding—not a broken preview. **Download** stays disabled when there is nothing to change.

### Wing Administrator API (optional)

The admin console at `/admin/content-packs` remains for Wings that host the optional Node API. **Crew close-out** does not require it; use Export + local ZIP download instead.

---

## 7. Testing and QA (Wing developer / trainer)

For regression testing without relying on the server:

1. Place baseline packs in **Content Packs for Flight Planning** (older survey years).
2. Run tower analysis and produce an **Updated** ZIP via **Export Reported Data**.
3. Compare baseline vs updated (ZIP or `user_waypoints.csv`).
4. **Selectively trim** the CSV after an update cycle, copy a trimmed pack back into **Content Packs for Flight Planning**, and re-run preview.
5. Confirm expected towers fall into **≤30 m refinement** or **unchanged after rounding** in preview and mission notes.

---

## 8. Hosting and National vs Wing scope

- **Static app** (e.g. GitHub Pages or future National hosting) can serve all states; **Low Level Survey work stays Wing/state-operated**.
- **Wing shared storage + coordinator comms** remain the system of record for pack files even if the SPA URL is national.
- Optional **API hosting** ([API_HOSTING.md](./API_HOSTING.md)) is for Wings that want a single server-side inventory; it does not replace Wing folder discipline.

**Current decision:** Keep server/database implementation in the repo; **simplify crew UX** toward download + Wing storage, with hints that explain *why*, not server paths.

---

## 9. UI copy principles (for future changes)

When updating ForeFlight / Flight Plan / Export screens:

1. Use the **same folder role names** the coordinator uses (*Content Packs for Flight Planning*, *Updated Content Packs*).
2. State **why** each step matters (continuity across years, different aircrew, audit trail).
3. Remind users that **Download ≠ saved on Wing server**—copy/move after download.
4. Do **not** embed season-specific UNC paths in the app.
5. Point server/admin concerns to [CONTENT_PACK_ADMIN.md](./CONTENT_PACK_ADMIN.md), not the crew close-out path.

---

## 10. Related app surfaces

| Surface | Role |
|---------|------|
| **Flight Plan** detail — content pack card | Reminder: baseline pack from Wing *Content Packs for Flight Planning* |
| **Export Reported Data** | Air Force PDF + optional local ZIP preview/download for close-out |
| **Administrator → Content packs** | Wing Administrator publish/delete (optional API) |
| **`/foreflight-content-pack`** | Legacy URL; redirects to Export |

---

*Document derived from product discussion (May 2026). Update this file when Wing policy or app behavior changes.*
