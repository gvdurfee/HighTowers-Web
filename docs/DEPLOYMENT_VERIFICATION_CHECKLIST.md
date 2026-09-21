# Deployment Verification Checklist

**Purpose:** Step-by-step verification for P1 tasks that require GitHub repository admin access or external service deployment.

**Status after automated fixes:**
- ✅ P0: ElevenLabs API key removed from git
- ✅ P1-3: Critical npm vulnerabilities fixed (adm-zip upgraded)
- 🟡 P1-1: GitHub Actions secrets (requires repo admin)
- 🟡 P1-2: API deployment (requires external service)

---

## P1-1: Verify GitHub Actions Secrets

**Who can do this:** Repository administrator with Settings access

### Step 1: Check if secrets are configured

Navigate to: **GitHub → gvdurfee/HighTowers-Web → Settings → Secrets and variables → Actions**

### Step 2: Verify required secrets

**Repository Secrets** (encrypted):

| Name | Required | Purpose | How to get |
|------|----------|---------|------------|
| `VITE_MAPBOX_ACCESS_TOKEN` | Yes | Map rendering, satellite imagery | https://account.mapbox.com/ → Create token with default scopes |

**Repository Variables** (plaintext):

| Name | Required | Purpose | Example Value |
|------|----------|---------|---------------|
| `VITE_API_BASE_URL` | Optional* | Node API origin for MTR/imagery | `https://hightowers-api.fly.dev` (no trailing slash) |

\* **Optional for initial deploy:** If `VITE_API_BASE_URL` is blank, the app will deploy in "frontend-only" mode. Users can still create flight plans and tower reports, but MTR waypoint lookup, NAIP imagery, and Content Pack features require the API.

### Step 3: Test the secrets

**After setting secrets:**

1. Go to **Actions → Deploy to GitHub Pages**
2. Click **Run workflow** (top right)
3. Wait ~2 minutes for green checkmark
4. Open https://gvdurfee.github.io/HighTowers-Web/
5. Check browser console (F12):
   - Should **NOT** show "your_mapbox_token_here"
   - Map pages should load satellite imagery

### Troubleshooting

| Symptom | Fix |
|---------|-----|
| Blank page after deploy | Wrong `VITE_BASE_PATH` in workflow (should be `/HighTowers-Web/`) |
| "Mapbox token not found" in console | `VITE_MAPBOX_ACCESS_TOKEN` secret missing or invalid |
| MTR waypoints fail | `VITE_API_BASE_URL` not set or API not deployed (P1-2) |

---

## P1-2: Deploy Node.js API

**Who can do this:** Developer with access to deploy external services (Fly.io, Render, or Railway account)

### Prerequisites

- [ ] Mapbox access token (same as Pages or separate)
- [ ] 32-character API key for Content Packs (generate: `openssl rand -hex 32`)
- [ ] Admin PIN (4+ digits for Wing Administrator console)
- [ ] Optional: Admin secret (16+ chars for persistent sessions)

### Deployment options (choose one)

#### Option A: Fly.io (recommended for production)

**Pros:** Docker-based, explicit VM, easy handoff to wing IT  
**Docs:** `docs/API_HOSTING.md` § Fly.io

```bash
cd server
fly launch  # Follow prompts, use existing Dockerfile
fly secrets set \
  CORS_ORIGINS=https://gvdurfee.github.io \
  VITE_MAPBOX_ACCESS_TOKEN=<your-token> \
  CONTENT_PACK_API_KEY=<your-32-char-key> \
  CONTENT_PACK_ADMIN_PIN=<your-pin> \
  CONTENT_PACK_ADMIN_SECRET=<your-16-char-secret>

# Note the public URL (e.g. https://hightowers-api.fly.dev)
```

#### Option B: Render (simplest for first deploy)

**Pros:** No CLI needed, connect GitHub, auto-deploy  
**Docs:** `docs/API_HOSTING.md` § Render

1. Sign in to [render.com](https://render.com)
2. New Web Service → Connect `gvdurfee/HighTowers-Web`
3. Settings:
   - **Root Directory:** `server`
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
4. Environment Variables (same as Fly.io above)
5. Deploy and note the public URL

#### Option C: Railway (interim training)

**Pros:** Fast GitHub deploy, good for temporary training hosting  
**Docs:** `docs/API_HOSTING.md` § Railway (full walkthrough)

1. [railway.com](https://railway.com) → New Project → Deploy from GitHub
2. Root directory: `server`
3. Environment Variables (same as Fly.io above)
4. Add Volume: `/app/.mtr-cache` (persists FAA NASR downloads)
5. Generate Domain → note public URL

### After deployment

1. **Smoke test the API:**

   ```bash
   # Replace with your deployed URL
   export API_BASE=https://YOUR-API-HOST.fly.dev
   
   # Test cycle endpoint (no auth)
   curl -sS "$API_BASE/api/mtr/cycle"
   
   # Test content packs (requires API key)
   curl -sS -H "X-API-Key: YOUR_CONTENT_PACK_API_KEY" \
     "$API_BASE/api/content-packs"
   ```

   Expect JSON responses, not connection errors.

2. **Update GitHub Pages:**
   - GitHub → Settings → Secrets and variables → Actions → **Variables**
   - Set `VITE_API_BASE_URL` = `https://YOUR-API-HOST.fly.dev` (origin only, no `/api` suffix)
   - Actions → Deploy to GitHub Pages → Run workflow

3. **Test end-to-end:**
   - Open https://gvdurfee.github.io/HighTowers-Web/
   - Create a flight plan with MTR route (e.g., IR 111)
   - Flight Plan Detail → "Look up" waypoints
   - Should fetch from deployed API (check Network tab)

### Persistent storage notes

**Required volumes:**

| Path | Purpose | Size |
|------|---------|------|
| `/.mtr-cache` or `/app/.mtr-cache` | FAA NASR CSV cache (28-day cycles) | ~50 MB |
| `/data/content-packs` | SQLite + ZIP blobs (optional feature) | Variable |

Without volumes, FAA downloads repeat on every restart (slow first request).

---

## P1-1 + P1-2 Combined Test (End-to-End)

**After both GitHub secrets and API deployment:**

Follow **`docs/SMOKE_TEST.md` Section A** for comprehensive verification:

1. GitHub Pages loads at https://gvdurfee.github.io/HighTowers-Web/
2. Mapbox maps render (not placeholder)
3. Flight Plan → New → MTR waypoint lookup works
4. Tower Analysis → Map loads with satellite imagery
5. Export Data → PDF generation succeeds (uses Mapbox proxy on API)
6. Coordinator Survey Console → Width text loads (FAA NASR from API)

---

## Additional P1 Tasks (Code Changes)

### Add tests to CI (recommended)

**Edit `.github/workflows/pages.yml`:**

```yaml
- name: Run tests
  run: npm test
```

This ensures all 77 tests pass before deploying to Pages.

### Document backup strategy (operations)

**Add to `docs/API_HOSTING.md` or Wing administrator guide:**

- Fly.io: `fly volumes snapshots` or daily cron backup
- Render: export SQLite + copy `data/content-packs/` to S3/Dropbox
- Railway: volume backups or external storage
- Critical: back up `data/content-packs/` directory (SQLite + ZIPs) together

---

## Verification Complete Checklist

Once all steps above are done:

- [ ] GitHub Pages deploys without errors
- [ ] Mapbox maps load on Tower Analysis page
- [ ] MTR waypoint lookup works (Flight Plan detail)
- [ ] PDF export succeeds with mission map
- [ ] Coordinator Survey Console loads NASR width text
- [ ] Wing Administrator Console sign-in works (if using Content Packs)
- [ ] All smoke tests pass (`docs/SMOKE_TEST.md`)

**Ship-readiness:** 100% after this checklist is complete.

---

## Security Reminders

**Completed in this branch:**
- ✅ ElevenLabs API key removed from git (P0)
- ✅ `.gitignore` updated to prevent future key commits
- ✅ Critical `adm-zip` vulnerability fixed

**Manual actions required:**
- ⚠️ **Rotate ElevenLabs API key** — assume old key is compromised (was in git history)
- ⚠️ **Store new key in password manager** — never commit to git
- ⚠️ Set strong `CONTENT_PACK_API_KEY` (32 chars) and `CONTENT_PACK_ADMIN_PIN` on API server

---

**Document created:** September 21, 2026  
**Related docs:** `docs/API_HOSTING.md`, `docs/FIRST_TIME_WING_ADMIN_RUNBOOK.md`, `docs/SMOKE_TEST.md`  
**Next review:** After deployment verification is complete
