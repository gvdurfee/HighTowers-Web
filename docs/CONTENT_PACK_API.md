# ForeFlight Content Pack API (hybrid backend)

The Express server exposes JSON and multipart endpoints under `/api/content-packs` for uploading ForeFlight content-pack ZIPs, storing normalized user waypoint rows in SQLite, and applying tower refinements with the same rules as the browser (`shared/content-pack-core`).

Operator-facing notes (PIN, backups, Wing role): see **[`docs/CONTENT_PACK_ADMIN.md`](./CONTENT_PACK_ADMIN.md)**.

## Environment

| Variable | Description |
|----------|-------------|
| `CONTENT_PACK_API_KEY` | Optional in local dev. When set, every `/api/content-packs/*` request must send this key via `Authorization: Bearer <key>` or `X-API-Key: <key>`. |
| `CONTENT_PACK_ADMIN_PIN` | Single Wing Administrator PIN, **or** use `CONTENT_PACK_ADMIN_PINS` instead. Required for admin-only routes once you configure publishing (503 if neither yields at least one PIN). |
| `CONTENT_PACK_ADMIN_PINS` | Optional JSON array of `{ "pin", "name?", "wing?" }` for multiple admins (see admin guide). |
| `CONTENT_PACK_ADMIN_SECRET` | Optional HMAC signing key (≥16 chars) for admin bearer tokens. If unset, an ephemeral secret is generated at process start (tokens invalidate on restart). |
| `CONTENT_PACK_DATA_DIR` | Directory for SQLite DB and on-disk ZIP blobs (default: `./data/content-packs` relative to the server cwd). |
| `CONTENT_PACK_DB_PATH` | Optional override for the SQLite file path. |

Back up **both** the database file and the blob directory together; revisions reference stored ZIP paths.

## Admin authentication (PIN)

Admin flows use a **second** credential on top of the Content Pack API key: an **HMAC-signed bearer token** obtained by exchanging a PIN. Tokens carry optional `name` / `wing` claims for auditing and future multi-Wing use.

| Endpoint | Auth | Success |
|----------|------|---------|
| `POST /api/admin/login` | None (PIN in JSON body) | `{ "token", "expiresAt", "name", "wing" }` |
| `GET /api/admin/session` | `Authorization: Bearer <admin token>` **or** `X-Admin-Token: <admin token>` | `{ "ok": true, "name", "wing", "expiresAt" }` |

**Login body:** `{ "pin": "<string>" }`  
**Errors:** `503` `admin_not_configured` — no PINs configured. `401` `bad_pin` — incorrect PIN. `429` `too_many_attempts` — rate limited after repeated failures; response includes **`Retry-After`** (seconds). `400` `pin_required` — empty body.

**Token model:** payload is base64url JSON + `.` + HMAC-SHA256 signature. Default **TTL 4 hours** from issuance. Verify server uses the same secret that signed the token (`CONTENT_PACK_ADMIN_SECRET` or ephemeral startup secret).

**Using the token on admin-gated routes:** send the same token as either:

- `Authorization: Bearer <admin token>`, or  
- `X-Admin-Token: <admin token>`

**Rate limiting:** per client IP, **three failed PIN attempts** within a rolling window trigger a **one-minute lockout** (HTTP 429 as above). A successful login clears the streak for that IP.

Admin-only content-pack routes **also** require the Content Pack API key when `CONTENT_PACK_API_KEY` is set (same as other `/api/content-packs` routes).

## Endpoints

| Method | Path | API key (if configured) | Admin token |
|--------|------|-------------------------|-------------|
| `GET` | `/api/content-packs` | Required | No |
| `POST` | `/api/content-packs` | Required | **Required** (multipart upload) |
| `POST` | `/api/content-packs/new` | Required | **Required** (JSON create empty pack) |
| `GET` | `/api/content-packs/:id` | Required | No |
| `GET` | `/api/content-packs/:id/revisions` | Required | No |
| `GET` | `/api/content-packs/:id/export` | Required | No |
| `POST` | `/api/content-packs/:id/preview-apply` | Required | No |
| `POST` | `/api/content-packs/:id/apply` | Required | No |
| `DELETE` | `/api/content-packs/:id` | Required | **Required** (permanent pack removal) |

- `GET /api/content-packs` — `{ "packs": [ … ] }` each row includes `id`, `name`, `current_revision`, `primary_route_number`, `created_at`, `updated_at`, `csv_member_path`, etc. (SQLite column names as JSON keys).
- `POST /api/content-packs` — Multipart field **`file`**: ForeFlight content-pack ZIP. Optional field **`name`**: display name (defaults to uploaded filename without `.zip`). Creates pack + revision 1 + waypoint rows. **Response:** `{ "pack": { … }, "nonEssential": { "count", "totalBytes", "samplePaths" } }`. `nonEssential` lists ZIP members outside the supported minimal surface (`manifest.json` + `navdata/user_waypoints.csv`), excluding benign macOS cruft (`__MACOSX/`, `._*`, `.DS_Store`). Count is informational, not a hard error.
- `POST /api/content-packs/new` — JSON body, admin-only. Creates a minimal pack for a route with no prior tower CSV.

**`POST /api/content-packs/new` body:**

| Field | Required | Description |
|-------|----------|-------------|
| `routeNumber` | Yes | Non-empty numeric string, e.g. `"112"`, `"355"`. |
| `displayName` | No | Pack / manifest display name; default `IR{routeNumber} Reported Towers`. |
| `organizationName` | No | Manifest `organizationName`; default `ForeFlight`. |
| `abbreviation` | No | Manifest `abbreviation`; default `IR{routeNumber}.V1` (server truncates to 32 chars). |

**Success:** `201` with `{ "pack": { … } }` (same pack shape as other routes). **Errors:** `400` `invalid_route_number` / `create_empty_failed` with `message`.

- `GET /api/content-packs/:id` — `{ "pack": { … } }`; optional `?include=waypoints`. Use `pack.current_revision` as `expectedRevision` on the next `apply` call.
- `GET /api/content-packs/:id/revisions` — Revision history.
- `GET /api/content-packs/:id/export` — Download ZIP with updated CSV merged into the stored baseline (same member path).
- `POST /api/content-packs/:id/preview-apply` — JSON body: `{ routeNumber, towers: [...] }`. Returns summary without persisting.
- `POST /api/content-packs/:id/apply` — JSON body: `{ routeNumber, expectedRevision, towers: [...] }`. On success, creates the next revision and updates waypoints. Returns `409`-style JSON if `expectedRevision` does not match.
- `DELETE /api/content-packs/:id` — Admin-only. Permanently deletes the pack row (waypoints and revisions cascade), removes `data/content-packs/<id>/` from disk, and returns **`204`** with an empty body on success. **`404`** if the id is unknown.

## Wing deployment notes

- Terminate TLS at your reverse proxy; do not expose plain HTTP for API keys.
- Set `CORS_ORIGINS` to include your hosted SPA origin (see `docs/API_HOSTING.md` if present).
- **Upgrade path**: replace SQLite with Postgres and swap disk blobs for S3-compatible storage; keep the same route shapes and optimistic concurrency (`expectedRevision`).

## Client

The SPA can call these endpoints via `src/services/contentPackApi.ts`. For production, prefer storing the API key in the browser (localStorage key `hightowers.contentPackApiKey`) or SSO at the proxy rather than embedding `VITE_CONTENT_PACK_API_KEY` in the build.
