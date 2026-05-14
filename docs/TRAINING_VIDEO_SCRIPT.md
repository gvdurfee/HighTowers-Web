# HighTowers-Web — Training video script

Audience: **CAP aircrew** conducting an Air Force route survey (MTR tower documentation), using this web app plus ForeFlight and the aircraft G1000.  
Audience (appendix): **Wing administrator** for content-pack lifecycle only.

**Recording assumptions**

- Host: `http://localhost:5173` for local training, or your deployed Wing URL for production-style video.
- Use a **demo mission** and route (e.g. IR112) with non-sensitive coordinates if the video will be shared outside the Wing.
- Sidebar labels match the app: **Workflow Guide**, **Flight Plans**, **Tower Data Analysis**, **Map View**, **Air Force Report Form**, **Export Reported Data**, **ForeFlight Content Pack Update**.
- Optional on-screen subtitle in corner: “HighTowers — Air Force Route Survey workflow”.

**How to use this document**

- **NARRATION** — read as voiceover (edit wording to your Wing’s SOP).
- **ON-SCREEN** — what the viewer should see; align your cursor and pauses here.
- **PAUSE** — hold 2–3 seconds for editors or live narration breathing room.

**Suggested total runtime** — 18–28 minutes main program; +3–5 minutes for appendix (admin).

---

## Chapter 0 — Cold open (optional, 30–45 s)

**ON-SCREEN** — Workflow Guide; slow pan down the four numbered steps.

**NARRATION**  
“This app walks a Civil Air Patrol crew through an Air Force route survey: flight planning that lines up with ForeFlight and the G1000, documenting towers on the Air Force report form, measuring them in Tower Data Analysis, exporting the customer PDF, and refreshing ForeFlight content packs for the next season. I’ll follow the same order the Workflow Guide uses.”

**PAUSE**

---

## Chapter 1 — Orientation and sidebar (1–2 min)

**ON-SCREEN** — Left sidebar fully expanded; point at **Getting Started** → **Workflow Guide**.

**NARRATION**  
“Everything runs in the left sidebar. **Workflow Guide** is your checklist. Under **Mission Planning** you’ll use **Flight Plans**. **Mission Execution** is **Tower Data Analysis** and **Map View**. Under **Reporting** you’ll use the **Air Force Report Form**, **Export Reported Data**, and when it’s time to update ForeFlight packs, **ForeFlight Content Pack Update**. Tips appear as numbered lightbulbs — optional help; you can reset them from individual pages if you want them back.”

**ON-SCREEN** — Briefly collapse and expand sidebar using the arrow control.

**NARRATION**  
“You can collapse the sidebar for more map space; expand it when you need to jump sections.”

**PAUSE**

---

## Chapter 2 — Flight planning and G1000 export (4–6 min)

**ON-SCREEN** — Click **Flight Plans** → **New Flight Plan** (or use Workflow Guide → Flight Planning → Go).

**NARRATION**  
“We start with a flight plan that matches what you’ll fly in ForeFlight and program in the G1000. Enter your route type and number, entry and exit letters if the MTR uses them, and build the waypoint list the way your Wing SOP describes.”

**ON-SCREEN** — Complete minimal fields needed for a credible demo row; show waypoint list with **ForeFlight** / **G1000** naming if visible.

**NARRATION**  
“The app shows both ForeFlight-style and G1000-style waypoint names so you can cross-check against the chart and the navigator.”

**ON-SCREEN** — Save or continue until the plan exists; open **Flight Plans** list and click the plan to open **Flight Plan detail**.

**NARRATION**  
“After you save, open the plan from **Flight Plans** to review waypoints and export the file the G1000 expects.”

**ON-SCREEN** — Scroll to **Export .fpl** (or equivalent export control on the detail page); click export; show file appearing in downloads bar if browser shows it.

**NARRATION**  
“Export the **.fpl** and load it into the G1000 per your aircraft procedures. That keeps the metal airplane aligned with what you planned here.”

**PAUSE**

---

## Chapter 3 — Content pack for mission prep (ForeFlight) (3–5 min)

**ON-SCREEN** — Stay on **Flight Plan detail** for the same route; scroll to **Content Pack for this route** card.

**NARRATION**  
“Before the flight, crews pull the latest tower waypoints from the Wing server as a ForeFlight **content pack**. The app matches your flight plan’s route number to the right pack when one exists.”

**ON-SCREEN** — If the card shows “No pack on server,” narrate that the Wing must publish one; otherwise show **Download for ForeFlight (.zip)**.

**NARRATION**  
“If a pack matches your route, click **Download for ForeFlight**. You need the Wing **Content Pack API key** in this browser once — same as elsewhere in the app — usually saved under **ForeFlight Content Pack Update** → Settings → Server connection.”

**ON-SCREEN** — Click download; show success toast or confirmation if present.

**NARRATION**  
“Import the ZIP in ForeFlight on your iPad or iPhone the way your Wing briefs — typically Files → share sheet → Open in ForeFlight. After import, tower waypoints appear on the map for that route.”

**PAUSE**

---

## Chapter 4 — Map View (2–3 min)

**ON-SCREEN** — Sidebar → **Map View** (`/map`).

**NARRATION**  
“**Map View** is the big-picture check: your mission geometry against satellite context. Use it to brief the route and to sanity-check segments before you fly.”

**ON-SCREEN** — Pan/zoom; if mission selector exists, switch missions to show the plan you built.

**NARRATION**  
“Pick the mission or plan your Wing uses for this sortie so the overlay matches the cockpit.”

**PAUSE**

---

## Chapter 5 — Air Force Report Form (3–5 min)

**ON-SCREEN** — Sidebar → **Air Force Report Form**.

**NARRATION**  
“This form is the living record for the Air Force customer: mission identification, tower observations, bearings and distances, and anything that belongs in **Additional Notes** at the bottom. Data you add here flows into the export PDF later.”

**ON-SCREEN** — Create or select a **mission** tied to the flight plan if the UI requires it; fill one tower row or observation minimally for demo.

**NARRATION**  
“Tie the report to the mission and flight plan you already built so tower entries stay consistent with the route.”

**ON-SCREEN** — Scroll to **Additional Notes**; mention optional lightbulb for first-time users.

**NARRATION**  
“Additional Notes are repeated on the last appendix page of the exported survey PDF — useful for content-pack audit lines and other mission commentary.”

**PAUSE**

---

## Chapter 6 — Tower Data Analysis (5–8 min)

**ON-SCREEN** — Sidebar → **Tower Data Analysis**.

**NARRATION**  
“Here each tower gets a photo, a map position, and a height workflow. This is where you spend most of your airborne or post-flight time per structure.”

**ON-SCREEN** — Select or add a tower observation; show **Look for Tower on Map** (or equivalent) and placing the marker.

**NARRATION**  
“Use **Look for Tower on Map** to drop the tower on the satellite image so latitude and longitude match what you measured.”

**ON-SCREEN** — Complete height / AGL / MSL fields per your SOP; save.

**NARRATION**  
“Complete the height measurement block and save. Those values feed the report form and downstream export.”

**ON-SCREEN** — Optional: show **Reset hints** if you mention refresher training.

**NARRATION**  
“If you dismissed the lightbulb tips and want them back, use **Reset hints** on this page or on the Report Form / New Flight Plan pages.”

**PAUSE**

---

## Chapter 7 — Export and customer deliverable (2–4 min)

**ON-SCREEN** — Sidebar → **Export Reported Data**.

**NARRATION**  
“When the mission is complete and tower rows are filled in, **Export Reported Data** builds the Air Force Route Survey PDF for the customer.”

**ON-SCREEN** — Select mission; generate PDF; open preview or downloaded file briefly (first page + appendix mention).

**NARRATION**  
“Confirm the mission name, tower table, and appendix material — including the map and any Additional Notes — before you send the package to the customer.”

**PAUSE**

---

## Chapter 8 — ForeFlight content pack **close-out** (next season’s data) (4–6 min)

**ON-SCREEN** — Sidebar → **ForeFlight Content Pack Update**; ensure a **mission** is selected that has tower work and a flight plan.

**NARRATION**  
“After the flight, the Wing’s canonical tower list lives on the server. **ForeFlight Content Pack Update** is where you **apply** this mission’s towers to that pack: refine coordinates when a tower moved less than about thirty meters, or append brand-new towers with sequential route-style names.”

**ON-SCREEN** — Primary card **Apply this mission’s towers**; show route and matched pack; click **Preview changes**.

**NARRATION**  
“Preview shows how many rows would refine, append, or stay unchanged after four-decimal rounding. Read the green status line — it updates **Additional Notes** on the Air Force Report Form when you preview, so the audit trail stays in sync.”

**ON-SCREEN** — **Apply this mission’s towers**; confirm success message; Settings disclosure → **Download export (.zip) from server** *or* remind that day-to-day download is on **Flight Plan detail**.

**NARRATION**  
“Apply commits a new **revision** on the server. Download the fresh ZIP from Settings here, or from **Flight Plans** next year when you prep again — both hit the same export.”

**ON-SCREEN** — Settings → note about **Administrator** link for publish/delete if you want one sentence.

**NARRATION**  
“Publishing new packs or deleting a mistaken duplicate is **not** on this screen — that’s the Wing Administrator console, bookmark only, so crews can’t delete the library by accident.”

**PAUSE**

---

## Chapter 9 — Wrap-up and recurring operations (1–2 min)

**ON-SCREEN** — Return to **Workflow Guide**; highlight all four steps.

**NARRATION**  
“Same four beats every sortie: plan and export the G1000 file, prep ForeFlight from the server pack, execute towers in **Tower Data Analysis** with **Map View** support, finish the **Air Force Report Form**, export the PDF, then apply towers to the content pack so the next crew inherits your work.”

**NARRATION**  
“Questions go to your Wing’s training officer or whoever owns the ForeFlight API key and admin PIN.”

**PAUSE** — fade or end card.

---

## Appendix A — Wing Administrator (optional separate video, 3–5 min)

**Audience** — Few designated members; not the whole aircrew.

**ON-SCREEN** — Navigate directly to `/admin/content-packs` (bookmark); sign in with **Wing PIN**; show **Inventory** with **CSV member (in ZIP)** column.

**NARRATION**  
“This URL is not in the sidebar. Administrators sign in with the Wing PIN, use the same **Content Pack API key** as the rest of the app, and manage **Inventory**: publish ZIPs, create an **empty pack** for a brand-new MTR, or **delete** a duplicate or bad upload. The **CSV member** path matches what crews see under **ForeFlight Content Pack Update** → Settings — use it to tell two packs apart when the display name is the same.”

**ON-SCREEN** — Briefly show **Publish from existing ZIP** and **Create empty pack** forms without real secrets.

**NARRATION**  
“Before publishing, rename the **outer folder inside the ZIP** to something short and stable — for example `IR112_content_pack` — so future inventory stays readable.”

**PAUSE** — end.

---

## Post-production checklist

- [ ] Bleep or omit real API keys, PINs, customer names, and precise tower coordinates if the video is public.
- [ ] Add chapter markers in YouTube/Vimeo matching headings above.
- [ ] Attach Wing SOP PDF or QR code to end screen if your policy allows.
- [ ] Re-record Chapter 3 if `CONTENT_PACK_API_KEY` UI changes; re-record Appendix A if admin flows change.

---

## Revision history

| Date | Author | Notes |
|------|--------|--------|
| 2026-05-14 | Project doc | Initial script aligned to `WorkflowGuidePage` and `MainLayout` nav. |
