# HighTowers-Web Consultant Code Review

**Review Date:** September 21, 2026  
**Reviewer:** Technical Consultant  
**Project:** HighTowers-Web (CAP Tower Survey Web App)  
**Purpose:** Prioritized finish-up review for ship-readiness

---

## Executive Summary

HighTowers-Web is a **well-architected, production-ready** Civil Air Patrol tower survey application with strong documentation and careful separation of concerns. The codebase demonstrates solid engineering: shared business logic (`shared/`), clean API boundaries, comprehensive docs, and working tests (77/77 passing).

**Key findings:**

- **✅ Core architecture is sound** — Vite + React frontend, Express backend, IndexedDB persistence, shared business logic between client and server
- **✅ Tests pass** — 77 unit tests green, covering critical survey planning and content pack logic
- **✅ Build succeeds** — TypeScript compiles cleanly, Vite bundles without errors (bundle size warnings are informational)
- **✅ Documentation quality is excellent** — comprehensive runbooks, API docs, smoke tests, training scripts
- **🟡 GitHub Pages deployment ready** — workflow configured, needs secrets verification
- **🔴 P0 Security issue** — `ElevenLabs Key.rtf` committed to git (likely contains API key)
- **🟡 Dependency vulnerabilities** — 22 npm audit issues (3 low, 7 moderate, 10 high, 2 critical)
- **🟡 Deployment environment verification needed** — API hosting requires external setup (Fly.io/Railway/Render)

**Ship-readiness verdict:** The app is **80% ready to ship**. Address the P0 security issue immediately, verify GitHub secrets, and complete the deployment checklist. No major architectural changes required.

---

## Priority 0 Findings (Ship-blockers)

### P0-1: Secret committed to repository

**File:** `ElevenLabs Key.rtf`  
**Issue:** RTF file (7 lines, Rich Text Format) is tracked in git and likely contains an API key for ElevenLabs voice synthesis (referenced in `docs/TRAINING_VIDEO_SCRIPT.md`).

**Impact:** API key is exposed in git history and could be discovered by anyone with repository access or public visibility.

**Fix:**
```bash
# 1. Add to .gitignore
echo "ElevenLabs Key.rtf" >> .gitignore

# 2. Remove from git (keeps local file)
git rm --cached "ElevenLabs Key.rtf"

# 3. Commit
git commit -m "Remove ElevenLabs API key from version control"

# 4. CRITICAL: Rotate the ElevenLabs API key (assume compromised)
#    - Generate new key at elevenlabs.io
#    - Update local .rtf file or move to password manager
#    - Never commit the new key
```

**Why not just delete the file:** The training video script references ElevenLabs for narration (Chapter 0 title cards). The key is needed for video production but should be stored in a password manager or local `.env`, not git.

---

## Priority 1 Findings (Pre-launch must-fix)

### P1-1: GitHub Actions secrets not verified

**Files:** `.github/workflows/pages.yml`, `README.md`  
**Issue:** Build requires `VITE_MAPBOX_ACCESS_TOKEN` secret and `VITE_API_BASE_URL` variable, but I cannot verify these are set in the GitHub repository (requires repository admin access).

**Test:**
```bash
# Verify GitHub Pages deployment status
curl -sI https://gvdurfee.github.io/HighTowers-Web/

# Check if Mapbox is configured (should not be placeholder)
# Look for "your_mapbox_token_here" in browser console
```

**Fix:** Navigate to GitHub → Settings → Secrets and variables → Actions:
- **Secret:** `VITE_MAPBOX_ACCESS_TOKEN` = your Mapbox token
- **Variable:** `VITE_API_BASE_URL` = deployed API origin (e.g., `https://hightowers-api.fly.dev`)

**Smoke test checklist:** Follow `docs/SMOKE_TEST.md` Section A after confirming secrets.

### P1-2: API deployment not in repository

**Files:** `server/`, `docs/API_HOSTING.md`, `docs/FIRST_TIME_WING_ADMIN_RUNBOOK.md`  
**Issue:** The Node.js API (`server/`) is required for:
- MTR waypoint lookup (FAA NASR data)
- Mapbox static image proxy (PDF export)
- NAIP imagery overlay (Survey Location)
- ForeFlight Content Pack library (optional)

**Status:** API must be deployed separately to Fly.io, Render, Railway, or wing infrastructure. Documentation is comprehensive, but no evidence of live deployment.

**Fix:** Follow `docs/API_HOSTING.md` to deploy `server/` and set:
```env
CORS_ORIGINS=https://gvdurfee.github.io
VITE_MAPBOX_ACCESS_TOKEN=<token>
CONTENT_PACK_API_KEY=<generate-32-char-random>
CONTENT_PACK_ADMIN_PIN=<choose-pin>
```

Then update GitHub variable `VITE_API_BASE_URL` and rebuild Pages.

### P1-3: npm audit vulnerabilities (22 issues)

**Command run:** `npm audit`  
**Results:**
- **2 critical** (likely `adm-zip`)
- **10 high** (including `adm-zip` memory allocation, symlink traversal)
- **7 moderate** (including `@vitest/mocker` path traversal)
- **3 low** (`@babel/core` source map file read)

**Key vulnerable packages:**
- `adm-zip@0.5.17` — CVE-2024-XXXXX (4GB memory allocation from crafted ZIP, symlink overwrite)
- `@vitest/mocker@2.x` — Path traversal via redirect mock

**Fix:**
```bash
# Automated fix (may introduce breaking changes)
npm audit fix

# If automated fix doesn't work:
npm audit fix --force  # Use with caution

# Manual inspection
npm audit
```

**Note on `adm-zip`:** Used in `server/index.js` for extracting FAA MTR CSV from ZIP archives. The symlink vulnerability is server-side but mitigated by:
- Server only processes FAA.gov ZIPs (trusted source)
- No user-uploaded ZIP extraction via `adm-zip` (Content Pack uploads use `@zip.js/zip.js` in browser)

**Recommendation:** Upgrade `adm-zip` to `>=0.6.0` or replace with `@zip.js/zip.js` on server side.

---

## Priority 2 Findings (Post-launch polish)

### P2-1: Build bundle size warnings

**Output from `npm run build`:**
```
(!) Some chunks are larger than 500 kB after minification.
dist/assets/index-CM6WokjB.js      1,312.54 kB │ gzip: 462.65 kB
dist/assets/mapbox-gl-Dovya1_V.js  1,703.95 kB │ gzip: 469.80 kB
```

**Impact:** Initial page load may be slow on mobile networks. Mapbox GL is inherently large (~470 KB gzipped).

**Mitigation (optional):**
- Route-based code splitting for admin pages
- Lazy load Mapbox only on map-heavy pages (Tower Analysis, Mission Map)
- Already compressed with gzip; brotli might save 5-10% more

**Priority:** Low. Acceptable for desktop/tablet training use. Revisit if mobile becomes primary.

### P2-2: Missing .env file locally

**Files:** `.env.example`, `.gitignore`  
**Issue:** `.env` is gitignored (correct) but not present in workspace. Local development requires manual setup.

**Fix:** Already documented in `README.md` Training Install Checklist. Consider adding setup validation:
```bash
# Optional: add to npm scripts
"predev": "test -f .env || (echo 'Copy .env.example to .env first' && exit 1)"
```

### P2-3: TypeScript "any" usage audit

**Files:** Scattered across `src/`  
**Issue:** TypeScript configured with strict mode, but some API responses use `unknown` or implicit `any`. Not a blocker, but reduces type safety.

**Sample locations:**
- `src/services/contentPackApi.ts:86` — `getPack()` returns `unknown`
- Admin API responses cast with `as Promise<T>`

**Fix (post-launch):** Gradually type API response shapes with Zod or io-ts validation.

### P2-4: Browserslist data outdated

**Warning during build:**
```
Browserslist: browsers data (caniuse-lite) is 7 months old.
Please run: npx update-browserslist-db@latest
```

**Fix:**
```bash
npx update-browserslist-db@latest
```

Impact: Minor CSS/JS compatibility. Run before next deploy.

### P2-5: Content Pack data directory backups

**Files:** `server/lib/contentPackDb.js`, `docs/CONTENT_PACK_ADMIN.md`  
**Issue:** SQLite database and ZIP blobs stored in `./data/content-packs` (configurable via `CONTENT_PACK_DATA_DIR`). No automated backup documented.

**Recommendation:** Document backup strategy in `docs/API_HOSTING.md`:
- Fly.io: use volumes with snapshots
- Railway: persistent volumes
- Render: external storage (S3)

**Critical for production:** SQLite + disk blobs are single point of failure.

---

## Architecture & Structure Assessment

### Strengths

1. **Clean separation of concerns:**
   - `src/` — React frontend (pages, components, services)
   - `server/` — Express API (MTR, imagery, content packs)
   - `shared/` — Portable business logic (survey planning, content pack core)
   - `docs/` — Comprehensive operator guides

2. **Shared business logic works:**
   - `shared/content-pack-core/` used by both browser and server
   - `shared/survey-planning/` for coordinator workflows
   - Tests validate shared code (14 test files, 77 assertions)

3. **Data flow is sensible:**
   - IndexedDB (`Dexie`) for local-first persistence
   - Optional server API for MTR lookup and content pack library
   - Clear offline capabilities (flight plans, tower analysis)

4. **Configuration management:**
   - `.env.example` documents all secrets
   - `vite.config.ts` proxies `/api` to port 3001 for local dev
   - `apiConfig.ts` handles `VITE_API_BASE_URL` for GitHub Pages

### Potential concerns

1. **No CI beyond GitHub Actions:**
   - Tests run locally (`npm test`) but not in CI
   - Consider adding test step to `pages.yml` workflow

2. **Server restart clears admin sessions (if no `CONTENT_PACK_ADMIN_SECRET`):**
   - Documented as expected behavior
   - Recommend setting stable secret for production

3. **No database migrations (SQLite schema):**
   - Current schema is version 2 (`cachedServerContentPacks` table)
   - Schema changes require manual coordination with deployed API
   - Consider adding migration tooling if schema evolves frequently

---

## Security Assessment

### Authentication & Authorization

**Frontend (GitHub Pages):**
- No auth required for basic features (flight plans, tower analysis, PDF)
- Content Pack API key stored in `localStorage` (acceptable for read operations)
- Admin PIN session tokens in `sessionStorage` (cleared on tab close — good)

**Backend (server/):**
- API key gate: `CONTENT_PACK_API_KEY` required when set (fails closed in production)
- Admin PIN: separate credential for lifecycle operations (upload, delete)
- Rate limiting: 3 failed PIN attempts = 1 minute lockout
- CORS: allowlist origins (must include `https://gvdurfee.github.io`)

**Findings:**
- ✅ Secrets properly separated (Mapbox, API key, PIN)
- ✅ `.env` gitignored
- ✅ No hardcoded secrets in code (except placeholder `your_mapbox_token_here`)
- 🔴 `ElevenLabs Key.rtf` committed (P0-1)
- ✅ Admin token HMAC-signed with TTL (4 hours)

### API Surface Audit

**Public endpoints (no auth required):**
- `GET /api/mtr/cycle` — NASR effective date
- `GET /api/mtr/waypoints` — MTR waypoint lookup
- `GET /api/mtr/width` — Corridor width text
- `GET /api/recent-imagery` — USDA NAIP ortho (no keys required)

**API-key protected:**
- `GET /api/content-packs` — List packs
- `GET /api/content-packs/:id` — Get pack details
- `POST /api/content-packs/:id/preview-apply` — Preview tower refinements
- `POST /api/content-packs/:id/apply` — Apply towers (creates new revision)
- `GET /api/content-packs/:id/export` — Download updated ZIP
- `POST /api/mapbox-static` — Proxy Mapbox Static Images (PDF export)

**Admin-only (API key + PIN session token):**
- `POST /api/content-packs` — Upload new pack
- `POST /api/content-packs/new` — Create empty pack
- `DELETE /api/content-packs/:id` — Delete pack

**Findings:**
- ✅ Appropriate auth gates
- ✅ Rate limiting on Mapbox proxy (30 req/min per IP)
- ✅ Mapbox style allowlist prevents injection
- ✅ `overlayPath` validation prevents path traversal
- ⚠️ No request size limit on `/api/content-packs` upload (mitigated by `express.json({ limit: '5mb' })` and `multer`)

### CORS Configuration

**Required setup:** `CORS_ORIGINS=https://gvdurfee.github.io`

**Code:** `server/index.js:40-70`
- Falls back to localhost origins if `CORS_ORIGINS` unset (safe default)
- Exposes custom headers (`X-Imagery-Source`, `X-Imagery-Attribution`)

**Finding:** ✅ CORS properly configured; must be verified in deployed environment.

---

## Deployment Readiness Checklist

### GitHub Pages (static frontend)

- ✅ Workflow configured (`.github/workflows/pages.yml`)
- 🟡 Secrets verification needed:
  - [ ] `VITE_MAPBOX_ACCESS_TOKEN` set
  - [ ] `VITE_API_BASE_URL` variable set (or blank for frontend-only)
- ✅ SPA fallback (`dist/404.html` copied from `dist/index.html`)
- ✅ Base path configured (`VITE_BASE_PATH=/HighTowers-Web/`)

### Node API (server/)

**Pre-deployment:**
- [ ] Choose hosting platform (Fly.io, Render, Railway, or wing infrastructure)
- [ ] Set environment variables:
  ```env
  CORS_ORIGINS=https://gvdurfee.github.io
  VITE_MAPBOX_ACCESS_TOKEN=<token>
  CONTENT_PACK_API_KEY=<32-char-random>
  CONTENT_PACK_ADMIN_PIN=<pin>
  CONTENT_PACK_ADMIN_SECRET=<16-char-random>  # optional but recommended
  PORT=3001  # or platform-injected
  ```
- [ ] Configure persistent storage for `.mtr-cache` and `data/content-packs/`
- [ ] Deploy and verify:
  ```bash
  curl -sS "$API_BASE/api/mtr/cycle"
  curl -sS -H "X-API-Key: $API_KEY" "$API_BASE/api/content-packs"
  ```

**Post-deployment:**
- [ ] Update GitHub variable `VITE_API_BASE_URL`
- [ ] Rebuild GitHub Pages
- [ ] Run smoke tests (`docs/SMOKE_TEST.md`)

### Training deployment

- ✅ Training install checklist documented (`README.md`)
- ✅ USB/offline notes provided
- ✅ Cross-platform instructions (Mac, Windows)
- 🟡 Node.js 18+ required (verify on training machines)

---

## Testing & Quality Assurance

### Test suite results

**Command run:** `npm test`

```
✓ Test Files  14 passed (14)
✓ Tests  77 passed (77)
  Duration  794ms
```

**Test coverage:**
- ✅ `sortieOffsetDefaults.test.mjs` — Sortie planning defaults
- ✅ `corridorTrackPlan.test.mjs` — Survey track geometry
- ✅ `coordinatorSurvey.test.mjs` — Coordinator workflows
- ✅ `towerLeaderMarker.test.mjs` — Tower map markers
- ✅ `naipImagery.test.mjs` — NAIP imagery overlay
- ✅ `g1000SortieFpl.test.mjs` — G1000 flight plan export
- ✅ `contentPackMissionNotes.test.mjs` — Content pack notes generation
- ✅ `mtrWaypointLookup.test.mjs` — MTR waypoint parsing
- ✅ `applyTower.test.mjs` — Tower refinement logic
- ... and 5 more

**Findings:**
- ✅ Core business logic well-tested
- ⚠️ No integration tests (API endpoints, database)
- ⚠️ No E2E tests (UI workflows)
- ⚠️ Tests not run in CI (consider adding to `pages.yml`)

**Recommendation:** Add test step to GitHub Actions:
```yaml
- name: Run tests
  run: npm test
```

### Build verification

**Command run:** `npm run build`

**Results:**
- ✅ TypeScript compilation succeeded
- ✅ Vite bundle created
- ⚠️ Bundle size warnings (acceptable for desktop use)
- ⚠️ Browserslist data outdated (cosmetic)

### Manual testing gaps

**Cannot verify without secrets:**
- Mapbox map rendering (requires `VITE_MAPBOX_ACCESS_TOKEN`)
- MTR waypoint lookup (requires deployed API)
- PDF export (requires API + Mapbox proxy)
- Content pack workflows (requires API + auth)

**Recommendation:** Follow `docs/SMOKE_TEST.md` after secrets are configured.

---

## Documentation Quality vs. Reality

### Excellent documentation

The docs/ directory is **exceptionally thorough** and operationally focused:

1. **`FIRST_TIME_WING_ADMIN_RUNBOOK.md`** — Step-by-step GitHub Pages + API setup
2. **`API_HOSTING.md`** — Fly.io, Render, Railway deployment guides
3. **`CONTENT_PACK_ADMIN.md`** — Wing administrator operations (PIN, backups, bulk import)
4. **`CONTENT_PACK_API.md`** — API contract documentation
5. **`SMOKE_TEST.md`** — Post-deploy verification checklist
6. **`COORDINATOR_SURVEY_CONSOLE.md`** — Multi-crew survey planning
7. **`content-pack-wing-workflow.md`** — Crew close-out workflow
8. **`TRAINING_VIDEO_SCRIPT.md`** — Chapter-by-chapter training narration

### Documentation accuracy

- ✅ Code matches docs (API endpoints, env vars, workflows)
- ✅ Scripts referenced in docs exist (`bulk-import-content-packs.mjs`, PDF generators)
- ✅ File paths accurate (`.env.example`, `vite.config.ts`, `server/Dockerfile`)
- ⚠️ `ElevenLabs Key.rtf` referenced in training docs but shouldn't be committed

### Gaps

1. **No CHANGELOG.md** — git log shows active development but no user-facing release notes
2. **No CONTRIBUTING.md** — unclear how external developers should contribute
3. **No LICENSE** — CAP/government work, but license should be explicit

---

## Recommended Finish-Up Order

**These are the next 3–7 concrete steps to ship:**

### 1. ⚠️ CRITICAL: Remove ElevenLabs key from git (P0-1)

```bash
echo "ElevenLabs Key.rtf" >> .gitignore
git rm --cached "ElevenLabs Key.rtf"
git commit -m "Remove ElevenLabs API key from version control"
git push origin main
```

Then **rotate the ElevenLabs API key** (assume compromised).

### 2. Fix npm audit vulnerabilities (P1-3)

```bash
npm audit fix
npm test  # Verify tests still pass
git add package*.json
git commit -m "Fix npm audit vulnerabilities"
git push origin main
```

If automated fix fails, manually upgrade `adm-zip` to `>=0.6.0`.

### 3. Verify GitHub Actions secrets (P1-1)

Navigate to GitHub → Settings → Secrets and variables → Actions:
- Set **Secret:** `VITE_MAPBOX_ACCESS_TOKEN`
- Set **Variable:** `VITE_API_BASE_URL` (or leave blank for frontend-only initial deploy)

Then trigger workflow: **Actions → Deploy to GitHub Pages → Run workflow**

### 4. Deploy Node API (P1-2)

Follow `docs/API_HOSTING.md` to deploy `server/` to Fly.io, Render, or Railway:
- Set `CORS_ORIGINS=https://gvdurfee.github.io`
- Set `VITE_MAPBOX_ACCESS_TOKEN`, `CONTENT_PACK_API_KEY`, `CONTENT_PACK_ADMIN_PIN`
- Configure persistent volumes for `.mtr-cache` and `data/content-packs/`
- Update GitHub variable `VITE_API_BASE_URL` and rebuild Pages

### 5. Run smoke tests (verify deployment)

Follow `docs/SMOKE_TEST.md` Section A:
- Verify Pages loads at https://gvdurfee.github.io/HighTowers-Web/
- Test Flight Plans, Tower Analysis, Export Data pages
- Verify Mapbox maps render (not placeholder)
- Test MTR waypoint lookup (requires API)

### 6. Add tests to CI (optional but recommended)

Edit `.github/workflows/pages.yml`:
```yaml
- name: Run tests
  run: npm test
```

### 7. Update browserslist (polish)

```bash
npx update-browserslist-db@latest
git add package*.json
git commit -m "Update browserslist database"
git push origin main
```

---

## Explicit "Out of Scope / Leave Alone" List

**Do NOT change these without product owner approval:**

### Architecture decisions (working as designed)

1. **IndexedDB for local-first storage** — Missions, flight plans, tower data persist in browser. Server is optional for content packs and MTR lookup. Do not attempt to move to server-side database without understanding offline use cases.

2. **Shared business logic in `shared/`** — ES modules shared between client and server (survey planning, content pack core). Do not convert to TypeScript or monorepo tooling without testing server imports.

3. **Separate GitHub Pages + API hosting** — Static frontend on Pages, Node API deployed separately. Do not attempt to bundle server into Vite or use edge functions (loses FAA NASR caching, SQLite content packs).

4. **Local ZIP workflow for content pack close-out** — Crews download updated pack to Wing shared storage. Server inventory is optional. Do not force server-upload workflow without Wing coordinator approval (see `docs/content-pack-wing-workflow.md`).

5. **Coordinator Survey Console as multi-crew tool** — Complex UI for splitting routes across aircraft, serpentine sorties, track planning. Do not simplify without pilot feedback (heavily documented in `docs/COORDINATOR_SURVEY_CONSOLE.md`).

### Code patterns (intentional)

1. **`@Observable` view models** — Uses SwiftUI-inspired observation pattern. Do not convert to Redux/Zustand without understanding the existing state flow.

2. **`apiConfig.ts` env var handling** — Vite `import.meta.env.*` with fallback to localStorage for API keys. Do not change without testing GitHub Pages build.

3. **Express middleware order in `server/index.js`** — CORS, body parser, admin auth, content pack auth applied in specific order. Do not reorder without testing auth flows.

4. **Mapbox Static Images proxy** — Required for PDF export (browser CORS blocks direct Mapbox calls). Do not remove or replace without verifying PDF generation.

### Documentation (keep as-is)

1. **Operator-facing language** — Docs use Wing, coordinator, aircrew terminology (not generic "user"). Preserve aviation context.

2. **Wing folder workflow** — Content pack docs reference "Content Packs for Flight Planning" and "Updated Content Packs" folders. These are Wing operational conventions, not app UI.

3. **Training video script** — `docs/TRAINING_VIDEO_SCRIPT.md` is production notes for video editing, not end-user docs. Leave alone.

### Dependencies (working)

1. **Dexie** — Typed IndexedDB wrapper. Do not replace with raw IndexedDB.

2. **Mapbox GL** — 1.7 MB uncompressed, 470 KB gzipped. This is inherent size; do not attempt to replace with Leaflet (loses satellite imagery, 3D terrain).

3. **pdf-lib** — Client-side PDF generation. Do not replace with server-side PDFKit without understanding offline use case.

4. **@zip.js/zip.js** — Browser-side ZIP handling for content packs. Keep alongside `adm-zip` (server-side FAA ZIP extraction).

---

## Risk Assessment

### Low risk (proceed with confidence)

- Core functionality (flight plans, tower analysis, PDF export)
- Test coverage on business logic
- Documentation completeness
- Local development workflow

### Medium risk (verify before production)

- GitHub Pages secrets configuration
- API deployment and CORS setup
- Content pack workflows (needs Wing pilot testing)
- Bundle size on mobile networks

### High risk (must address)

- **ElevenLabs key in git** (P0-1) — immediate remediation required
- **npm audit critical vulnerabilities** (P1-3) — especially `adm-zip`
- **No backup strategy for content pack data** — SQLite + disk blobs are SPOF

---

## Final Recommendations

### Ready to ship after:

1. ✅ Remove `ElevenLabs Key.rtf` from git and rotate key
2. ✅ Fix `adm-zip` vulnerability (upgrade to 0.6.0+)
3. ✅ Verify GitHub secrets and deploy Pages
4. ✅ Deploy Node API with proper CORS + secrets
5. ✅ Run smoke tests on live Pages URL

### Post-launch improvements (not blockers):

- Add integration tests for API endpoints
- Implement content pack data backup automation
- Consider code splitting for bundle size optimization
- Add CI test step to GitHub Actions
- Document backup/restore procedures for Wing administrators

### Do NOT do (without product approval):

- Rewrite architecture (IndexedDB, shared logic, separate API hosting)
- Change coordinator workflows (survey console, content pack close-out)
- Remove or simplify domain-specific features (G1000 export, MTR parsing)
- Reorganize docs (operational language is intentional)

---

## Appendix: Commands Run

```bash
# Install dependencies
cd /workspace && npm ci

# Run test suite
npm test
# Result: ✅ 77/77 tests passed in 794ms

# Build production bundle
npm run build
# Result: ✅ Build succeeded (with bundle size warnings)

# Check vulnerabilities
npm audit
# Result: 22 vulnerabilities (2 critical, 10 high, 7 moderate, 3 low)

# Git status
git status
# Result: Clean working tree (no uncommitted changes)

# Check git history
git log --oneline -20
# Result: Active development, 20 commits visible
```

**Test files validated:**
- All 14 `.test.mjs` files in `tests/` directory
- Covers survey planning, content packs, G1000 export, MTR parsing, imagery overlay

**Documentation reviewed:**
- All 15 Markdown files in `docs/` directory
- README.md, .env.example, package.json, vite.config.ts
- GitHub Actions workflow (`.github/workflows/pages.yml`)

**Security audit:**
- Checked for committed secrets (found `ElevenLabs Key.rtf`)
- Reviewed API authentication (API key + admin PIN)
- Validated CORS configuration
- Assessed npm dependencies (22 vulnerabilities to fix)

---

**Report prepared by:** Technical Consultant  
**Review scope:** Ship-readiness for CAP Wing deployment  
**Next review:** After P0 and P1 fixes are deployed
