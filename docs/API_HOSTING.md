# Hosting the HighTowers-Web API (Node proxy)

GitHub Pages serves **only** the static Vite build. The Express app under `server/` provides MTR NASR data, Mapbox static-image proxying (PDF export), and Copernicus recent imagery. For training parity with `npm run dev:all`, deploy that server separately and point the web app at it with **`VITE_API_BASE_URL`**.

## Render vs Fly.io vs Railway (short comparison)

| | **Fly.io** | **Render** | **Railway** |
|---|------------|------------|-------------|
| **Mental model** | Run a **Docker image** on lightweight VMs | **Web Service** from Git or Docker | **Project** with services; Git-connected |
| **Portability to a wing site** | **Strong**: the `server/Dockerfile` is the contract; wing IT can run the same image on their Docker host or Kubernetes | **Good**: supports Docker too; also “native” Node without Docker | **Good**: usually container-based; less emphasis on “you own the Dockerfile” in docs |
| **Cold starts** | Instance stays **running** if you keep one machine up | Free web services **spin down**; first request can be slow | Similar usage-based behavior; configure for always-on if needed |
| **Ops fit for CAP / wing migration** | Easy handoff: *“Here is the image, env vars, and port 3001.”* | Easy handoff: *“Here is the repo path `server/`, start command, and env vars.”* | Similar to Render for handoff |

## Recommendation (NM Wing–ready path)

**Default choice: Fly.io**, because:

1. **`server/Dockerfile`** defines the runtime in one place. When the app moves off GitHub Pages to a New Mexico Wing–managed host, the same container (or the same `server/` tree) is what operations deploy—no vendor-specific function format.
2. **Explicit always-on VM** suits MTR CSV **disk cache** (`server/.mtr-cache`) and predictable latency for training.
3. **Render** is a close second if you prefer “connect GitHub, set root directory, no Docker” for the first deployment; you can add Docker later.

**Railway** is comparable to Render for day-one ease; pick it if you already use it elsewhere.

None of these lock you in technically: the app is still **plain Node + Express** + env vars. Moving later means redeploying `server/` (or the Docker image) on the wing’s infrastructure and updating **`CORS_ORIGINS`** + **`VITE_API_BASE_URL`**.

## Client configuration

- **`VITE_API_BASE_URL`** — Public origin of the API **only** (no path). Examples: `https://hightowers-api.fly.dev`, `https://api.yourwing.org`.
  - **Local:** leave unset; Vite proxies `/api` to port 3001.
  - **GitHub Actions (Pages):** set repository variable **`VITE_API_BASE_URL`** to that origin (see `.github/workflows/pages.yml`).

## Server configuration

Set on the host (or `.env` next to `server/` for local):

| Variable | Purpose |
|----------|---------|
| **`CORS_ORIGINS`** | Comma-separated list of **exact** browser origins allowed to call the API. Include your Pages site, e.g. `https://youruser.github.io`. For a project Page the origin is still `https://youruser.github.io` (path does not appear in `Origin`). Add localhost for local dev if you ever call the deployed API from a local Vite dev server. |
| **`VITE_MAPBOX_ACCESS_TOKEN`** or **`MAPBOX_ACCESS_TOKEN`** | Mapbox token for `/api/mapbox-static`. |
| **`CDSE_OAUTH_CLIENT_ID`** / **`CDSE_OAUTH_CLIENT_SECRET`** | Copernicus Data Space — required for `/api/recent-imagery`. |
| **`PORT`** | Listen port (default **3001**). Platforms often inject their own; keep defaults compatible. |
| **`MTR_CYCLE_DATE`** | Optional NASR cycle override if FAA index is blocked. |

If **`CORS_ORIGINS`** is unset, the server defaults to **localhost Vite/preview** only (safe default).

## Fly.io (example)

1. Install the [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) and run `fly launch` from **`HighTowers-Web/server/`** (or set Dockerfile path to this `Dockerfile`).
2. Map **internal port 3001** to public HTTPS.
3. Set secrets: `fly secrets set CORS_ORIGINS=https://youruser.github.io VITE_MAPBOX_ACCESS_TOKEN=...` (and CDSE vars if needed).
4. Put the public app URL (e.g. `https://hightowers-api.fly.dev`) in **`VITE_API_BASE_URL`** for the Pages build.

## Render (example)

1. New **Web Service**, connect the repo, root directory **`server`**, build **`npm ci`**, start **`npm start`**.
2. Add environment variables (same as Fly).
3. Use the Render HTTPS URL as **`VITE_API_BASE_URL`**.

## After moving to the NM Wing website

1. Host **static files** on the wing web server (or keep a static host).
2. Host **this API** on a subdomain (e.g. `api.wing.example.org`) or behind their reverse proxy.
3. Update **`CORS_ORIGINS`** to the **new** front-end origin(s).
4. Rebuild the web app with the new **`VITE_API_BASE_URL`** (or relative `/api` if the wing puts the API **same origin** behind nginx—then you can leave `VITE_API_BASE_URL` empty and proxy `/api` to Node).
