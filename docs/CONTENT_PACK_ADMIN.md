# Wing Administrator — Content Pack Operations

This guide is for the **Wing Administrator**: the aviator who owns the ForeFlight content-pack **lifecycle** for the Wing’s tower data on HighTowers (creating a pack when a new MTR appears, publishing revisions, future rename/delete, and similar housekeeping). It is not a programming manual.

**What stays with the crew:** per-mission tower updates (apply / refine flows in the app) stay in crew control. The Wing Administrator does not need to intervene for day-to-day mission edits.

---

## 1. Role and scope

The Wing Administrator ensures the server has the right **baseline packs** and **revisions** so crews can load and apply tower waypoints for their routes.

Typical responsibilities:

- Publish or bulk-import packs when the Wing receives new surveyed tower data.
- Register a **brand-new MTR** that has never had a pack (empty baseline until the first crew applies towers).
- Retire or replace a pack when you uploaded the wrong ZIP, duplicated a route, or need to remove an obsolete baseline (use **Delete** in the admin console Inventory, or the maintenance script in §9).

---

## 2. Why there is a PIN (and how it differs from the API key)

Two separate secrets protect different trust boundaries:

| Secret | Who uses it | Purpose |
|--------|-------------|---------|
| **Wing Administrator PIN** | Humans signing into the admin console (or CLI) | Short-lived **session** after `POST /api/admin/login`. Re-enter the PIN when you start a new session; it is not stored in the browser as a long-term password substitute. |
| **Content Pack API key** | The SPA, scripts, and integrations calling `/api/content-packs/*` | Proves the caller is authorized to use the Content Pack API at all (shared per Wing when configured). |

Publishing uploads and “create empty pack” require **both** the API key and a valid **admin bearer token** obtained with a PIN. Read-only pack operations (list, get, export, preview/apply) still follow the API-key rules you already use in the field app.

---

## 3. Scope-of-content policy (read this)

> Our content packs carry exactly what ForeFlight has no other source for: **surveyed tower waypoints**. Charts, instrument approach plates, MOAs, MBTiles overlays, and other ForeFlight-managed content go stale on the 28-day AIRAC cycle — embedding them creates a divergent second source of truth. **We do not add a way to bundle them in this app.**

If a ZIP you upload contains extra ForeFlight artifacts (KML layers, PDFs, etc.), the server will accept the upload but report a **non-essential file count** so you can decide whether to strip and re-publish a leaner ZIP.

---

## 4. Initial setup checklist (server operator)

Work on the machine that runs the HighTowers API (or your deployment pipeline), in the server environment (e.g. `server/.env`):

1. **Set `CONTENT_PACK_API_KEY`** — one shared value per Wing. Every Content Pack API call must send this key (`Authorization: Bearer …` or `X-API-Key`).
2. **Set `CONTENT_PACK_ADMIN_PIN`** — a single Wing admin PIN **or** `CONTENT_PACK_ADMIN_PINS` (JSON array) for multiple named admins (see §10).
3. **Optionally set `CONTENT_PACK_ADMIN_SECRET`** — at least 16 characters. If unset, the server uses an ephemeral signing key: admin sessions **invalidate on restart**. Set a stable secret if operators should keep working across deploys without signing in again.
4. **Restart the server** so the new variables load.

Until a PIN is configured, admin-only routes respond with **503** `admin_not_configured` so misconfiguration cannot leave publishing wide open behind only an API key.

---

## 5. Day-to-day operations

### Delete a mistaken or duplicate pack (admin console)

Open **`/admin/content-packs`**, sign in with the Wing PIN, and use **Inventory → Delete** on the row you want removed. The table shows the first eight characters of each pack’s **id** so two packs with the same display name (e.g. two `SR213_content_pack` uploads) are easy to tell apart. Confirm the dialog; the server deletes that pack’s database row and its baseline ZIP folder. Crews should refresh the pack list afterward.

### Bulk-import existing packs (CLI)

From a machine with Node.js 18+ and network access to the API, upload every `.zip` in a folder (top-level only; no subfolders):

```bash
export CONTENT_PACK_API_KEY='your-wing-api-key'
export CONTENT_PACK_ADMIN_PIN='your-pin'

node scripts/bulk-import-content-packs.mjs \
  --dir /path/to/zips \
  --api https://your-host.example \
  --yes
```

Omit `--yes` to get an interactive confirmation prompt. Add `--dry-run` to list which files would upload without logging in or calling the upload endpoint (the directory must exist; API key and PIN must still be provided via env or flags, same as a real run).

Flags may replace env vars: `--api-key …`, `--pin …`. Default API base is `http://localhost:3001` if `--api` is omitted.

### Author a new pack from scratch (new MTR, no tower history)

When a route has **no** prior tower CSV to import, use the admin console **“Create empty pack”** form (see §6). That registers `manifest.json` plus a header-only `user_waypoints.csv` for the route number you enter. The first crew mission that applies towers grows the CSV.

### Publish a one-off pack (ZIP on disk)

Use the same admin page: **“Publish from existing ZIP”** (or equivalent upload panel). You will be prompted for the Wing PIN; the browser already holds the Content Pack API key the same way the main app does.

**Naming before upload:** ForeFlight packs are folders inside the ZIP. The server stores the path to `user_waypoints.csv` (for example `SR213_content_pack/navdata/user_waypoints.csv`). If you re-export from the app with a long folder name like `SR213_content_pack_UPDATED_2026-05-05 3`, that full path is what appears in the admin **Inventory** and under crew **Settings → CSV member** — so duplicates with the same *display name* are easiest to tell apart by that path. Prefer renaming the outer folder inside the ZIP to a short, route-stable name (e.g. `SR213_content_pack`) before publishing when you can.

---

## 6. Authoring a new pack from scratch (what the server builds)

For a new numeric MTR (e.g. `112`, `355`), **POST `/api/content-packs/new`** (or the admin form) creates a minimal ForeFlight-shaped ZIP in storage:

| Member | Contents |
|--------|----------|
| `IR{route}_content_pack/manifest.json` | JSON metadata ForeFlight expects. |
| `IR{route}_content_pack/navdata/user_waypoints.csv` | **Header only** — no data rows yet. |

**Manifest fields** (defaults shown where optional):

- **`name`** — Display name; default `IR{route} Reported Towers` (or the display name you type in the form).
- **`abbreviation`** — Short pack label; default `IR{route}.V1` (max 32 characters on the server).
- **`version`** — Numeric manifest version; default `1.0`.
- **`organizationName`** — Default `ForeFlight` unless you override (e.g. Wing legal name).

**Why the route number is explicit:** with an empty CSV there are no waypoint rows from which the server can infer the MTR prefix. The route number you enter becomes `primary_route_number` in the database so the first **apply** can name towers `{route}A`, `{route}B`, … correctly.

---

## 7. Admin URL (bookmark this)

Open:

`https://<your-host>/admin/content-packs`

(Use `http://localhost:5173` or your deployed host as appropriate.)

This page is **not linked from the main navigation** on purpose: only Wing staff who know the URL should manage packs.

---

## 8. PIN management and lockouts

**Rotation:** generate a new PIN, update `CONTENT_PACK_ADMIN_PIN` or the `pin` fields inside `CONTENT_PACK_ADMIN_PINS`, remove the old value, restart the server. Distribute the new PIN out-of-band (same as any shared operational secret).

**Suspected compromise:** rotate immediately, audit recent revisions in the database if you have DBA access, and consider rotating `CONTENT_PACK_API_KEY` as well so old browser sessions cannot call the API.

**Lockout behavior:** after **three failed PIN attempts from the same client IP** within a rolling window, the server returns **429** `too_many_attempts` and a **`Retry-After`** header (one minute). Successful login clears the failure streak for that IP.

---

## 9. Backup recipe

Treat the SQLite database and on-disk baseline ZIPs as **one unit**:

- **Database:** `data/content-packs/content-packs.sqlite` (and `-wal` / `-shm` if present — copy or checkpoint consistently).
- **Blob store:** under each pack UUID folder, e.g. `data/content-packs/<uuid>/baseline.zip`.

**Suggested approaches:**

- **Simple:** nightly `cp -R` (or `rsync`) of the whole `data/content-packs` tree while traffic is low, after confirming SQLite is copied safely (stop server or use SQLite backup if you need crash consistency).
- **Continuous:** [Litestream](https://litestream.io/) (or your platform’s volume snapshots) on the same directory.

Restoring only the DB without the ZIP files (or the reverse) will break exports and applies — keep them together.

---

## 10. Multi-Wing future (`CONTENT_PACK_ADMIN_PINS`)

`CONTENT_PACK_ADMIN_PINS` is a JSON **array** of objects:

```json
[
  { "pin": "111111", "name": "Jane A.", "wing": "NM" },
  { "pin": "222222", "name": "John B.", "wing": "TX" }
]
```

Each successful login returns `name` and `wing` in the JSON alongside the token. That metadata prepares for **other states’ Wings** sharing a platform later; today it does **not** enforce row-level isolation — it is carried on the token for clarity and logging.

If `CONTENT_PACK_ADMIN_PINS` is unset, a single `CONTENT_PACK_ADMIN_PIN` behaves like one admin with `name` and `wing` null.

---

## 11. Audit trail (current state)

The database columns `created_by` on `content_pack` and `content_pack_revision` are populated from the **`name`** claim on the admin token (the signed payload from login). Today this is for **human inspection** of the database and support forensics — **not** for authorization or row-level security. Crew actions and non-admin API calls do not use this field the same way.

---

## Further reading

- API details (endpoints, auth headers, error codes): [`docs/CONTENT_PACK_API.md`](./CONTENT_PACK_API.md)
- Script that deletes packs by route (local DB, not HTTP): `scripts/delete-content-packs-by-route.mjs`
