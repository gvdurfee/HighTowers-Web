# HighTowers-Web — Training video script

Audience: **CAP aircrew** conducting an Air Force route survey (MTR tower documentation), using this web app plus ForeFlight and the aircraft G1000.  
Secondary audience: **Wing survey coordinators** staffing one to three aircraft and comparing sortie plans before the season.  
Audience (appendix): **Wing administrator** for content-pack lifecycle only.

**Recording assumptions**

- Host: `http://localhost:5173` for local training, or your deployed Wing URL for production-style video.
- For **Team Dispatch** width data locally, run **`npm run dev:all`** (Vite + Node API on port 3001). Deployed Wings use the same API on Railway. **[RE-RECORD]** any narration that names the old sidebar label.
- Use a **demo mission** and route (e.g. **VR114** or IR112) with non-sensitive coordinates if the video will be shared outside the Wing.
- Sidebar labels match the app: **Workflow Guide**, **Flight Plans**, **Team Dispatch**, **Tower Data Analysis**, **Map View**, **Air Force Report Form**, **Export Reported Data**. There is no sidebar item named ForeFlight Content Pack Update. The Team Dispatch page heading also reads **Team Dispatch**.
- **Team Dispatch** is under **Mission Planning** in the sidebar (`/coordinator/survey`). Load the published MTR there; after staffing, email each sortie `.fpl` to that aircraft’s Mission Pilot. A weather re-fly uses a solo Flight Plan. Offset sortie files for that plan are downloaded from Map View.
- **Content-pack prep** is the **ForeFlight content pack** card on Team Dispatch (issue the baseline ZIP from the Wing folder). **Content-pack close-out** is on **Export Reported Data** (upload the pack you flew with, preview, download an updated ZIP).
- For **Appendix A**, have a **printed** copy of [`docs/handouts/Coordinator-Survey-Console-Handout.pdf`](./handouts/Coordinator-Survey-Console-Handout.pdf) on desk (or open the PDF on a second monitor) to show wing crews the same symbology and staffing models off-screen.
- Optional on-screen subtitle in corner: “HighTowers — Air Force Route Survey workflow”.

**How to use this document**

- **TITLE CARD NARRATION** — ElevenLabs clip `00` on the navy chapter card (not the body VO). Spoken numbers for **0** must be spelled **zero**; Flash reads `Chapter 0.` as “Chapter O.” The on-screen card still shows the digit (`Chapter 0.`). Source of the spoken strings: `~/Movies/HighTowers/Aircrew-Training/playwright/generate-chapters-00-02.py` (`title_text`).
- **NARRATION** — read as voiceover (edit wording to your Wing’s SOP). Body beats live in `ch0N-beats.json`.
- **ON-SCREEN** — what the viewer should see; align your cursor and pauses here.
- **PAUSE** — hold 2–3 seconds for editors or live narration breathing room.
- **VIEW TRANSITION** — production timing only. Do not speak this rule. Order of priority for a view change:
  1. Keep the current working view visible throughout all narration that gives directions for its controls, including the final Create or Update instruction.
  2. After that complete instruction beat ends, hold the same view for 2.000 seconds.
  3. Only then click the control that navigates.
  4. Once the destination is ready, begin the narration that explains the destination.
  - Apply this to view changes, not typing, highlighting, or other actions within the same view. A view transition replaces the main working screen: form-to-detail, detail-to-correction form, correction form-to-detail, detail-to-Map View, and Map View-to-detail. It is not scrolling, typing, highlighting, opening a lightbulb, a routine save within the same view, or showing a download notification. A modal alone is not a new view for this rule.
  - The outgoing view stays up through the directions for that view, then holds for 2.000 seconds. The navigation click comes after that hold. Do not put the hold on the destination, and do not leave an outgoing instruction playing after the click.
  - An italic cue never causes the navigation click and never inserts the two-second hold before its command word. The cue may point at or highlight the named control while the direction is spoken. Do not split a sentence to put the hold before the command word.
  - Narration that explains the destination starts after the destination is ready. Where a beat mixes an outgoing instruction and an incoming explanation, divide only at a clean sentence boundary and keep every word in order.
  - One intentional two-second hold per qualifying transition. A load or save wait is separate. It is not a substitute for the hold, and it is not inserted inside a spoken word or sentence.
  - Do not add a two-second hold before every ON-SCREEN block. Same-view actions keep their existing spoken cues and timing.
- **BUTTON OUTLINE** — production only. Do not speak this rule. Outline the relevant button while the narration explains pressing it. Keep the outline until the press or the next cue, then clear it. The outline must not cover text or shift layout, and it adds no pauses and no audio changes.

**Suggested total runtime** — 26–38 minutes main program (aircrew chapters); +7–10 minutes for Appendix A (coordinator); +3–5 minutes for Appendix B (admin).  
**Optional split** — record **Appendix A** as a standalone *Wing coordinator* clip if the primary audience is aircrew only. Main-program chapter numbers are **0–7** (aircrew), plus the appendices.

**Demo routes (suggested)**

| Topic | Route / example |
|--------|------------------|
| Corridor width + custom offsets | **VR114** or **IR107** |
| Staged refuel (distant home → shared recovery) | **IR107** with KABQ / second base + recovery field (e.g. KCAO or KTCC) |
| Team Dispatch (airports on that page only) | Sidebar **Team Dispatch** → load full route (e.g. VR114 A–Q). The serpentine flight test is VR-114 only. |
| Waypoint sequence + blend-in + pending Hotel coords | **SR213** (KABQ → KAEG); first list `A–H`, then correct with `G, SR214H, G` at the start; **SR213H** often needs manual coordinates |
| Tower not on map + height fields | Any mission; **SR213** or similar if available |

---

## Chapter 0 — Introduction (optional, 30–45 s)

**TITLE CARD NARRATION**  
“Chapter zero. Introduction.”  
On-screen: **Chapter 0.** / Introduction

**ON-SCREEN** — Workflow Guide; slow pan down the numbered steps. Point at the coordinator sentence under the title if it is visible.

**[RE-RECORD]**  
**NARRATION**  
“This application walks a Civil Air Patrol crew through an Air Force route survey: flight planning that converts a ForeFlight flight plan to a format the G1000 can use, starting with the Air Force report form so that any new towers discovered can be added to the form automatically, measuring them in Tower Data Analysis so coordinates and heights can be added, providing a Map View for the pilot to check against the ForeFlight map, and to zoom to points for map tower marker checks after analysis is complete, to exporting the customer report in PDF form for emailing, and refreshing ForeFlight content packs for the next season, to include any new tower discovery coordinates. There is an extra survey planning section for coordinators — **Team Dispatch** in the sidebar — for the member who will staff two or three teams on routes with wide corridors. Each lane is already in the sortie file as real offset waypoints.”

**PAUSE**

---

## Chapter 1 — Orientation and sidebar (1–2 min)

**TITLE CARD NARRATION**  
“Chapter 1. Orientation and sidebar.”  
On-screen: **Chapter 1.** / Orientation and sidebar

**ON-SCREEN** — Left sidebar fully expanded; point at **Getting Started** → **Workflow Guide**.

**[RE-RECORD]**  
**NARRATION**  
“With the Workflow Guide, every function can be branched to in the left sidebar. **Workflow Guide** is your checklist. Under **Mission Planning** *you’ll use* **Flight Plans** — and from there, pilots will create the flight plan for the sortie. If two or three teams are required, wing coordinators *open* **Team Dispatch** from the same sidebar section. The page heading on that screen also reads Team Dispatch. Coordinators load the published MTR, assign aircraft and Mission Pilots when they are available, then email each sortie **.fpl** to that aircraft’s Mission Pilot. A weather re-fly is a solo Flight Plan; those offset files come from Map View. **Mission Execution** *is* **Tower Data Analysis** *and* **Map View**. **Map View** is where you compare the planned route with ForeFlight, and later confirm each saved tower marker sits on the structure. Under **Reporting** you’ll use* the* **Air Force Report Form** *and* **Export Reported Data**. Content-pack close-out after the flight lives on **Export Reported Data**, not a separate sidebar item.”

**ON-SCREEN** — Spotlight each sidebar item as it is named, once: **Workflow Guide**, **Flight Plans**, **Team Dispatch** (hold through the coordinator staffing line; the page heading also reads Team Dispatch), **Tower Data Analysis**, **Map View**, **Air Force Report Form**, **Export Reported Data**. Use a light highlight so the label stays readable. Then spotlight **Clear All Data** at the bottom (do not click it). Do not return to Team Dispatch.

**NARRATION**  
“At the bottom of the *sidebar*, **Clear All Data** removes saved flight plans, towers, and missions from this browser. Use it only when you want a clean training or demo start. It cannot be undone.”

**NARRATION**  
“You can *collapse* the sidebar for more section space; *expand* it when you need to move between sections.”

**ON-SCREEN** — Briefly collapse and expand sidebar using the arrow control.

**PAUSE**

---

## Chapter 2 — Flight planning and G1000 export (5–8 min)

**TITLE CARD NARRATION**  
“Chapter 2. Flight planning and G1000 export.”  
On-screen: **Chapter 2.** / Flight planning and G1000 export

Demo route: **SR213** with **Waypoint sequence** (the more detailed of the two load methods). Use **KABQ** departure and **KAEG** destination. **SR213 Hotel** is usually missing from the public waypoint source, so the detail page will ask for coordinates.

**ON-SCREEN** — **Flight Plans** → **New Flight Plan**. Work top to bottom on this form. Do not skip fields. Numbered lightbulb tips **1–4** stay visible on this page (Name, airports, waypoint loading, Create). No two-second hold: no narration precedes this opening navigation.

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
“*Choose* Waypoint sequence. Put the route identifier once, then list the suffixes from your ForeFlight expanded plan. Fetch confirms which points the database already knows. For this demo we enter only the Sierra Romeo 213 suffixes, and leave off the blend-in at the start. Sierra Romeo 213 Hotel, in this example is missing from the public source.”

**VIEW TRANSITION** — Keep this New Flight Plan form visible through the entire Create instruction, including “Otherwise you will have to start again.” At *You*, highlight **Create Flight Plan** and do not click. After that beat ends, hold this form for 2.000 seconds, then click **Create Flight Plan**. Boundary: the outgoing beat ends at that sentence. “*The* next page lists…” starts only after the detail page is ready.

**ON-SCREEN** — At *You*, scroll to **Create Flight Plan** and highlight it. Leave this form up through the rest of the beat. Click only after the beat and the two-second hold.

**NARRATION**  
“*You* must press Create Flight Plan to save before you leave this page. Otherwise you will have to start again.”

**ON-SCREEN** — Flight plan detail: ForeFlight vs G1000 columns. Open numbered lightbulb **5** next to **Waypoints**. The list starts at Alpha; Hotel is pending. Point out that ForeFlight actually begins with Golf, SR214H, Golf.

**NARRATION**  
“*The* next page lists ForeFlight-style names beside G1000 names so you can cross-check the chart and the navigator. If the ForeFlight plan starts with Golf, Sierra Romeo 214 Hotel, Golf, those points are missing here. Do not delete the plan and start over. Use Correct waypoint sequence.”

**VIEW TRANSITION** — Finish “Do not delete the plan and start over. Use Correct waypoint sequence.” on this detail page. Hold that detail view for 2.000 seconds, then click **Correct waypoint sequence**. Do not add another hold before lightbulb 5. Boundary: “*The* form comes back…” belongs on the correction form and starts after that form is ready.

**ON-SCREEN** — After the detail-page hold, click **Correct waypoint sequence**. On the correction form, change the sequence to `G, SR214H, G, A, B, C, D, E, F, G, H` and Fetch while that instruction is spoken. At *press*, highlight **Update Flight Plan** and do not click yet.

**VIEW TRANSITION** — Keep the correction form visible through the entire Update instruction, including “You return to this same plan to finish.” At *press*, highlight **Update Flight Plan** and do not click. After that beat ends, hold this form for 2.000 seconds, then click **Update Flight Plan**. Boundary: the outgoing beat ends at that sentence. The coordinate narration starts only after the updated detail page is ready.

**NARRATION**  
“*The* form comes back with your entries. Add Golf, Sierra Romeo 214 Hotel, and Golf at the beginning of the sequence, then *press* Update Flight Plan. You return to this same plan to finish.”

**ON-SCREEN** — In the SR213 Hotel pending row, enter latitude 34° 49.30' N and longitude 106° 58.60' W using the degree and decimal-minute fields. Select N and W as applicable. Type the complete values at a readable pace. Click Supply Coordinates. Show the resolved Hotel waypoint and the updated route detail; do not leave Hotel pending. The degree/minute figures are real entered values in this beat, not empty-field placeholders.

**NARRATION**  
“For this training plan, enter the Sierra Romeo 213 Hotel coordinates from your ForeFlight route: thirty-four degrees, forty-nine decimal three zero minutes north; one hundred six degrees, fifty-eight decimal six zero minutes west. Select north and west, then press Supply Coordinates. The Hotel point is added to the route.”

**VIEW TRANSITION** — Finish the coordinate directions on the detail page, including “The Hotel point is added to the route.” Hold that detail view for 2.000 seconds, then open **Map View**. Supply Coordinates is not a view change. Boundary: “Before you export, open Map View…” explains Map View and starts after Map View is ready. Do not hold that Map View narration on the detail page.

**ON-SCREEN** — Sidebar **Map View**. Select **SR213 Training Demo** if it is not already selected. The route now includes the resolved Sierra Romeo 213 Hotel point, and that point is drawn. Sierra Romeo 214 Hotel remains the published point. Open numbered lightbulb **1** next to **Map View** (compare with ForeFlight). Hold on the complete route line. Dismiss the hint, then point at **Return to Flight Plan** without using it for a second correction.

**NARRATION**  
“Before you export, open Map View and compare this graphical flight plan with your ForeFlight map. If the two pictures match, you have a visual confirmation that the waypoint list is right. If you see a mistake, press Return to Flight Plan and use Correct waypoint sequence on that page, otherwise press Return to Flight Plan in order to load the SD card.”

**VIEW TRANSITION** — Finish the Map View directions on Map View, including “otherwise press Return to Flight Plan in order to load the SD card.” Highlight **Return to Flight Plan** while those sentences play, and do not click yet. Hold Map View for 2.000 seconds, then click **Return to Flight Plan**. Boundary: “*Export* full route…” explains the detail page and starts after that page is ready. *Export* is not the navigation click. The export dialog is not a new view.

**ON-SCREEN** — Return is already done, after the Map View hold. Open numbered lightbulb **6** next to **Export full route (.fpl)** (hint body is the SD-card paragraph only). Then **Export full route (.fpl)** → Export. Show the download if the browser shows it. The export dialog is a modal, not a new view.

**[RE-RECORD]**  
**NARRATION**  
“*Export* full route downloads the complete FPL, every waypoint in the plan. Follow the G1000 Pilot's Guide for importing user flight plans from the SD card. Eject the card before you remove it from the reader, so the file is not corrupted. Not a concern: per the Director of Operations, user waypoints and the flight plans that created them are erased after each mission. Confirm no leftover user waypoints before loading, because short names repeat between routes. Offset sortie files for a solo plan are downloaded from Map View. Team files are issued from **Team Dispatch**.”

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
“Here each tower uses a photo image, a map position, and a tower height for this workflow. This is where you spend most of your airborne or post-flight time per structure. The detail on how to use this capability follows. But, you start by selecting a tower image to measure, by pressing the "Select Image' button, and pick the JPEG file of the photo on your computer that you want to analyze.”

**ON-SCREEN** — Select a tower photo , using the "Select Image" button on-screen, from the files you loaded on to the computer you're using for the report; show **Look for Tower on Map** and placing the marker. If demoing estimated placement, check **Tower not visible on map** before **Record Location**.

**NARRATION**  
“Use **Look for Tower on Map** to identify the vicinity of the tower base on the satellite image, so that finding the actual location can start with what you recorded on the fly over. A useful technique during the flight, is to fly over the tower you're going to take a picture of, and when the pilot indicates the aircraft is crossing over the tower, the aircrew member in the right seat presses in the range knob on the G1000 Multi Function Display; this will capture the coordinates for the flyover location when the button was pressed. These coordinates can be written down, or the aircrew member can take a picture of the panel for use when the Tower Data Analysis is done for the tower. These coordinates are what's used to populate the "Lat and Lon" text under the map segment. This feature provides a small, movable section of the aerial map that's used for the tower base location to be identified with the cross inside the blue circle; since the map segment is movable, the user can zoom and move the map until the tower base is right under the cross. This location is recorded for use in the Tower Data Analysis.  If the structure isn’t visible on the map imagery, check **Tower not visible on map** before you record — you can still place a best-effort position nearby by moving the map until the estimated spot is covered by the cross in the blue circle, based on terrain comparison with the map and the photo; press "Record Location", then you can run the height sliders.”

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
“If no new towers were discovered, check the box indicating this; the Airforce customer still needs a record of the survey results. The Air Force Report form is filled out with the note hat no new towers were found. Additionally, there is no need to modify the ForeFlight Content pack for the same reason But for missions that resulted with new towers found, the following is followed: After analysis, come back to **Map View** before you email anything. With the flight plan and this mission selected, each reported tower draws as a marker on a line from the nearest route waypoint. That is your check that the point you saved actually sits on the structure.”

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

**ON-SCREEN** — Return to **Workflow Guide**; highlight crew steps; optionally flash **Team Dispatch** in the sidebar.

**NARRATION**  
“For wing coordinators: plan and export the full-route G1000 file from **Flight Plans**, confirm the route on **Map View**, execute towers in **Tower Data Analysis**, finish the **Air Force Report Form**, then use **Export Reported Data** for the customer PDF and, when needed, an updated content-pack ZIP.”

**[RE-RECORD]**  
**NARRATION**  
“For two or three teams: open **Team Dispatch** from the sidebar. The page heading also reads Team Dispatch. Load the published route, set Left and Right lane spacing in **Scenario**, choose Sortie 1 side, export each sortie **.fpl**, and **email that file to that aircraft’s Mission Pilot**. The file already contains the offset waypoints. Fly them leg to leg. A weather re-fly uses a solo Flight Plan. Before the season, issue the baseline ForeFlight pack from the Wing folder — the card on Team Dispatch reminds you; after the survey, close out the pack on **Export Reported Data**.”

**NARRATION**  
“Questions go to your Wing’s training officer.”

**PAUSE** — fade or end card.

---

## Appendix A — Team Dispatch (2 or 3 teams) (7–10 min)

**[RE-RECORD] entire appendix.** The sidebar label and the page heading are both **Team Dispatch**. There is no numbered six-step wizard on the page. Aircraft count includes **1 team**: one aircraft flies both sides in sequence (Sortie 1 side, then the other side on Sortie 2), used to finish a partial route fragment left incomplete because of weather or limited resources. Sortie 2 is its own `.fpl`, already in flying order.

**Audience note** — Wing coordinators, ops staff, and pilots who want to see how sortie assignments are derived. Can be a separate video. The serpentine example in this appendix is **VR-114**.

**ON-SCREEN** — Hold up the printed **Team Dispatch** handout (`docs/handouts/Coordinator-Survey-Console-Handout.pdf`); show the cover title briefly, then switch to the app.

**NARRATION**  
“Your Wing should have this handout in the ops room and in each survey aircraft kit. It matches the sortie file: real offset waypoints, Inner and Outer from the route’s curve, and two or three teams. A weather re-fly is a solo Flight Plan.”

**ON-SCREEN** — Sidebar **Mission Planning** → **Team Dispatch**. The page heading reads **Team Dispatch**. Empty page shows **Load the published route**. Fetch VR114, **Load route into console**. URL shows `/coordinator/survey?plan=…`.

**NARRATION**  
“**Team Dispatch** is a wing planning aid — not a replacement for ForeFlight corridor display or ATP routing. Load the published MTR here. The page heading says Team Dispatch. Use it for two or three teams. One airplane, including a weather re-fly, stays on Flight Plans.”

**ON-SCREEN** — Expand **Coordinator quick reference & symbology**; point at **What this console does** and **Issue files to crews**.

**NARRATION**  
“**Issue files to crews** is the last step: export each sortie **.fpl** and email it to that aircraft’s Mission Pilot. The file already contains each offset lane. Fly the loaded route, by hand or with the autopilot in GPS/NAV. Do not set an offset on the G1000. Default spacing is often three, nine, and fifteen nautical miles. Lane one is the lane closest to the centerline. A pass past that side’s published width is dropped.”

**ON-SCREEN** — Show **Scenario**. Scroll to the heading **Corridor and lane spacing**. Point at **Left NM**, **Right NM**, **Left offsets**, and **Right offsets**.

**NARRATION**  
“These width fields are left and right of the centerline as flown. They are not the Inner and Outer choice. Inner is the inside of the route’s overall curve. Outer is the other side. If the route is nearly straight or S-shaped, the Sortie 1 side picker says Inner is left of the route flown from the entry point. Pilots go by the side the picker shows.”

**ON-SCREEN** — Open lightbulb tip **Corridor width and lane spacing**. Briefly change one offset list and show the leg preview refresh.

**NARRATION**  
“Change the lane list here and re-run to see the sortie impact. The lightbulb explains left and right of the centerline as flown, and that Inner and Outer follow the route’s curve.”

**ON-SCREEN** — Right column: **ForeFlight content pack**, then **Teams & parameters** → **Aircraft count**. Show the radios **1 team**, **2 teams (opposite sides)**, and **3 teams (geographic split)**. Read the 1-team label: one aircraft flies both sides in sequence, used to finish a partial route fragment left incomplete because of weather or limited resources.

**NARRATION**  
“The content-pack card is a reminder, not a download. One team is one aircraft flying both sides in sequence: Sortie 1 on the side you choose, then the other side on Sortie 2. Use that when weather or limited resources left a route fragment unfinished. Two teams work neighboring sides at the same time. Three teams split the route into segments. Sortie 2 is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Sortie 2 is its own file. Team waypoint names look like B one O or X-M two I: the letters are the MTR point, the digit is the lane counted outward from the centerline, and the last letter is Inner or Outer.”

**ON-SCREEN** — **Look up** two team airports (for example KABQ and a second base near VR114).

**NARRATION**  
“Look up each team’s departure here. A route loaded on this page has no departure stored on the flight plan record.”

**ON-SCREEN** — **Ferry / recovery model** → select **Staged refuel (finish survey before weather)**; **Look up** the shared refueling airport.

**NARRATION**  
“For a long ferry, choose staged refuel and one shared refuel airport. Sortie one ends at that field. The final sortie returns home. Pilots deconflict by announcing entry and exit positions, keeping radio contact, and staggering takeoff times. The on-screen note says radio contact and staggered takeoffs.”

**ON-SCREEN** — Under the heading **Offset flight plans**, find **Sortie 1 side**. Radios: **Inner (inside the route's curve)** and **Outer (outside the route's curve)**. If a note is shown, read it.

**NARRATION**  
“Sortie one flies the side you pick here. Sortie two flies the other side. Go by this picker, not by your own reading of the map.”

**ON-SCREEN** — Run the planner. Wait for **Results**. Scroll a sortie row, then click **Export .fpl**. Show **Sortie pilot brief**. The card title is Sortie pilot brief. The first line says the file already contains each offset lane.

**NARRATION**  
“Each sortie row downloads a G1000 **.fpl**. Email it to the Mission Pilot, or copy it to an SD card. The card says the file already contains each offset lane and to fly the loaded route. Sortie 2 is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Confirm no leftover user waypoints before loading, because short names repeat between routes. After import, spot-check one waypoint’s coordinates. Before each lane, confirm the aircraft symbol is on the yellow track on both the ForeFlight moving map and the G1000 MFD map. Announce when you enter and exit each lane, giving your position by waypoint name (for example, entering B1O). The team file has no published centerline fixes. The serpentine flight test for this file is VR-114 only.”

**ON-SCREEN** — Red **Wing planning aid only** disclaimer; cut back to the printed handout.

**NARRATION**  
“Treat every number as a planning aid. Crews still verify the corridor in ForeFlight Military Flight Bag. Brief the crew from the handout: team, segment, sortie, lane distances, and the side the picker showed.”

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

**[RE-RECORD]** The Team Dispatch page heading now reads **Team Dispatch**.

**ON-SCREEN** — Sidebar **Team Dispatch** for a loaded route; scroll the right column to **ForeFlight content pack**. The page heading reads **Team Dispatch**.

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
- [ ] Re-record **Appendix A** (marked **[RE-RECORD]** in this script) for Team Dispatch, offset-coordinate sortie files, and the Sortie 1 side picker.
- [ ] Re-record **Chapter 6** if Export Reported Data pack upload / preview / download UI changes.
- [ ] Re-record Chapters 3–4 if report tower height / “See Notes” formatting changes.
- [ ] Re-record Appendix B if admin inventory flows change; re-record Appendix C if the console pack card changes.
- [ ] Show or mention the printed **Team Dispatch** handout in **Appendix A**; link `docs/handouts/Coordinator-Survey-Console-Handout.pdf` in the video description for coordinators.

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
| 2026-11-04 | Project doc | **[RE-RECORD]** Chapters 0, 1, 2 closer, 7, and Appendix A. Sidebar is Team Dispatch. Sortie files are offset waypoints. No G1000 offset step. Page heading on that screen still reads Coordinator Survey Console. |
| 2026-11-04 | Project doc | **[RE-RECORD]** Chapters 0, 1, 2 closer, 7, Appendix A, and Appendix C. Page heading is Team Dispatch. No 1-team radio. Sortie 2 is its own file, already in flying order. SD card import follows the G1000 Pilot's Guide. |
| 2026-11-04 | Project doc | **[RE-RECORD]** Appendix A again. The 1-team radio is back: one aircraft flies both sides in sequence, to finish a partial route fragment left incomplete because of weather or limited resources. |
