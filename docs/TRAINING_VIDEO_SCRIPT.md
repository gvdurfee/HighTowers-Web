# HighTowers-Web — Training video script

Audience: **CAP aircrew** conducting an Air Force route survey (MTR tower documentation), using this web app plus ForeFlight and the aircraft G1000.  
Secondary audience: **Wing survey coordinators** staffing one to three aircraft and comparing sortie plans before the season.  
Audience (appendix): **Wing administrator** for content-pack lifecycle only.

**Recording assumptions**

- Host: `http://localhost:5173` for local training, or your deployed Wing URL for production-style video.
- For **Coordinator Survey Console** width data locally, run **`npm run dev:all`** (Vite + Node API on port 3001). Deployed Wings use the same API on Railway.
- Use a **demo mission** and route (e.g. **VR114** or IR112) with non-sensitive coordinates if the video will be shared outside the Wing.
- Sidebar labels match the app: **Workflow Guide**, **Flight Plans**, **Coordinator Console**, **Tower Data Analysis**, **Map View**, **Air Force Report Form**, **Export Reported Data**, **ForeFlight Content Pack Update**.
- **Coordinator Console** is under **Mission Planning** in the sidebar (`/coordinator/survey`). Load the published MTR there; after staffing, email each sortie `.fpl` to that aircraft’s Mission Pilot.
- For **Chapter 3**, have a **printed** copy of [`docs/handouts/Coordinator-Survey-Console-Handout.pdf`](./handouts/Coordinator-Survey-Console-Handout.pdf) on desk (or open the PDF on a second monitor) to show wing crews the same symbology and staffing models off-screen.
- Optional on-screen subtitle in corner: “HighTowers — Air Force Route Survey workflow”.

**How to use this document**

- **NARRATION** — read as voiceover (edit wording to your Wing’s SOP).
- **ON-SCREEN** — what the viewer should see; align your cursor and pauses here.
- **PAUSE** — hold 2–3 seconds for editors or live narration breathing room.

**Suggested total runtime** — 26–38 minutes main program (includes coordinator chapter); +3–5 minutes for appendix (admin).  
**Optional split** — record **Chapter 3** as a standalone *Wing coordinator* clip if the primary audience is aircrew only.

**Demo routes (suggested)**

| Topic | Route / example |
|--------|------------------|
| Corridor width + custom offsets | **VR114** or **IR107** |
| Staged refuel (distant home → shared recovery) | **IR107** with KABQ / second base + recovery field (e.g. KCAO or KTCC) |
| Coordinator survey (airports in console only) | Sidebar **Coordinator Console** → load full route (e.g. VR114 A–Q) |
| Waypoint sequence + blend-in + pending Hotel coords | **SR213** (KABQ → KAEG); first list `A–H`, then correct with `G, SR214H, G` at the start; **SR213H** often needs manual coordinates |
| Tower not on map + height fields | Any mission; **SR213** or similar if available |

---

## Chapter 0 — Introduction (optional, 30–45 s)

**ON-SCREEN** — Workflow Guide; slow pan down the numbered steps.

**NARRATION**  
“This application walks a Civil Air Patrol crew through an Air Force route survey: flight planning that converts a ForeFlight flight plan to a format the G1000 can use, starting the Air Force report form so that any new towers discovered can be added to the form automatically, measuring them in Tower Data Analysis so coordinates and heights can be added, providing a Map View for the pilot to check against the ForeFlight map, and to zoom to points for map tower marker checks after analysis is complete, to  exporting the customer report in PDF form for emailing, and refreshing ForeFlight content packs for the next season, to include any new tower discovery coordinates. There is an extra survey planning section for coordinators who will need to make team assignments to cover routes with wide corridors; these may need additional passes.”

**PAUSE**

---

## Chapter 1 — Orientation and sidebar (1–2 min)

**ON-SCREEN** — Left sidebar fully expanded; point at **Getting Started** → **Workflow Guide**.

**NARRATION**  
“With the Workflow Guide, every function can be branched to in the left sidebar. **Workflow Guide** is your checklist. Under **Mission Planning** you’ll use **Flight Plans** — and from there, pilots will create the flight plan for the sortie. If sortie teams are required, wing coordinators open **Coordinator Console** from the same sidebar section for sortie what-if planning; this may be needed if the training route has very wide cooridors. **Mission Execution** is **Tower Data Analysis** and **Map View**. Under **Reporting** you’ll use the **Air Force Report Form**, **Export Reported Data**, and when it’s time to update ForeFlight packs, **ForeFlight Content Pack Update**. Hints appear as numbered lightbulbs — optional help; you can reset them from individual pages if you want them back. But reading hints first are not a limitation if you already know how to use the tools in any section; you can just go forward and use the functionality”

**ON-SCREEN** — Sidebar **Mission Planning**: point at **Flight Plans**, then **Coordinator Console**.

**NARRATION**  
“Coordinators load the published MTR in the console, assign aircraft and Mission Pilots when they are available, then email each sortie **.fpl** to that aircraft’s Mission Pilot.”

**NARRATION**  
“You can collapse the sidebar for more section space; expand it when you need to move between sections.”

**ON-SCREEN** — Briefly collapse and expand sidebar using the arrow control.

**PAUSE**

---

## Chapter 2 — Flight planning and G1000 export (5–8 min)

Demo route: **SR213** with **Waypoint sequence** (the most detailed of the three load methods). Use **KABQ** departure and **KAEG** destination. **SR213 Hotel** is usually missing from the public waypoint source, so the detail page will ask for coordinates.

**ON-SCREEN** — **Flight Plans** → **New Flight Plan**. Work top to bottom on this form. Do not skip fields.

**NARRATION**  
“We start with a flight plan that matches what you will fly in ForeFlight and program in the G1000. This chapter uses Waypoint sequence, the most detailed of the three load methods, on route Sierra Romeo 213. Work from the top of this page to the bottom.”

**ON-SCREEN** — Name: `SR213 Training Demo`.

**NARRATION**  
“Name the plan the way you name it in ForeFlight, so the saved plan and the exported file stay easy to recognize.”

**ON-SCREEN** — Departure `KABQ` → Fetch (Albuquerque). Destination `KAEG` → Fetch (Double Eagle).

**NARRATION**  
“Enter departure and destination as ICAO or FAA location identifiers, then Fetch each field until the airport name appears in green. The G1000 file uses these airports in the header.”

**ON-SCREEN** — Select **Waypoint sequence**. Route identifier: `SR213`. Waypoint sequence (intentional miss at the start): `A, B, C, D, E, F, G, H`. Fetch.

**NARRATION**  
“Choose Waypoint sequence. Put the route identifier once, then list the suffixes from your ForeFlight expanded plan. Fetch confirms which points the database already knows. For this demo we enter only the Sierra Romeo 213 suffixes, and leave off the blend-in at the start. Sierra Romeo 213 Hotel is often missing from the public source, so you will add those coordinates on the next page.”

**ON-SCREEN** — Scroll to **Create Flight Plan** and click it.

**NARRATION**  
“You must press Create Flight Plan to save before you leave this page. Otherwise you will have to start again.”

**ON-SCREEN** — Flight plan detail: ForeFlight vs G1000 columns. The list starts at Alpha; Hotel is pending. Point out that ForeFlight actually begins with Golf, SR214H, Golf.

**NARRATION**  
“The next page lists ForeFlight-style names beside G1000 names so you can cross-check the chart and the navigator. If the ForeFlight plan starts with Golf, Sierra Romeo 214 Hotel, Golf, those points are missing here. Do not delete the plan and start over. Use Correct waypoint sequence.”

**ON-SCREEN** — Click **Correct waypoint sequence**. Form returns with the saved entries. Change the sequence to `G, SR214H, G, A, B, C, D, E, F, G, H`. Fetch. Click **Update Flight Plan**.

**NARRATION**  
“The form comes back with your entries. Add Golf, Sierra Romeo 214 Hotel, and Golf at the beginning of the sequence, then press Update Flight Plan. You return to this same plan to finish.”

**ON-SCREEN** — Detail again: blend-in points converted; H still pending with degree and minute fields. Do not open ForeFlight on camera; fill example coordinates from the AP/1B or ForeFlight popup and click **Supply Coordinates**. Example: 34 degrees 49.30 minutes North, 106 degrees 58.60 minutes West.

**NARRATION**  
“Hotel still needs coordinates. In ForeFlight, tap that waypoint in your flight plan and copy latitude and longitude from the popup, in degrees and minutes. You can also take them from the AP/1B. Enter them here, then press Supply Coordinates.”

**ON-SCREEN** — Sidebar **Map View**. Select **SR213 Training Demo** if it is not already selected. Hold on the route line. Point at **Return to Flight Plan** without using it for a second correction.

**NARRATION**  
“Before you export, open Map View and compare this graphical flight plan with your ForeFlight map. If the two pictures match, you have a visual confirmation that the waypoint list is right. If you see a mistake, press Return to Flight Plan and use Correct waypoint sequence on that page, otherwise press Return to Flight Plan in order to load the SD card.”

**ON-SCREEN** — Click **Return to Flight Plan**. Scroll to **Full flight plan** → **Export full route (.fpl)** → Export. Show the download if the browser shows it.

**NARRATION**  
“Export full route downloads the complete FPL, every waypoint in the plan. Copy that file to the root of a FAT32 SD card, then eject the card before you remove it from the reader, so the file is not corrupted. Insert the card in the top slot of the MFD before you power up the MFD. Otherwise the panel may say there is no flight plan to import.”

**PAUSE**

---

## Chapter 6 — Air Force Report Form (3–5 min)

**ON-SCREEN** — Sidebar → **Air Force Report Form**.

**NARRATION**  
“This form is the living record for the Air Force customer: mission identification, tower observations, bearings and distances, and anything that belongs in **Additional Notes** at the bottom. Data you add here flows into the export PDF later.”

**ON-SCREEN** — Create or select a **mission** tied to the flight plan if the UI requires it; fill one tower row or show a row populated from Tower Analysis.

**NARRATION**  
“Tie the report to the mission and flight plan you already built so tower entries stay consistent with the route. When a tower was **not found on the map** but you measured height from a nearby photo position, **Height AGL** and **Height MSL** show the estimated values with **See Notes** — for example `176 ft. - See Notes` and `5561 ft. - See Notes` — so the customer sees approximate heights without crowding the **Notes** field. **Notes** carry the explanation and true bearing and distance from the route waypoint.”

**ON-SCREEN** — Scroll to **Additional Notes**; mention optional lightbulb for first-time users.

**NARRATION**  
“Additional Notes are repeated on the last appendix page of the exported survey PDF — useful for content-pack audit lines and other mission commentary.”

**PAUSE**

---

## Chapter 7 — Tower Data Analysis (5–8 min)

**ON-SCREEN** — Sidebar → **Tower Data Analysis**.

**NARRATION**  
“Here each tower gets a photo, a map position, and a height workflow. This is where you spend most of your airborne or post-flight time per structure.”

**ON-SCREEN** — Select or add a tower observation; show **Look for Tower on Map** and placing the marker. If demoing estimated placement, check **Tower not found on map** (or equivalent) before **Record Location**.

**NARRATION**  
“Use **Look for Tower on Map** to drop the tower on the satellite image so latitude and longitude match what you measured. If the structure isn’t visible on the imagery, check **Tower not found on map** before you record — you can still place a best-effort position nearby and run the height sliders.”

**ON-SCREEN** — Align red/blue height sliders; show AGL and terrain MSL in the analysis panel; **Save Tower**.

**NARRATION**  
“Align the red line to the top and the blue line to the base. Complete the height measurement and save. On the **Air Force Report Form**, AGL and MSL appear as estimated feet followed by **See Notes** when the tower wasn’t on the map; **Notes** get the standard prefix plus bearing and distance from the route — not a repeat of the height numbers, so the Notes field doesn’t truncate on the PDF.”

**ON-SCREEN** — Optional: show **Reset hints** if you mention refresher training.

**NARRATION**  
“If you dismissed the lightbulb tips and want them back, use **Reset hints** on this page or on the Report Form / New Flight Plan pages.”

**PAUSE**

---

## Chapter 8 — Export and customer deliverable (2–4 min)

**ON-SCREEN** — Sidebar → **Export Reported Data**.

**NARRATION**  
“When the mission is complete and tower rows are filled in, **Export Reported Data** builds the Air Force Route Survey PDF for the customer.”

**ON-SCREEN** — Select mission; generate PDF; open preview or downloaded file briefly (first page + appendix mention).

**NARRATION**  
“Confirm the mission name, tower table, and appendix material — including the map and any Additional Notes — before you send the package to the customer.”

**PAUSE**

---

## Chapter 9 — ForeFlight content pack **close-out** (next season’s data) (4–6 min)

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

## Chapter 10 — Wrap-up and recurring operations (1–2 min)

**ON-SCREEN** — Return to **Workflow Guide**; highlight crew steps; optionally flash **Coordinator Console** in the sidebar.

**NARRATION**  
“For aircrew: plan and export the G1000 file — full route or sortie fragment when needed — prep ForeFlight from the server pack, execute towers in **Tower Data Analysis** with **Map View** support, finish the **Air Force Report Form**, export the PDF, then apply towers to the content pack so the next crew inherits your work.”

**NARRATION**  
“For wing coordinators: open **Coordinator Console** from the sidebar, load the published route, set corridor tracks in **Scenario**, compare one, two, or three teams with optional **staged refuel**, export sortie **.fpl** files, and **email each file to that aircraft’s Mission Pilot** before the sortie.”

**NARRATION**  
“Questions go to your Wing’s training officer or whoever owns the ForeFlight API key and admin PIN.”

**PAUSE** — fade or end card.

---

## Appendix A — Coordinator Survey Console (1–3 teams) (7–10 min)

**Audience note** — Wing coordinators, ops staff, and pilots who want to see how sortie assignments are derived. Can be a separate video.

**ON-SCREEN** — Hold up or fan open the printed **Coordinator Survey Console** handout (`docs/handouts/Coordinator-Survey-Console-Handout.pdf`); show cover/title briefly, then switch to the app.

**NARRATION**  
“Your Wing should have this one-page handout in the ops room and in each survey aircraft kit. It mirrors what you’ll see on screen — inner and outer passes, one- versus two- versus three-team staffing, and how to read a sortie row — so coordinators and crews stay aligned when you’re not both looking at the same laptop.”

**ON-SCREEN** — Sidebar **Mission Planning** → **Coordinator Console**. Empty console shows **Load the published route**. Fetch VR114 A–Q (or your demo), **Load route into console**. URL shows `/coordinator/survey?plan=…`.

**NARRATION**  
“The **Coordinator Survey Console** is a wing planning aid — not a replacement for ForeFlight corridor display or ATP routing. Given your flight plan’s waypoint chain, NASR corridor width, team departure airports, and a per-sortie distance budget, it estimates how many sorties each team needs and which waypoint ranges to assign.”

**ON-SCREEN** — Expand **Coordinator quick reference & symbology**; open the lightbulb tip if unseen.

**NARRATION**  
“The in-app quick reference and the printed handout use the same symbology — inner versus outer passes, G1000 parallel-track spacing, and what the sortie budget means for a four-and-a-half to five-hour sortie with reserve. Default wing spacing is three, nine, fifteen, twenty-one nautical miles for a twenty-NM half-width, but your Wing may fly fewer tracks — you set that in **Scenario**, not hard-coded in the planner. Keep the PDF on the Wing share or regenerate it with `npm run handout:coordinator-pdf` when the console changes.”

**ON-SCREEN** — **Scenario** card: flight plan name, route ID, waypoint list; scroll to **Corridor & parallel tracks**.

**NARRATION**  
“The scenario uses the route you loaded. NASR **CORRIDORS ARE** width lines appear here — one block per width span. Edit **Inner** and **Outer NM** if the cycle wording is wrong, then set **Inner offsets** and **Outer offsets** as comma-separated nautical miles — inner is left of centerline, outer is right. Use **Reset offsets to wing default** on a span to restore three-six-one spacing from the NM values. The **Leg preview** table updates before you run the planner so you can see what each leg will use.”

**ON-SCREEN** — Open lightbulb tip **Corridor width and parallel tracks** (Scenario); briefly change one offset list and show leg preview refresh.

**NARRATION**  
“All compare modes and single scenarios share this one track plan — change offsets here and re-run to see sortie impact. The lightbulb tip explains inner versus outer columns and when to reduce track count for a real-world wing plan.”

**ON-SCREEN** — **Teams & parameters** → lightbulb **Staffing and run planner**; **Planner mode**.

**NARRATION**  
“Three planner modes: **Single scenario** for one staffing model at a time; **Compare 1 vs 2 teams** for one aircraft doing both sides sequentially versus two aircraft on opposite sides; **Compare 2 vs 3 teams** for opposite-side parallel staffing versus a geographic split across three bases.”

**ON-SCREEN** — Select **Single scenario** → **Aircraft count** → click **1 team**, then **2 teams**, then **3 teams** (briefly show each radio option).

**NARRATION**  
“Under single scenario, pick **one team** for both corridor sides flown sequentially from one departure; **two teams** for inner and outer in parallel from two airports; or **three teams** for a geographic split — each team owns a route segment and flies both sides from its own base. Three-team mode needs at least four waypoints on the plan.”

**ON-SCREEN** — Select **Compare 1 vs 2 teams**; show Team 1 departure from the flight plan **or** Team 1 lookup when the plan is a **Coordinator survey anchor** (waypoints only). **Look up** Team 2 airport (e.g. a second base near the route).

**NARRATION**  
“Comparison modes run two full what-if scenarios with the same sortie budget and the same corridor track plan from **Scenario**. Look up departure airports for Teams 1–3 before you run — same FAA identifier lookup as elsewhere in the app. Anchor plans have no departure on the flight plan record; the coordinator looks up every team base in the console.”

**ON-SCREEN** — **Ferry / recovery model** → select **Staged refuel (finish survey before weather)**; **Look up** shared refueling airport (e.g. near the MTR). Show **Return-to-home fuel** guidance box and en-route recovery lightbulb tip.

**NARRATION**  
“For long ferries — typical on routes like **IR107** from Albuquerque — choose **Staged refuel**. Pick one **shared refuel airport** for all aircraft. Sortie one ends at that field after survey work; the **final sortie** returns home. When the last survey leg plus return fits your NM budget, the planner merges them into one sortie so crews are home sooner for weather recovery. Return-home-only rows show **Return home** in the table — pilots plan fuel; no survey **.fpl** for those legs. Multi-aircraft: stagger takeoffs and deconflict on the radio.”

**ON-SCREEN** — **Sortie distance budget (NM)** — show 400–500.

**NARRATION**  
“Set the sortie budget your Wing uses — typically four hundred to five hundred nautical miles. Corridor width and offsets come from **Scenario** above, not from fixed VR114 defaults.”

**ON-SCREEN** — Click **Compare 1 vs 2 teams** (or **Run planner** for single mode). Wait for **Results**.

**NARRATION**  
“Results show centerline length, the applied leg track plan, total wing sorties, and NM breakdown per sortie — ferry in, along the route, ferry out. Staged refuel shows the recovery airport in the results header.”

**ON-SCREEN** — **Staffing comparison** table (1 vs 2) or **Geographic assignment** table (3 teams); scroll sortie rows.

**NARRATION**  
“In compare mode, read the summary row first — wing sorties, wing NM, and any over-budget warning. Then drill into each team’s sortie table: waypoint range, which side, start direction, and offsets. Geographic split shows boundary waypoints and segment ownership per team.”

**ON-SCREEN** — Click **Export .fpl** on one sortie row; show **Sortie pilot brief** modal (offsets, Heading-mode SOP); dismiss or complete download.

**NARRATION**  
“Each sortie row can export a G1000 **.fpl** with the serpentine route for that assignment. Email that file to the Mission Pilot of the aircraft flying the sortie — or copy it to an SD card. The pilot brief lists parallel-track offsets and heading-mode reminders — offsets are set on the G1000, not in the file. Copy to the SD card root, eject before removing the card, then import on the panel. Rename to your Wing’s dep-to-dep filename if the G1000 catalog expects it.”

**ON-SCREEN** — Red **Wing planning aid only** disclaimer at bottom of results; cut back to printed handout, point at crew-communication section if present.

**NARRATION**  
“Treat every number as a planning aid — crews still fly corridors in ForeFlight Military Flight Bag and follow Wing SOP for MOA, scheduling, and safety. After you run a scenario, use the printed handout to brief each crew: team, segment, sortie number, offsets, and side — the same fields in the sortie table and pilot brief modal.”

**PAUSE**

---

## Appendix B — Wing Administrator (optional separate video, 3–5 min)

**Audience** — Few designated members; not the whole aircrew.

**ON-SCREEN** — Navigate directly to `/admin/content-packs` (bookmark); sign in with **Wing PIN**; show **Inventory** with **CSV member (in ZIP)** column.

**NARRATION**  
“This URL is not in the sidebar. Administrators sign in with the Wing PIN, use the same **Content Pack API key** as the rest of the app, and manage **Inventory**: publish ZIPs, create an **empty pack** for a brand-new MTR, or **delete** a duplicate or bad upload. The **CSV member** path matches what crews see under **ForeFlight Content Pack Update** → Settings — use it to tell two packs apart when the display name is the same.”

**ON-SCREEN** — Briefly show **Publish from existing ZIP** and **Create empty pack** forms without real secrets.

**NARRATION**  
“Before publishing, rename the **outer folder inside the ZIP** to something short and stable — for example `IR112_content_pack` — so future inventory stays readable.”

**PAUSE** — end.

---

## Appendix C — Content pack for mission prep (ForeFlight) (3–5 min)

**ON-SCREEN** — **Coordinator Survey Console** for the same route; scroll to **ForeFlight content pack**.

**NARRATION**  
“Before the flight, crews pull the latest route content pack from the Wing server as a ForeFlight **content pack**. The app matches your flight plan’s route number to the right pack when one exists. Aircrews can expect at this point that these contain all towers discovered in previous years. If the aircrew finds any new towers, this content pack will be updated, and there is direction later in this sequence that results in storage of the file for next year's survey.”

**ON-SCREEN** — If the card shows “No pack on server,” narrate that the Wing must publish one; otherwise show **Download for ForeFlight (.zip)**.

**NARRATION**  
“If a pack matches your route, click **Download for ForeFlight**. You need the Wing **Content Pack API key** in this browser once — same as elsewhere in the app — usually saved under **ForeFlight Content Pack Update** → Settings → Server connection.”

**ON-SCREEN** — Click download; show success toast or confirmation if present.

**NARRATION**  
“Import the ZIP in ForeFlight on your iPad or iPhone the way your Wing briefs — typically Files → share sheet → Open in ForeFlight. After import, tower waypoints appear on the map for that route.”

**PAUSE**

---

## Post-production checklist

- [ ] Bleep or omit real API keys, PINs, customer names, and precise tower coordinates if the video is public.
- [ ] Add chapter markers in YouTube/Vimeo matching headings above.
- [ ] Attach Wing SOP PDF or QR code to end screen if your policy allows.
- [ ] Re-record Chapter 2 if New Flight Plan load methods or G1000 export UI change.
- [ ] Re-record Chapter 3 if Scenario corridor tracks, staged refuel, planner modes, sortie export, or width API change; re-record Chapter 4 if `CONTENT_PACK_API_KEY` UI changes; re-record Chapters 6–7 if report tower height / “See Notes” formatting changes; re-record Appendix A if admin flows change.
- [ ] Show or mention the printed **Coordinator Survey Console** handout in Chapter 3; link `docs/handouts/Coordinator-Survey-Console-Handout.pdf` in the video description for coordinators.

---

## Revision history

| Date | Author | Notes |
|------|--------|--------|
| 2026-05-14 | Project doc | Initial script aligned to `WorkflowGuidePage` and `MainLayout` nav. |
| 2026-06-13 | Project doc | Added Chapter 3 Coordinator Survey Console (1–3 teams, compare modes, sortie `.fpl` export, printed handout); updated flight plan export (full route vs sortie fragment); renumbered chapters. |
| 2026-08-31 | Project doc | Chapter 2 rewritten for SR213 Waypoint sequence (top-to-bottom form, correct-sequence return, Hotel coords from ForeFlight, SD card). |
