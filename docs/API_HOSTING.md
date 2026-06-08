# Hosting the HighTowers-Web API (Node proxy)

GitHub Pages serves **only** the static Vite build. The Express app under `server/` provides MTR NASR data, Mapbox static-image proxying (PDF export), and Copernicus recent imagery. For training parity with `npm run dev:all`, deploy that server separately and point the web app at it with **`VITE_API_BASE_URL`**.

**First-time setup (Pages + Wing Administrator Console):** step-by-step checklist — [`FIRST_TIME_WING_ADMIN_RUNBOOK.md`](./FIRST_TIME_WING_ADMIN_RUNBOOK.md).

## Render vs Fly.io vs Railway (short comparison)

| | **Fly.io** | **Render** | **Railway** |
|---|------------|------------|-------------|
| **Mental model** | Run a **Docker image** on lightweight VMs | **Web Service** from Git or Docker | **Project** with services; Git-connected |
| **Portability to a wing site** | **Strong**: the `server/Dockerfile` is the contract; wing IT can run the same image on their Docker host or Kubernetes | **Good**: supports Docker too; also “native” Node without Docker | **Good**: usually container-based; less emphasis on “you own the Dockerfile” in docs |
| **Cold starts** | Instance stays **running** if you keep one machine up | Free web services **spin down**; first request can be slow | Keep the service **always on** for training; avoid scale-to-zero on hobby plans |
| **Disk cache** | **Volume** for `server/.mtr-cache` (and content packs) | Ephemeral unless you add a **disk** | **Volume** recommended for `.mtr-cache` — see Railway example below |
| **Ops fit for CAP / wing migration** | Easy handoff: *“Here is the image, env vars, and port 3001.”* | Easy handoff: *“Here is the repo path `server/`, start command, and env vars.”* | Easy handoff: *“GitHub repo, `server/` root, env vars, volume mount path.”* |

## Recommendation (NM Wing–ready path)

**Default choice: Fly.io**, because:

1. **`server/Dockerfile`** defines the runtime in one place. When the app moves off GitHub Pages to a New Mexico Wing–managed host, the same container (or the same `server/` tree) is what operations deploy—no vendor-specific function format.
2. **Explicit always-on VM** suits MTR CSV **disk cache** (`server/.mtr-cache`) and predictable latency for training.
3. **Render** or **Railway** are close seconds if you prefer “connect GitHub, set root directory `server`, no Docker” for the first deployment.

**Railway** fits interim **training** hosting (personal account, outside official CAP web guidelines): fast GitHub deploy, env-var UI, public `*.up.railway.app` URL. Use a **volume** for NASR cache so redeploys do not re-download FAA zips every time.

None of these lock you in technically: the app is still **plain Node + Express** + env vars. Moving later means redeploying `server/` (or the Docker image) on the wing’s infrastructure and updating **`CORS_ORIGINS`** + **`VITE_API_BASE_URL`**.

## Client configuration

- **`VITE_API_BASE_URL`** — Public origin of the API **only** (no path). Examples: `https://hightowers-api.fly.dev`, `https://hightowers-api.up.railway.app`, `https://api.yourwing.org`.
  - **Local:** leave unset; Vite proxies `/api` to port 3001.
  - **GitHub Actions (Pages):** set repository variable **`VITE_API_BASE_URL`** to that origin (see `.github/workflows/pages.yml`).

## Server configuration

Set on the host (or `.env` next to `server/` for local):

| Variable | Purpose |
|----------|---------|
| **`CORS_ORIGINS`** | Comma-separated list of **exact** browser origins allowed to call the API. Include your Pages site, e.g. `https://youruser.github.io`. For a project Page the origin is still `https://youruser.github.io` (path does not appear in `Origin`). Add localhost for local dev if you ever call the deployed API from a local Vite dev server. |
| **`VITE_MAPBOX_ACCESS_TOKEN`** or **`MAPBOX_ACCESS_TOKEN`** | Mapbox token for `/api/mapbox-static`. |
| *(none for NAIP)* | `/api/recent-imagery` uses public USDA NAIP ImageServer (outbound HTTPS only). |
| **`PORT`** | Listen port (default **3001**). Platforms often inject their own; keep defaults compatible. |
| **`MTR_CYCLE_DATE`** | Optional NASR cycle override if FAA index is blocked. |
| **`CONTENT_PACK_API_KEY`** / **`CONTENT_PACK_DATA_DIR`** | Optional ForeFlight Content Pack library — see [CONTENT_PACK_API.md](./CONTENT_PACK_API.md). |

If **`CORS_ORIGINS`** is unset, the server defaults to **localhost Vite/preview** only (safe default).

## Fly.io (example)

1. Install the [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) and run `fly launch` from **`HighTowers-Web/server/`** (or set Dockerfile path to this `Dockerfile`).
2. Map **internal port 3001** to public HTTPS.
3. Set secrets: `fly secrets set CORS_ORIGINS=https://youruser.github.io VITE_MAPBOX_ACCESS_TOKEN=...`
4. Put the public app URL (e.g. `https://hightowers-api.fly.dev`) in **`VITE_API_BASE_URL`** for the Pages build.

## Render (example)

1. New **Web Service**, connect the repo, root directory **`server`**, build **`npm ci`**, start **`npm start`**.
2. Add environment variables (same as Fly).
3. Use the Render HTTPS URL as **`VITE_API_BASE_URL`**.

## Railway (example)

Good for **interim training** access while the static app stays on GitHub Pages. The Node service is a separate public URL; pilots still open `https://youruser.github.io/HighTowers-Web/`.

### 1. Create the service

1. [Railway](https://railway.com) → **New Project** → **Deploy from GitHub repo** → select **HighTowers-Web**.
2. Open the new service → **Settings**:
   - **Root Directory:** `server`
   - **Start Command:** `npm start` (Railway usually detects Node; confirm after first deploy).
3. **Build** (if prompted): `npm ci` — or use **Dockerfile Path** `server/Dockerfile` if you prefer the same image as Fly.

Railway injects **`PORT`**; the server already listens on `process.env.PORT ?? 3001`.

### 2. Environment variables

In the service → **Variables**, set at minimum:

| Variable | Example / notes |
|----------|-----------------|
| `CORS_ORIGINS` | `https://gvdurfee.github.io` — origin only, no path |
| `VITE_MAPBOX_ACCESS_TOKEN` or `MAPBOX_ACCESS_TOKEN` | Mapbox token (PDF / map proxy) |
| `CONTENT_PACK_API_KEY` | If using Content Pack API |
| `CONTENT_PACK_ADMIN_PIN` | If using Wing Administrator Console |
| `CONTENT_PACK_DATA_DIR` | Optional; e.g. `/data/content-packs` when using a volume (below) |

Redeploy after changing variables.

### 3. Persistent volume (recommended)

NASR CSVs cache under **`server/.mtr-cache`**. Without a volume, each redeploy clears the cache and the first MTR/width request re-downloads from FAA.

1. Service → **Volumes** → **Add Volume**.
2. Mount path: **`/app/.mtr-cache`** (Nixpacks default working directory when root is `server`). If you deploy via **`server/Dockerfile`**, the same path applies (`WORKDIR /app` in that Dockerfile).
3. Optional second mount for content packs: **`/data/content-packs`** and set `CONTENT_PACK_DATA_DIR=/data/content-packs`.

### 4. Public URL

1. Service → **Settings** → **Networking** → **Generate Domain** (e.g. `hightowers-api-production.up.railway.app`).
2. Copy the **HTTPS origin only** (no `/api` suffix).

### 5. Connect GitHub Pages

1. GitHub repo → **Settings → Secrets and variables → Actions → Variables**
2. Set **`VITE_API_BASE_URL`** = `https://YOUR-SERVICE.up.railway.app`
3. Re-run **Deploy to GitHub Pages** (push to `main` or workflow dispatch).

### 6. Smoke-test

```bash
# Coordinator / NASR width (no API key)
curl -sS "https://YOUR-SERVICE.up.railway.app/api/mtr/width?routeType=VR&routeNumber=114"

# Content packs (if configured)
curl -sS -H "X-API-Key: YOUR_CONTENT_PACK_API_KEY" \
  "https://YOUR-SERVICE.up.railway.app/api/content-packs"
```

Expect JSON responses, not connection or CORS errors from your machine (browser CORS is enforced only in the browser; use the Pages site to confirm end-to-end).

### 7. Training / interim hosting notes

- Keep the Railway service **running** (do not rely on idle sleep) so pilots do not hit long cold starts during exercises.
- Usage is billed on Railway’s plan; a small always-on Node service is typically modest for a wing training cohort.
- This posture is **independent of official CAP website hosting**; the same `server/` tree can move to wing infrastructure later by updating **`CORS_ORIGINS`** and **`VITE_API_BASE_URL`**.

## After moving to the NM Wing website

1. Host **static files** on the wing web server (or keep a static host).
2. Host **this API** on a subdomain (e.g. `api.wing.example.org`) or behind their reverse proxy.
3. Update **`CORS_ORIGINS`** to the **new** front-end origin(s).
4. Rebuild the web app with the new **`VITE_API_BASE_URL`** (or relative `/api` if the wing puts the API **same origin** behind nginx—then you can leave `VITE_API_BASE_URL` empty and proxy `/api` to Node).
