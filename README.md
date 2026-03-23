# HighTowers Web – CAP Tower Surveys

Web-based version of the HighTowers iPadOS app for Civil Air Patrol Air Force Route Survey missions.

## Requirements

- **Node.js 18+** (Vite and modern tooling require Node 18 or newer)
- Mapbox access token (see Setup below)

## Setup

1. **Install dependencies**
   ```bash
   cd HighTowers-Web && npm install
   ```

2. **Mapbox token**  
   A `.env` file with your Mapbox token is already configured (from project setup).  
   To change it or set up on a new machine, copy `.env.example` to `.env` and add your token:
   ```bash
   cp .env.example .env
   # Edit .env and set VITE_MAPBOX_ACCESS_TOKEN=your_token
   ```

3. **Run the dev server**
   ```bash
   npm run dev
   ```
   Opens at http://localhost:5173

4. **Optional: FAA MTR route lookup (flight plans)**  
   Starts the small Node backend and Vite together (proxies `/api` to the server):
   ```bash
   npm run dev:all
   ```
   Same app URL (typically http://localhost:5173). Requires network for FAA downloads and map tiles.

---

## Training install checklist (one page)

Use this to run the app on a **Mac or Windows** PC for **localhost** training before formal deployment. Commands are the same on both; only paths and how you open a terminal differ.

### Before class (organizer)

- [ ] Put a copy of the **`HighTowers-Web`** project folder on a **USB drive** (or share via zip/cloud). Include `package.json` and `package-lock.json`; do **not** rely on copying `node_modules` from another computer—reinstall on each machine/OS.
- [ ] Ensure trainers have a **Mapbox access token** (or distribute `.env` instructions only—never commit real tokens to git).
- [ ] Confirm training room has **Wi‑Fi** if you need maps, FAA MTR downloads, or a first-time `npm install`.

### On each training computer (Mac or Windows)

1. [ ] Install **Node.js 18+** from [https://nodejs.org](https://nodejs.org/) (LTS). Verify in a terminal:
   ```bash
   node -v
   ```
   Should show v18 or newer.

2. [ ] Copy **`HighTowers-Web`** from USB (or unzip) to a folder you can find, e.g.  
   - Mac: `~/Projects/HighTowers-Web`  
   - Windows: `C:\Projects\HighTowers-Web`

3. [ ] Open a terminal in that folder:  
   - **Mac:** Terminal → `cd` to the folder.  
   - **Windows:** PowerShell or Command Prompt → `cd` to the folder.

4. [ ] Install dependencies (needs internet the first time on this machine):
   ```bash
   npm install
   ```

5. [ ] Configure Mapbox: copy the example env file and add your token.
   ```bash
   cp .env.example .env
   ```
   On Windows without `cp`, copy `.env.example` to `.env` in File Explorer, then edit `.env` and set:
   `VITE_MAPBOX_ACCESS_TOKEN=your_token_here`

6. [ ] Start the app—choose one:
   - **Frontend only** (simplest):  
     `npm run dev` → open **http://localhost:5173**
   - **Frontend + MTR server** (flight plan FAA routes):  
     `npm run dev:all` → same URL

7. [ ] **Browser:** use Chrome, Edge, or Safari. Data is stored in the browser (**IndexedDB**) on that computer only.

### USB-only / offline notes

- **First-time setup** on a PC almost always needs **`npm install` online** unless you’ve prepared an offline npm mirror (advanced).
- Do **not** copy `node_modules` from a Mac to Windows (or ARM to Intel) and expect it to work—run `npm install` on each OS.
- Maps and FAA features need **network** while training unless you accept limited/offline behavior.

### Optional: production-like local build

```bash
npm run build
npm run preview
```

Serves the built `dist/` at localhost (still requires Node for `vite preview`).

---

## Project Structure

- `public/` – Static assets (e.g. `Blank Route Survey Form 2.pdf` template)
- `src/` – React app source
- `.env` – Local secrets (gitignored, never commit)

## V1 Scope (MVP)

Full feature parity with the HighTowers-2025 iPadOS app:

- Flight plan creation, waypoints, G1000 export
- Mission setup and Air Force Report Form
- Tower data analysis (photo selection, height measurement)
- Mission map view (route + towers)
- PDF report generation and export

Local persistence (IndexedDB) for V1; backend scaling planned for later.
