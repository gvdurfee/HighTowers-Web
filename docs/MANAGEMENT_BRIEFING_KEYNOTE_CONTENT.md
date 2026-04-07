# HighTowers Web — Management Briefing (≈30 minutes)

**Audience:** First-time management (supervisors, ops leads, training coordinators)  
**Goal:** Orient leaders to what the web app does, how crews use it, and what you need to govern or support—not hands-on clicking.  
**Format:** Copy each **Slide** block into Apple Keynote (one slide per block). Use **Speaker notes** in Keynote’s presenter notes field.

**Suggested timing:** ~1–1.5 minutes per content slide; faster for title/section breaks. Total ~26 slides ≈ 28–32 minutes with discussion.

---

## Slide 1 — Title

**HighTowers Web**  
Management orientation — mission workflow & reporting

**Speaker notes:**  
Set expectation: this is the browser-based companion to your broader survey process. You’ll leave knowing what crews do in the tool, in what order, and what data never leaves the browser unless they export it.

---

## Slide 2 — What problem this addresses

**Why this tool exists**

- Military Training Route (MTR) and similar surveys require **consistent flight planning**, **tower observations**, and **structured deliverables** for the Air Force customer.
- Crews need one place to **plan**, **analyze photos**, **tie data to missions**, and **produce a professional report** (including PDF).
- Management needs to know **what the system is for** and **where responsibility sits** (aircrew vs. IT vs. customer).

**Speaker notes:**  
Avoid deep CAP or chart talk unless your audience asks. Frame it as: standardized workflow, fewer dropped steps, repeatable outputs.

---

## Slide 3 — What HighTowers Web is (and is not)

**What it is**

- A **single-page web application** in the browser: **Workflow Guide**, **Flight Plans**, **Tower Data Analysis**, **Map View**, **Air Force Report Form**, **Export Data**.
- Built for the **Air Force Route Survey** style workflow (flight plan alignment, tower metrics, PDF export).

**What it is not**

- Not a replacement for **ForeFlight** or the **G1000**—it **complements** them (e.g. `.fpl` export for the panel).
- Not a shared **server-side** mission database for your wing by default—see data slide.

**Speaker notes:**  
Emphasize complementarity: ForeFlight for flying, HighTowers for survey workflow and package assembly.

---

## Slide 4 — How you open it

**Access**

- Delivered as a **web app** (typically opened from a **known URL** or internal hosting—confirm with your IT or release process).
- Works in a **modern desktop browser** (Chrome, Edge, Safari are common choices for demos).

**Speaker notes:**  
If you host internally, mention VPN or HTTPS as your org requires. Don’t promise availability you haven’t verified.

---

## Slide 5 — Data stays in the browser (critical for managers)

**Local-first storage**

- Mission data, flight plans, tower reports, and related records are stored in the browser’s **local database** (IndexedDB), not automatically uploaded to a central HighTowers server.
- **Implication:** Data is **per browser / per device / per profile**. Clearing the browser site data—or using **Clear All Data** in the app—**removes** that copy.

**Speaker notes:**  
This is the #1 management talking point: **no automatic cloud backup** unless your organization adds one. Crews should follow your wing’s policy for retention, screenshots, or export archives.

---

## Slide 6 — “Clear All Data” (governance)

**Sidebar: Data → Clear All Data**

- **Destructive:** Wipes missions, flight plans, waypoints, airports, tower data tied to this storage.
- **Use case:** Training lab reset, shared machine between classes, or deliberate purge—**not** routine operations.
- **Recommendation:** Only **authorized** personnel use it; document **when** your unit resets training machines.

**Speaker notes:**  
If someone clicks it in production by mistake, recovery is only from backups they made (export PDF, copies of `.fpl`, etc.)—not from the app.

---

## Slide 7 — Application map (sidebar)

**Three groups + data**

| Area | Purpose (management view) |
|------|---------------------------|
| **Getting Started** | **Workflow Guide** — ordered checklist with links |
| **Mission Planning** | **Flight Plans** — create, view, export |
| **Mission Execution** | **Tower Data Analysis**, **Map View** |
| **Reporting** | **Air Force Report Form**, **Export Data** |
| **Data** | **Clear All Data** (destructive) |

**Speaker notes:**  
You can point at the sidebar on a live demo without drilling into every field.

---

## Slide 8 — End-to-end workflow (the story you’ll repeat)

**The four-step story (Workflow Guide)**

1. **Flight planning** — Align with ForeFlight; export **G1000 `.fpl`** if needed.  
2. **Air Force Report Form** — Foundation for the customer package; associate a **mission** and **flight plan**.  
3. **Tower Data Analysis** — Images, survey location, height workflow; feeds the report.  
4. **Export Data** — Generate the **Air Force Route Survey Report PDF** for delivery/email.

**Speaker notes:**  
This slide is your “elevator + training spine.” Crew training should always be able to recite these four steps in order.

---

## Slide 9 — Flight Plans (why leadership should care)

**Flight Plans module**

- **New Flight Plan:** Departure/destination from **FAA data** (ICAO **or** FAA location ID / NASR identifier, e.g. `KABQ` or `0E0`).
- **Load full route** vs **Waypoint sequence** vs **G1000 user waypoint library** (optional mode for clean avionics import lists).
- **Export `.fpl`** for **G1000** import; **Map View** supports visual validation.

**Speaker notes:**  
Management angle: **standardization** with ForeFlight Military Flight Bag for full-route loads; **flexibility** for complex corridors via waypoint sequence. Library mode is a **special case** for bulk user-waypoint loading—different dep/dest required.

---

## Slide 10 — Aligning with ForeFlight & the G1000

**Integration points**

- **ForeFlight:** Full-route loads are intended to **match** the Military Flight Bag style route picture (spot-check during training).
- **G1000:** **`.fpl`** export; crews should follow **SD card** and **filename** practices per aircraft docs (root folder, short names, etc.).
- **Help (❓):** In-app plain-language help on **load methods** and **caveats**.

**Speaker notes:**  
You are not certifying avionics behavior—aircrew confirm against POH/supplement. Your message: “We designed export to follow common Garmin XML practice; ops verifies on the aircraft.”

---

## Slide 11 — Missions & the Report Form (customer thread)

**Air Force Report Form**

- Create or select a **mission** (mission number, route, date, POC, unit, etc.).
- **Associate a flight plan** so bearing/distance logic can reference **nearest waypoints** where applicable.
- Completes the **structured** side of what becomes the **PDF** package.

**Speaker notes:**  
Stress **traceability**: mission record ties together plan, towers, and export. Missing flight plan may limit automated notes—train crews to associate early.

---

## Slide 12 — Tower Data Analysis (field reality)

**What crews do here**

- Select **tower imagery**, use **survey location** tools, complete **height measurement** workflow, and **store** results.
- Outputs roll forward into **reporting** and **export**—not “just a photo viewer.”

**Speaker notes:**  
For management: quality control = **did they complete the chain** (image → location → height → report), not which button is prettiest.

---

## Slide 13 — Map View (supervisory use)

**Map View**

- Visual check of **mission** context, flight plan geometry, and overlays as implemented.
- Useful for **briefings** and **spot checks** (“does this look like the corridor we briefed?”).

**Speaker notes:**  
Position as QA and communication, not primary navigation for the aircraft.

---

## Slide 14 — Export Data (deliverable)

**Export Data**

- Produces the **Air Force Route Survey Report PDF** (and related export flows your build supports).
- This is typically the **customer-facing** artifact—version, file naming, and transmission should follow **wing / customer** policy.

**Speaker notes:**  
Remind: PDF is a **copy** they can archive; the live database is still local unless they also save exports elsewhere.

---

## Slide 15 — Training aircrews — what to emphasize

**First-time crew training (your talking points)**

- Walk the **Workflow Guide** once top-to-bottom.  
- Live demo: **one** flight plan (full route **or** sequence—pick one story).  
- Live demo: **Tower Data Analysis** through one saved result.  
- Live demo: **Report Form** → **Export PDF**.  
- Close with **data locality** and **Clear All Data** rules.

**Speaker notes:**  
Management doesn’t need to master every edge case; they need to **enforce** the four-step spine and **data hygiene**.

---

## Slide 16 — Roles & responsibilities (suggested)

| Role | Responsibility |
|------|------------------|
| **Aircrew** | Execute workflow; export deliverables; follow retention policy |
| **Training lead** | Reset training browsers; standardize demo mission |
| **IT / hosting** | URL, HTTPS, updates, optional central backup if adopted |
| **Customer (AF)** | Accepts PDF/package per their process |

**Speaker notes:**  
Customize the table to your wing. The gap is usually “who owns backups?”

---

## Slide 17 — Operational risks (honest, short)

**Things that go wrong in the real world**

- **Wrong browser / cleared storage** → “missing” missions (data was local).  
- **Skipped flight plan association** → weaker auto-notes / context in reports.  
- **G1000 import issues** → usually **file placement**, **naming**, or **software version**—train with checklist from avionics docs.  
- **Seasonal user waypoints** (if crews use library-style loads): **clean up** stale user waypoints on the panel per your SOP.

**Speaker notes:**  
Frame as **procedures**, not product defects. Most issues are process + training.

---

## Slide 18 — Metrics you *can* ask for (lightweight)

**Quality indicators (examples)**

- **100%** of completed sorties have **Export PDF** generated before case closed.  
- **Flight plan associated** to mission before tower analysis marked complete.  
- Spot audits: **ForeFlight vs. app** route consistency on sample missions.

**Speaker notes:**  
Don’t over-quantify unless you have a way to collect data—the app doesn’t phone home by default.

---

## Slide 19 — Companion: iPad app (if you use both)

**Web vs. iPad**

- Same **conceptual** workflow; **web** is ideal for **briefing rooms**, **large screens**, and **training** with projection.
- Field teams may still use **iOS**—confirm which build is **authoritative** for your unit’s SOP.

**Speaker notes:**  
Only include if your wing actually uses both; otherwise delete this slide.

---

## Slide 20 — Demo script (5 minutes, optional live)

**Minimal live demo order**

1. **Workflow Guide** — show the four steps.  
2. **Flight Plans → New** — show **Fetch** on airports; mention ICAO / NASR ID.  
3. **Flight plan detail** — mention **Export .fpl**.  
4. **Report Form** — mission + associate flight plan (high level).  
5. **Export Data** — PDF generation (or show disabled state if demo data incomplete).

**Speaker notes:**  
If time is tight, use screenshots instead of live network.

---

## Slide 21 — FAQ — “Is our data in the cloud?”

**No—not by default**

- Stored **locally** in the browser unless **your organization** adds sync, backup, or hosting policies.
- **Exports** (PDF, `.fpl`) are files the user saves or emails—those copies go wherever **they** put them.

**Speaker notes:**  
If legal or privacy asks, the accurate line is: “Application state is browser-local; exported files follow normal file-handling policy.”

---

## Slide 22 — FAQ — “Can two people share one mission?”

**Not automatically**

- Each browser profile holds its **own** database.  
- Sharing = **export/import** workflow or a **future** backend—not the default product behavior today.

**Speaker notes:**  
Set expectations for multi-seat ops: define **who owns** the master browser or **how** PDFs are filed.

---

## Slide 23 — Support & updates

**Keeping the briefing accurate**

- Note your **version** or **build date** when you train.  
- When the app changes (new export, new help text), refresh **this** deck and **crew** checklists.

**Speaker notes:**  
Assign an owner for “training material drift.”

---

## Slide 24 — Key takeaways (management)

1. **Four-step workflow** is the spine.  
2. **Data is local**—govern retention and **Clear All Data**.  
3. **Flight plans** bridge **ForeFlight**, **G1000**, and **reports**.  
4. **PDF export** is the primary **customer** artifact.  
5. **Training** = workflow + data hygiene, not every menu item.

---

## Slide 25 — Discussion

**Questions & unit SOP**

- Where do we **file** PDFs and `.fpl` files?  
- Who **resets** training machines?  
- What is our **minimum** completed record before a sortie is “closed”?

---

## Slide 26 — Thank you / contact

**HighTowers Web — Management briefing**  
**Next step:** Hands-on crew lab (Workflow Guide–driven)

**Speaker notes:**  
Offer to send this markdown file or a PDF export of it to attendees. Close the loop with a dated SOP or one-page quick reference.

---

## Appendix A — Optional deep-dive slides (if Q&A runs long)

**A1 — G1000 library mode (one slide)**  
Unique waypoint names only; **different** departure/destination required; for bulk user-waypoint load; seasonal cleanup of user waypoints on the panel.

**A2 — MTR database caveats**  
Database may lag **AP/1B**; pending waypoints can be filled manually on the flight plan detail page.

**A3 — Imagery / map stack**  
Briefly name your map provider and any **API keys** or **network** requirements if your deployment uses overlays—only if relevant to your hosting story.

---

*End of deck content.*
