# HighTowers-Web — Training video script

Audience: **CAP aircrew** conducting an Air Force route survey (MTR tower documentation), using this web app plus ForeFlight and the aircraft G1000.  
Secondary audience: **Wing survey coordinators** staffing one to three aircraft and comparing sortie plans before the season.  
Audience (appendix): **Wing administrator** for content-pack lifecycle only.

**Recording assumptions**

- Host: `http://localhost:5173` for local training, or your deployed Wing URL for production-style video.
- For **Coordinator Survey Console** width data locally, run **`npm run dev:all`** (Vite + Node API on port 3001). Deployed Wings use the same API on Railway.
- Use a **demo mission** and route (e.g. **VR114** or IR112) with non-sensitive coordinates if the video will be shared outside the Wing.
- Sidebar labels match the app: **Workflow Guide**, **Flight Plans**, **Coordinator Console**, **Tower Data Analysis**, **Map View**, **Air Force Report Form**, **Export Reported Data**. There is no sidebar item named ForeFlight Content Pack Update.
- **Coordinator Console** is under **Mission Planning** in the sidebar (`/coordinator/survey`). Load the published MTR there; after staffing, email each sortie `.fpl` to that aircraft’s Mission Pilot.
- **Content-pack prep** is the **ForeFlight content pack** card on Coordinator Console (issue the baseline ZIP from the Wing folder). **Content-pack close-out** is on **Export Reported Data** (upload the pack you flew with, preview, download an updated ZIP).
- For **Appendix A**, have a **printed** copy of [`docs/handouts/Coordinator-Survey-Console-Handout.pdf`](./handouts/Coordinator-Survey-Console-Handout.pdf) on desk (or open the PDF on a second monitor) to show wing crews the same symbology and staffing models off-screen.
- Optional on-screen subtitle in corner: “HighTowers — Air Force Route Survey workflow”.

**How to use this document**

- **TITLE CARD NARRATION** — ElevenLabs clip `00` on the navy chapter card (not the body VO). Spoken numbers for **0** must be spelled **zero**; Flash reads `Chapter 0.` as “Chapter O.” The on-screen card still shows the digit (`Chapter 0.`). Source of the spoken strings: `~/Movies/HighTowers/Aircrew-Training/playwright/generate-chapters-00-02.py` (`title_text`).
- **NARRATION** — read as voiceover (edit wording to your Wing’s SOP). Body beats live in `ch0N-beats.json`.
- **ON-SCREEN** — what the viewer should see; align your cursor and pauses here.
- **PAUSE** — hold 2–3 seconds for editors or live narration breathing room.

**Suggested total runtime** — 26–38 minutes main program (aircrew chapters); +7–10 minutes for Appendix A (coordinator); +3–5 minutes for Appendix B (admin).  
**Optional split** — record **Appendix A** as a standalone *Wing coordinator* clip if the primary audience is aircrew only. Main-program chapter numbers are **0–7** (aircrew), plus the appendices.

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

**TITLE CARD NARRATION**  
“Chapter zero. Introduction.”  
On-screen: **Chapter 0.** / Introduction

**ON-SCREEN** — Workflow Guide; slow pan down the numbered steps. Point at the coordinator sentence under the title if it is visible.

**NARRATION**  
“This application walks a Civil Air Patrol crew through an Air Force route survey: flight planning that converts a ForeFlight flight plan to a format the G1000 can use, starting with the Air Force report form so that any new towers discovered can be added to the form automatically, measuring them in Tower Data Analysis so coordinates and heights can be added, providing a Map View for the pilot to check against the ForeFlight map, and to zoom to points for map tower marker checks after analysis is complete, to exporting the customer report in PDF form for emailing, and refreshing ForeFlight content packs for the next season, to include any new tower discovery coordinates. There is an extra survey planning section for coordinators — **Coordinator Console** in the sidebar — for the member who will need to make team assignments to cover routes with wide corridors; these may need additional passes.”

**PAUSE**

---

## Chapter 1 — Orientation and sidebar (1–2 min)

**TITLE CARD NARRATION**  
“Chapter 1. Orientation and sidebar.”  
On-screen: **Chapter 1.** / Orientation and sidebar

**ON-SCREEN** — Left sidebar fully expanded; point at **Getting Started** → **Workflow Guide**.

**NARRATION**  
“With the Workflow Guide, every function can be branched to in the left sidebar. **Workflow Guide** is your checklist. Under **Mission Planning** you’ll use **Flight Plans** — and from there, pilots will create the flight plan for the sortie. If sortie teams are required, wing coordinators open **Coordinator Console** from the same sidebar section for sortie what-if planning; this may be needed if the training route has very wide cooridors. Coordinators load the published MTR in the console, assign aircraft and Mission Pilots when they are available, then email each sortie **.fpl** to that aircraft’s Mission Pilot. **Mission Execution** is **Tower Data Analysis** and **Map View**. **Map View** is where you compare the planned route with ForeFlight, and later confirm each saved tower marker sits on the structure. Under **Reporting** you’ll use the **Air Force Report Form** and **Export Reported Data**. Content-pack close-out after the flight lives on **Export Reported Data**, not a separate sidebar item.”

**ON-SCREEN** — Spotlight each sidebar item as it is named, once: **Workflow Guide**, **Flight Plans**, **Coordinator Console** (hold through the coordinator staffing line), **Tower Data Analysis**, **Map View**, **Air Force Report Form**, **Export Reported Data**. Use a light highlight so the label stays readable. Then spotlight **Clear All Data** at the bottom (do not click it). Do not return to Coordinator Console.

**NARRATION**  
“At the bottom of the sidebar, **Clear All Data** removes saved flight plans, towers, and missions from this browser. Use it only when you want a clean training or demo start. It cannot be undone.”

**NARRATION**  
“You can collapse the sidebar for more section space; expand it when you need to move between sections.”

**ON-SCREEN** — Briefly collapse and expand sidebar using the arrow control.

**PAUSE**

---

## Chapter 2 — Flight planning and G1000 export (5–8 min)

**TITLE CARD NARRATION**  
“Chapter 2. Flight planning and G1000 export.”  
On-screen: **Chapter 2.** / Flight planning and G1000 export

Demo route: **SR213** with **Waypoint sequence** (the more detailed of the two load methods). Use **KABQ** departure and **KAEG** destination. **SR213 Hotel** is usually missing from the public waypoint source, so the detail page will ask for coordinates.

**ON-SCREEN** — **Flight Plans** → **New Flight Plan**. Work top to bottom on this form. Do not skip fields. Numbered lightbulb tips **1–4** stay visible on this page (Name, airports, waypoint loading, Create).

**NARRATION**  
“We start with a flight plan that matches what you will fly in ForeFlight and program in the G1000. This chapter uses Waypoint sequence, the more detailed of the two load methods, on route Sierra Romeo 213. Work from the top of this page to the bottom.”

**ON-SCREEN** — Open the numbered lightbulb next to **Name** so the hint popover is visible.

**NARRATION**  
“Hints appear as numbered lightbulbs — optional help; you can reset them from individual pages if you want them back. But reading hints first is not a limitation if you already know how to use the tools in any section; you can just go forward and use the functionality without dismissing any help instructions first.”

**ON-SCREEN** — Dismiss the hint (Got it or Not now). Name: `SR213 Training Demo`.

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

**ON-SCREEN** — Flight plan detail: ForeFlight vs G1000 columns. Open numbered lightbulb **5** next to **Waypoints**. The list starts at Alpha; Hotel is pending. Point out that ForeFlight actually begins with Golf, SR214H, Golf.

**NARRATION**  
“The next page lists ForeFlight-style names beside G1000 names so you can cross-check the chart and the navigator. If the ForeFlight plan starts with Golf, Sierra Romeo 214 Hotel, Golf, those points are missing here. Do not delete the plan and start over. Use Correct waypoint sequence.”

**ON-SCREEN** — Click **Correct waypoint sequence**. Form returns with the saved entries. Change the sequence to `G, SR214H, G, A, B, C, D, E, F, G, H`. Fetch. Click **Update Flight Plan**.

**NARRATION**  
“The form comes back with your entries. Add Golf, Sierra Romeo 214 Hotel, and Golf at the beginning of the sequence, then press Update Flight Plan. You return to this same plan to finish.”

**ON-SCREEN** — Detail again: blend-in points converted; H still pending with degree and minute fields. Do not open ForeFlight on camera; fill example coordinates from the AP/1B or ForeFlight popup and click **Supply Coordinates**. Example: 34 degrees 49.30 minutes North, 106 degrees 58.60 minutes West.

**NARRATION**  
“Hotel still needs coordinates. In ForeFlight, tap that waypoint in your flight plan and copy latitude and longitude from the popup, in degrees and minutes. You can also take them from the AP/1B. Enter them here, then press Supply Coordinates.”

**ON-SCREEN** — Sidebar **Map View**. Select **SR213 Training Demo** if it is not already selected. Open numbered lightbulb **1** next to **Map View** (compare with ForeFlight). Hold on the route line. Dismiss the hint, then point at **Return to Flight Plan** without using it for a second correction.

**NARRATION**  
“Before you export, open Map View and compare this graphical flight plan with your ForeFlight map. If the two pictures match, you have a visual confirmation that the waypoint list is right. If you see a mistake, press Return to Flight Plan and use Correct waypoint sequence on that page, otherwise press Return to Flight Plan in order to load the SD card.”

**ON-SCREEN** — Click **Return to Flight Plan**. Open numbered lightbulb **6** next to **Export full route (.fpl)** (hint body is the SD-card paragraph only; do not include the Coordinator Console closer). Then **Export full route (.fpl)** → Export. Show the download if the browser shows it.

**NARRATION**  
“Export full route downloads the complete FPL, every waypoint in the plan. Copy that file to the root of a FAT32 SD card, then eject the card before you remove it from the reader, so the file is not corrupted. Insert the card in the top slot of the MFD before you power up the MFD. Otherwise the panel may say there is no flight plan to import. Sortie fragments and team assignment files are issued from **Coordinator Console**, not from this page.”

**PAUSE**

---

## Chapter 3 — Air Force Report Form (3–5 min)

**TITLE CARD NARRATION**  
“Chapter 3. Air Force Report Form.”  
On-screen: **Chapter 3.** / Air Force Report Form

**ON-SCREEN** — Sidebar → **Air Force Report Form**. Leave Date, Point of Contact, and Mission Information empty at first so **Save Mission Changes** is disabled. Numbered lightbulbs on this form match the same rules if you want a reminder.

**NARRATION**  
“This form is the living record for the Air Force customer: mission identification, tower observations, bearings and distances, and anything that belongs in **Additional Notes** at the bottom. Data you add here flows into the export PDF later. But it also frees the user from having to enter the report data manually; this form collects almost everything needed automatically as you move through the functions needed to complete the report.”

**ON-SCREEN** — Type **Date** `08/10/2026`. Point at **Save Mission Changes** — it stays disabled until the identifiers are in too.

**NARRATION**  
“Save Mission Changes stays unavailable until Date, Mission Number, and MTR Route are filled. Those three are the minimum.”

**ON-SCREEN** — Type **Point of Contact**: POC Name `Durfee`, CAP Unit `NM-030`, Phone `501-238-9521`, Email `gregory.durfee@nmcap.us`.

**NARRATION**  
“Fill Point of Contact as it should appear for the customer: name, CAP unit, phone, and email. Not required to save, but required before you generate the PDF.”

**ON-SCREEN** — Type **Mission Number** `26-1-4224` and **MTR Route** `SR213`. **Save Mission Changes** enables; click it.

**NARRATION**  
“Enter the Mission Number and MTR Route, then save. The button enables as soon as those identifiers and the date are in place.”

**ON-SCREEN** — Scroll to a tower row populated from Tower Data Analysis (coordinates and **See Notes** heights). Leave **Structure Type** and **Lighting** on Select until analysis is finished.

**NARRATION**  
“When a tower was **not found on the map** but you measured height from a nearby photo position, **Height AGL** and **Height MSL** show the estimated values with **See Notes** — for example `176 ft. - See the Notes for AGL` and `5561 ft. - See the Notes for MSL` — so the customer sees approximate heights without crowding the **Notes** field. **Notes** carry the explanation and true bearing and distance from the route waypoint.”

**ON-SCREEN** — Set Tower 1 **Structure Type** to **Cell / Microwave** and **Lighting** to **Strobes**.

**NARRATION**  
“After Tower Data Analysis is finished, don't forget come back and set Structure Type and Lighting, since this only applies to towers being reported. Coordinates and heights fill from analysis; type and lighting do not.”

**ON-SCREEN** — Scroll to **Additional Notes**.

**NARRATION**  
“Additional Notes are repeated on the last appendix page of the exported survey PDF — useful for content-pack audit lines and other mission commentary.”

**PAUSE**

---

## Chapter 4 — Tower Data Analysis (5–8 min)

**TITLE CARD NARRATION**  
“Chapter 4. Tower Data Analysis.”  
On-screen: **Chapter 4.** / Tower Data Analysis

**ON-SCREEN** — Sidebar → **Tower Data Analysis**.

**NARRATION**  
“Here each tower gets a photo, a map position, and a height workflow. This is where you spend most of your airborne or post-flight time per structure.”

**ON-SCREEN** — Select a tower photo; show **Look for Tower on Map** and placing the marker. If demoing estimated placement, check **Tower not visible on map** before **Record Location**.

**NARRATION**  
“Use **Look for Tower on Map** to drop the tower on the satellite image so latitude and longitude match what you measured. If the structure isn’t visible on the imagery, check **Tower not visible on map** before you record — you can still place a best-effort position nearby and run the height sliders.”

**ON-SCREEN** — After **Record Location**, animate red then blue onto the locked pose (tip / pad-and-shadow) and hold. Then play the height VO over that still; **Save Tower**.

**NARRATION**  
“Align the red line to the top and the blue line to the base. Complete the height measurement and save. On the **Air Force Report Form**, AGL and MSL appear as estimated feet followed by **See Notes** when the tower wasn’t on the map; **Notes** get the standard prefix plus bearing and distance from the route — not a repeat of the height numbers, so the Notes field doesn’t truncate on the PDF. Press the **Save Tower** button and note the acknowledgement when Tower Data Analysis clears for the next tower measurement.”


**PAUSE**

---

## Chapter 5 — Map check, then export for the customer (4–6 min)

**TITLE CARD NARRATION**  
“Chapter 5. Export and customer deliverable.”  
On-screen: **Chapter 5.** / Export and customer deliverable

Demo continues **SR213** / mission **26-1-4224**. The PDF must show the same tower work from Chapters 3 and 4 — not a blank form. One surveyed tower is enough for this chapter.

**ON-SCREEN** — Sidebar → **Map View**. Flight plan **SR213 Training Demo**. Mission **26-1-4224** so surveyed towers draw. Hold the full-route fit: red leader from the nearest waypoint to the tower.

**NARRATION**  
“After analysis, come back to **Map View** before you email anything. With the flight plan and this mission selected, each reported tower draws as a marker on a line from the nearest route waypoint. That is your check that the point you saved actually sits on the structure.”

**ON-SCREEN** — Picture-first: zoom in on the one SR213 tower marker until the arrowhead locks on the base; hold that pose, then VO.

**NARRATION**  
“Zoom in on the marker. The line stays tied to the waypoint, the arrowhead locks onto the tower base, and the label slides back so you can see the tip pointing at the structure. If this were a multi-tower sortie you would repeat that for each one. When the picture is right, you are ready to build the customer PDF.”

**ON-SCREEN** — Sidebar → **Export Reported Data**. Select mission `26-1-4224` if it is not already selected. Hover **ForeFlight content pack (optional)** — next chapter. Do not check **No content pack update**.

**NARRATION**  
“**Export Reported Data** builds the Air Force Route Survey PDF from the mission you just checked. The same page has optional ForeFlight content-pack close-out; we cover that in the next chapter. Select the mission, then generate the PDF.”

**ON-SCREEN** — Picture-first: **Generate & Download PDF**. Do not linger on an empty form. Land on **page 1 filled** from Chapters 3–4: mission `26-1-4224`, route **SR213**, POC **Durfee** / **NM-030**, Tower 1 coordinates `N34°28.88′` / `W104°51.72′`, heights `182 ft` and `5561 ft`, **Cell / Microwave**, **Strobes**. This tower was found on the map in Chapter 4, so the row must not say **Tower not found on Map** or **See Notes**. Hold, then VO.

**NARRATION**  
“Confirm page one before you send it. Mission number, MTR Route, point of contact, and the tower table should match what you entered on the Air Force Report Form and measured in Tower Data Analysis — coordinates, estimated heights, structure type, and lighting.”

**ON-SCREEN** — Flip to the **tower photo** appendix page. The CAP-yellow overlay shows latitude, longitude, Height AGL, and Height MSL. Hold, then VO.

**NARRATION**  
“The next page is the tower photograph. The overlay repeats the coordinates and the AGL and MSL heights so the customer can see the structure you measured without hunting through the form.”

**ON-SCREEN** — Flip to the **mission map** appendix: the full **SR213** route and a marker for the one reported tower. Additional Notes from the form appear on this last page. Hold, then VO.

**NARRATION**  
“The last appendix is a flat map of the whole route with a marker for each reported tower — here, the one SR213 structure. **Additional Notes** from the report form print again on this page. The whole package is limited to 5 megabytes, large enough for detailed images, small enough to email. So, with your report review complete, you're ready to download the report, and email to the Air Force customer.”

**PAUSE**

---

## Chapter 6 — ForeFlight content pack **close-out** (next season’s data) (4–6 min)

**TITLE CARD NARRATION**  
“Chapter 6. ForeFlight content pack close-out.”  
On-screen: **Chapter 6.** / ForeFlight content pack close-out

**ON-SCREEN** — Stay on **Export Reported Data**. Select a **mission** that has tower work. Scroll to **ForeFlight content pack (optional)**.

**NARRATION**  
“It's not unusual for our ForeFlight Content Packs to show multiple markers for a single previosuly reported tower. Since HighTowers-Web provides a more accurate location than a location using a sectional map, the report should reflect these revised coordinates. After the flight, our Airforce Customer will use these reported locations to replace what's been previously reported on past surveys. If this mission added towers or improved coordinates versus the pack you imported in ForeFlight, stay on **Export Reported Data**. There is no separate sidebar item for packs.”

**ON-SCREEN** — Leave **No content pack update** unchecked. Upload the ForeFlight content-pack ZIP the crew flew with. Click **Preview** (or the equivalent preview control).

**NARRATION**  
“Upload the ZIP you actually flew with. Preview shows how many rows would refine, append, or stay unchanged after four-decimal rounding. Work stays in this browser — the ZIP is not uploaded to a server. Read any status line that updates **Additional Notes** on the Air Force Report Form so the audit trail stays in sync.”

**ON-SCREEN** — Download the updated ZIP. Stay on **Export Reported Data**. Do not open the Wing Administrator console.

**NARRATION**  
“Download the updated ZIP and email it to your Wing maintainer for next season’s folder. If this mission did not add or move towers, check **No content pack update** and you only need the PDF.”

**PAUSE**

---

## Chapter 7 — Wrap-up and recurring operations (1–2 min)

**TITLE CARD NARRATION**  
“Chapter 7. Wrap-up and recurring operations.”  
On-screen: **Chapter 7.** / Wrap-up and recurring operations  
*(Not yet in `generate-chapters-00-02.py`; chapters 0–6 are the current TTS set.)*

**ON-SCREEN** — Return to **Workflow Guide**; highlight crew steps; optionally flash **Coordinator Console** in the sidebar.

**NARRATION**  
“For aircrew: plan and export the full-route G1000 file from **Flight Plans**, confirm the route on **Map View**, execute towers in **Tower Data Analysis**, finish the **Air Force Report Form**, then use **Export Reported Data** for the customer PDF and, when needed, an updated content-pack ZIP.”

**NARRATION**  
“For wing coordinators: open **Coordinator Console** from the sidebar, load the published route, set corridor tracks in **Scenario**, compare one, two, or three teams with optional **staged refuel**, export sortie **.fpl** files, and **email each file to that aircraft’s Mission Pilot** before the sortie. Before the season, issue the baseline ForeFlight pack from the Wing folder — the console card reminds you; after the survey, close out the pack on **Export Reported Data**.”

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
“The **Coordinator Survey Console** is a wing planning aid — not a replacement for ForeFlight corridor display or ATP routing. Load the published MTR here. Given that waypoint chain, NASR corridor width, team departure airports, and a per-sortie distance budget, it estimates how many sorties each team needs and which waypoint ranges to assign.”

**ON-SCREEN** — Expand **Coordinator quick reference & symbology**; point at **What this console does** and **Issue files to crews**; open the lightbulb tip if unseen.

**NARRATION**  
“The in-app quick reference and the printed handout use the same symbology — inner versus outer passes, G1000 parallel-track spacing, and what the sortie budget means for a four-and-a-half to five-hour sortie with reserve. **Issue files to crews** is the last step: export each sortie **.fpl** and email it to that aircraft’s Mission Pilot. Default wing spacing is three, nine, fifteen, twenty-one nautical miles for a twenty-NM half-width, but your Wing may fly fewer tracks — you set that in **Scenario**, not hard-coded in the planner. Keep the PDF on the Wing share or regenerate it with `npm run handout:coordinator-pdf` when the console changes.”

**ON-SCREEN** — After the route is loaded, show the two-column layout: **Scenario** on the left; on the right, **ForeFlight content pack**, **Teams & parameters**, and **Export sortie fragment**. Then scroll **Scenario** to **Corridor & parallel tracks**.

**NARRATION**  
“The scenario uses the route you loaded. Console-loaded routes are waypoints only — you look up team airports in **Teams**, not on a Flight Plan form. NASR **CORRIDORS ARE** width lines appear here — one block per width span. Edit **Inner** and **Outer NM** if the cycle wording is wrong, then set **Inner offsets** and **Outer offsets** as comma-separated nautical miles — inner is left of centerline, outer is right. Use **Reset offsets to wing default** on a span to restore three-six-one spacing from the NM values. The **Leg preview** table updates before you run the planner so you can see what each leg will use.”

**ON-SCREEN** — Open lightbulb tip **Corridor width and parallel tracks** (Scenario); briefly change one offset list and show leg preview refresh.

**NARRATION**  
“All compare modes and single scenarios share this one track plan — change offsets here and re-run to see sortie impact. The lightbulb tip explains inner versus outer columns and when to reduce track count for a real-world wing plan.”

**ON-SCREEN** — Right column: glance at **ForeFlight content pack** (route number; issue from the Wing folder; close-out later on Export). Then **Teams & parameters** → lightbulb **Staffing and run planner**; **Planner mode**.

**NARRATION**  
“The content-pack card is a reminder, not a download. Issue the baseline pack from the Wing folder when crews build ForeFlight plans. After the survey, update the pack on **Export Reported Data**. Three planner modes: **Single scenario** for one staffing model at a time; **Compare 1 vs 2 teams** for one aircraft doing both sides sequentially versus two aircraft on opposite sides; **Compare 2 vs 3 teams** for opposite-side parallel staffing versus a geographic split across three bases.”

**ON-SCREEN** — Select **Single scenario** → **Aircraft count** → click **1 team**, then **2 teams**, then **3 teams** (briefly show each radio option). Confirm Team **Look up** stays inside the Teams card.

**NARRATION**  
“Under single scenario, pick **one team** for both corridor sides flown sequentially from one departure; **two teams** for inner and outer in parallel from two airports; or **three teams** for a geographic split — each team owns a route segment and flies both sides from its own base. Three-team mode needs at least four waypoints on the plan.”

**ON-SCREEN** — Select **Compare 1 vs 2 teams**. **Look up** Team 1 and Team 2 airports (e.g. KABQ and a second base near the route).

**NARRATION**  
“Comparison modes run two full what-if scenarios with the same sortie budget and the same corridor track plan from **Scenario**. Look up departure airports for Teams 1–3 before you run — same FAA identifier lookup as elsewhere in the app. A console-loaded route has no departure on the flight plan record; the coordinator looks up every team base here.”

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
“This URL is not in the sidebar. Administrators sign in with the Wing PIN, use the same **Content Pack API key** as the rest of the app, and manage **Inventory**: publish ZIPs, create an **empty pack** for a brand-new MTR, or **delete** a duplicate or bad upload. The **CSV member** path is the file inside the ZIP — match it to the pack you upload on **Export Reported Data** when two packs share a display name.”

**ON-SCREEN** — Briefly show **Publish from existing ZIP** and **Create empty pack** forms without real secrets.

**NARRATION**  
“Before publishing, rename the **outer folder inside the ZIP** to something short and stable — for example `IR112_content_pack` — so future inventory stays readable.”

**PAUSE** — end.

---

## Appendix C — Content pack for mission prep (ForeFlight) (3–5 min)

**ON-SCREEN** — Sidebar **Coordinator Console** for a loaded route; scroll the right column to **ForeFlight content pack**.

**NARRATION**  
“Before the flight, crews import the latest route content pack in ForeFlight from the Wing **Content Packs for Flight Planning** folder. This card shows the route number and reminds the coordinator to issue that baseline pack. It is not a download button. Aircrews can expect that pack to include towers discovered in previous years. If this season finds new towers or refined coordinates, **Export Reported Data** — Chapter 6 — is where you upload the flown ZIP and download an updated file for next year’s folder.”

**ON-SCREEN** — Point at the card text and the link to **Export Reported Data**. Optional: cut to the Wing folder or a previously downloaded ZIP; do not click a download that is not on this card.

**NARRATION**  
“Import the ZIP in ForeFlight on your iPad or iPhone the way your Wing briefs — typically Files → share sheet → Open in ForeFlight. After import, tower waypoints appear on the map for that route.”

**PAUSE**

---

## Post-production checklist

- [ ] Bleep or omit real API keys, PINs, customer names, and precise tower coordinates if the video is public.
- [ ] Add chapter markers in YouTube/Vimeo matching headings above.
- [ ] Attach Wing SOP PDF or QR code to end screen if your policy allows.
- [ ] Re-record Chapter 2 if New Flight Plan load methods or full-route-only G1000 export UI change.
- [ ] Re-record **Appendix A** if console route load, Scenario corridor tracks, staged refuel, planner modes, sortie export, or email-to-pilot guidance change.
- [ ] Re-record **Chapter 6** if Export Reported Data pack upload / preview / download UI changes.
- [ ] Re-record Chapters 3–4 if report tower height / “See Notes” formatting changes.
- [ ] Re-record Appendix B if admin inventory flows change; re-record Appendix C if the console pack card changes.
- [ ] Show or mention the printed **Coordinator Survey Console** handout in **Appendix A**; link `docs/handouts/Coordinator-Survey-Console-Handout.pdf` in the video description for coordinators.

---

## Revision history

| Date | Author | Notes |
|------|--------|--------|
| 2026-05-14 | Project doc | Initial script aligned to `WorkflowGuidePage` and `MainLayout` nav. |
| 2026-06-13 | Project doc | Added Chapter 3 Coordinator Survey Console (1–3 teams, compare modes, sortie `.fpl` export, printed handout); updated flight plan export (full route vs sortie fragment); renumbered chapters. |
| 2026-08-31 | Project doc | Chapter 2 rewritten for SR213 Waypoint sequence (top-to-bottom form, correct-sequence return, Hotel coords from ForeFlight, SD card). |
| 2026-09-05 | Project doc | Aligned to sidebar Coordinator Console, two Flight Plan load methods, full-route-only aircrew export, pack prep on the console card / Wing folder, pack close-out on Export Reported Data. Kept chapter numbers 0–2 and 6–10. |
| 2026-09-07 | Project doc | Renumbered former Chapters 6–10 to 3–7. Chapter 3: fill Date / POC / Mission Information to enable Save Mission Changes; return after analysis for Structure Type and Lighting. |
| 2026-09-18 | Project doc | Documented title-card VO (ElevenLabs clip `00`) for chapters 0–7. Chapter 0 spoken as “Chapter zero” so TTS does not say “O.” |
| 2026-09-18 | Project doc | Chapter 1: spotlight Flight Plans and Air Force Report Form; lighter sidebar highlight; add Clear All Data. Moved lightbulb-hint VO to Chapter 2 (first exposure). |
| 2026-09-18 | Project doc | Chapter 1: coordinator staffing VO on first Console stop (no second pass); short Map View role. Chapter 2 detail page: numbered hints 5 (Waypoints) and 6 (Export full route). |
| 2026-09-18 | Project doc | Hint 6 body is the SD-card paragraph only; Coordinator Console closer stays in VO after the popover. |
| 2026-09-18 | Project doc | Chapter 2: numbered tips 1–4 visible on New Flight Plan; Map View route-check hint 1 (tower-marker hint becomes 2). |
