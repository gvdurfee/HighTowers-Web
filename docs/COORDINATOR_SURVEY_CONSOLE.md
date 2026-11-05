# Team Dispatch — product spec

The sidebar label and the page heading are both **Team Dispatch**. Address: `/coordinator/survey` (optional `?plan=<flightPlanId>`).

This is the wing tool for staffing **one, two, or three teams** on a Low Level Route. **1 team** is one aircraft that flies both sides in sequence (Sortie 1 side, then the other side on Sortie 2). Use it to finish a partial route fragment left incomplete because of weather or limited resources. Sortie 2 is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Sortie 2 is its own `.fpl` file.

**Shipped sortie files.** There is no G1000 Parallel Track. Every lane is user waypoints at the real offset coordinates. The G1000 flies leg to leg between those waypoints, by hand or on autopilot in GPS/NAV. A team file has no published centerline fixes. The download is the `.fpl`.

**Inner and Outer.** Inner is the side toward the inside of the route’s overall curve. Outer is the other side. A nearly straight or S-shaped route has no clear inside; the app then uses Inner = left of the route flown from the entry point and says so on the Sortie 1 side picker. Pilots go by the side the picker shows.

**Names.** Solo: point letters + 3-digit route position + I or O (`A001I`, `A001O`). Sortie 2 is the other side, listed in reverse. Team lanes: point letters + lane number + I or O (`B1O`, `XM2I`). Lane 1 is closest to the centerline. Distances are the ones stated for that plan (often 3, 9, and 15 NM). At most 6 characters, A–Z and 0–9, unique in the file. A solo name drops a leading zero only to fit (`XYZ01I`). A repeated visit on one lane adds a digit (`B12I`).

**On-screen order** (the page is not a numbered stepper; parentheses are the headings):

1. Crews and aircraft (Teams & parameters)
2. Route (Load the published route)
3. Corridor and tracks (Scenario — Left NM / Right NM and Left offsets / Right offsets are the published sides of the centerline as flown, not the Inner/Outer choice)
4. Segments and refuel (Results)
5. Sortie 1 side (Inner / Outer radios)
6. Results (download each `.fpl`)

Neighboring teams are recommended on opposite sides. Recommended: each segment flies the opposite side from the segments next to it (e.g. segment 1 Inner, segment 2 Outer, segment 3 Inner). This is a recommendation, not guaranteed separation; pilots still deconflict. Announce when you enter and exit each lane, giving your position by waypoint name (for example, entering B1O).

**Map View legend:** “Map: ultramarine centerline with point letters, white edges, yellow sortie tracks, blue arrows.” The drawn centerline is ultramarine `#3F00FF` so it reads on satellite imagery. Edges are white. Tracks are yellow `#FFD911`.

**Not in scope:** ForeFlight corridor display (crews use Military Flight Bag), maintenance scheduling, crew availability, MOA activation, or ATP-quality routing.

**Launch:** Sidebar **Mission Planning** → **Team Dispatch**. Load the published MTR. After staffing, email each sortie `.fpl` to that aircraft’s Mission Pilot.

**Wing handout (print/PDF):** [`docs/handouts/Coordinator-Survey-Console-Handout.pdf`](./handouts/Coordinator-Survey-Console-Handout.pdf) — coordinator and crew communication; source [`COORDINATOR_SURVEY_CONSOLE_HANDOUT.md`](./COORDINATOR_SURVEY_CONSOLE_HANDOUT.md). Regenerate: `npm run handout:coordinator-pdf`.

**Status:** PR 1 scaffold — shared planner modules, `MTR_WDTH` API, UI shell, VR114 parser tests. Sortie packing and multi-team optimization follow in later commits on this branch.

---

## 1. Problem

Wide MTR corridors (for example **VR114**: 20 NM each side on A→B, then 10 NM left and 20 NM right of the centerline as flown on B→M1) need several offset lanes on a side. Wings often assign **two aircraft** from **different departure airports**. Neighboring teams are recommended on opposite sides. The serpentine flight test for these files is **VR-114 only**.

Coordinators need a **numeric** answer for management:

- How many sorties per team?
- Which **contiguous waypoint sub-ranges** per sortie?
- How do **1 vs 2 vs 3 teams** compare on **total sorties**?

---

## 2. Data sources

| Data | Source | Used for |
|------|--------|----------|
| Waypoint coordinates | NASR `MTR_PT.csv` (existing `/api/mtr/waypoints`) | Leg lengths, entry = closest wp to team dep |
| Corridor width | NASR `MTR_WDTH.csv` (new `/api/mtr/width`) | Pass count per leg and side |
| Airports | Existing FAA airport lookup | Ferry NM dep ↔ route |

---

## 3. G1000 maneuver model

For one **side** and one **assigned waypoint chain**:

1. Ferry from the team’s departure to the start of that sortie.
2. Fly the loaded user waypoints. Each lane is already at its offset (for example 3 NM, then 9 NM, then 15 NM), counted outward from the centerline. Lane 1 is closest to the centerline.
3. The file turns the airplane around by the order of those waypoints. The pilot does not set a G1000 offset.
4. Land at the sortie’s destination (home, or the refuel stop on sortie 1 when one is set).

Default spacing, when the coordinator has not typed a different list: first lane **3 NM**, then a **6 NM** step, and no lane past that side’s published width. The distances in the file are the real distances for that plan.

**Along-route NM** for one sortie on one side (one contiguous assignment):

```text
ferry(dep → entry)
+ (number of offset legs) × (centerline length of assigned chain)
+ ferry(last position → dep)
```

Four offsets on the same chain ⇒ **four** directed legs (alternating direction), not one.

---

## 4. Width parsing (`MTR_WDTH`)

`WIDTH_TEXT` examples (VR114):

- `20 NM EITHER SIDE OF CENTERLINE FROM A TO B`
- `10 NM LEFT AND 20 NM RIGHT OF CENTERLINE FROM B TO M1`

Parser output per span: `{ fromPt, toPt, leftNm, rightNm }`.

Split assignments at width boundaries (e.g. **B** on VR114) so pass lists match each leg.

Coordinator may **override** parsed width per span when NASR wording is ambiguous after a cycle change.

---

## 5. Team models

Coordinator selects per scenario:

| Model | Use |
|-------|-----|
| **Opposite sides** | Two teams, recommended for neighbors: one team Inner, the other Outer. The screen label is “2 teams (opposite sides)”. |
| **Geographic split** | Three teams, each assigned a segment. Each team flies both sides of its segment. Recommended: each segment flies the opposite side from the segments next to it (e.g. segment 1 Inner, segment 2 Outer, segment 3 Inner). The app does not assign those sides; the coordinator chooses Sortie 1 side for each crew. |
| **1 team** | One aircraft flies both sides in sequence (Sortie 1 side, then the other side on Sortie 2). Use it to finish a partial route fragment left incomplete because of weather or limited resources. The screen label starts “1 team — one aircraft flies both sides in sequence”. Sortie 2 is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Sortie 2 is its own `.fpl` file. |

Entry waypoint per team: **closest** in the coordinator’s sequence to that team’s departure (not user-picked).

Return: **same departure airport**, or the shared refuel stop when staged refuel is selected. Sortie 2 then returns home.

**Phase B (planned):** one **shared en-route recovery / refuel airport** per scenario (closest practical field near the MTR); sortie 1 ferry out ends at recovery; sortie 2 returns home. See [COORDINATOR_ENROUTE_RECOVERY_BRIEF.md](./COORDINATOR_ENROUTE_RECOVERY_BRIEF.md).

---

## 6. Sortie budget and optimization

- **Budget:** 400–500 NM per sortie (coordinator input; show both in compare mode later).
- **Objective:** minimize **total sorties** across all teams; tie-break **total NM**.
- **Packing:** assign contiguous waypoint sub-ranges + offset legs into sorties until each ≤ budget.
- **What-if:** run with 1, 2, or 3 teams (known deps); coordinator picks staffing with lowest total sorties.

---

## 7. Coordinator inputs (MVP → full)

### MVP (PR 1 scaffold → Phase 1)

- Flight plan / waypoint sequence (from existing plan or route load)
- Route type + number (for width API)
- 1 team: departure airport, survey side, sortie NM cap
- Lane spacing defaults: first lane 3 NM, then a 6 NM step. A lane past that side’s published width is not flown. There is no extra mile past the published width.

### Phase 2+

- 2–3 teams, dep per team, side assignment
- Opposite-side vs geographic split
- Ferry fudge %
- Max offsets per sortie
- Width overrides
- Scenario save / print brief

---

## 8. Outputs

Per scenario:

- Parsed **width table** (auditable vs ForeFlight)
- **Passes per side per leg**
- Per team: sortie list with waypoint range, offsets, NM breakdown (ferry / along-route / return)
- **G1000 sortie `.fpl` export** per sortie (offset-coordinate user waypoints; no Parallel Track step)
- **Manual Export sortie fragment (.fpl)** (From/To/offsets without running the planner)
- ForeFlight **content pack** reminder card (baseline pack for crews)
- **Total sorties** and **total NM**
- **Entry direction** recommendation (fewest turnarounds / shortest return)
- Disclaimer: **Wing planning aid only**

---

## 9. Implementation phases (this branch)

| Phase | Deliverable |
|-------|-------------|
| **PR 1 scaffold** | Spec, `shared/survey-planning/*`, VR114 width tests, `/api/mtr/width`, console UI shell, route from Flight Plans |
| **Phase 1** | Single-team sortie packer + NM model with multi-offset legs |
| **Phase 2** | Two-team opposite-side compare |
| **Phase 3** | Third team + geographic split + scenario comparison UI |
| **Phase 4** | Export / print coordinator brief; **sortie `.fpl` export + pilot card** |
| **Phase B** | **En-route recovery airport** — staged refuel between sides, compare vs return-home; pilot deconfliction + G1000 second-sortie hints — [COORDINATOR_ENROUTE_RECOVERY_BRIEF.md](./COORDINATOR_ENROUTE_RECOVERY_BRIEF.md) |

---

## 10. Testing fixtures

- **VR114** — asymmetric width change at B; regression for parser and future packer
- **5 NM entire route** — two passes per side, two-sortie mental model
- Unit tests in `tests/coordinatorSurvey.test.mjs` (no live FAA download in CI)
- Sortie `.fpl` route builder: `tests/surveySortieFplRoute.test.mjs`, `tests/g1000SortieFpl.test.mjs`
- G1000 flight validation: [G1000_SORTIE_FPL_FLIGHT_TEST.md](./G1000_SORTIE_FPL_FLIGHT_TEST.md)

---

## 11. Related docs

- [COORDINATOR_SURVEY_CONSOLE_HANDOUT.md](./COORDINATOR_SURVEY_CONSOLE_HANDOUT.md) — wing communication (print/PDF)
- [handouts/Coordinator-Survey-Console-Handout.pdf](./handouts/Coordinator-Survey-Console-Handout.pdf) — same content, ready to email or print
- [PHASE_A_COORDINATOR_PERSISTENCE_BRIEF.md](./PHASE_A_COORDINATOR_PERSISTENCE_BRIEF.md) — Phase A persistence brief for wing leadership
- [COORDINATOR_ENROUTE_RECOVERY_BRIEF.md](./COORDINATOR_ENROUTE_RECOVERY_BRIEF.md) — Phase B en-route refuel / recovery planning brief
- [handouts/Phase-A-Coordinator-Persistence-Brief.pdf](./handouts/Phase-A-Coordinator-Persistence-Brief.pdf) — one-page PDF for Director of Operations
- [handouts/README.md](./handouts/README.md) — all handouts and regenerate commands
- [MTR_DATA_SOURCE_INVESTIGATION.md](./MTR_DATA_SOURCE_INVESTIGATION.md) — NASR vs ArcGIS
- [content-pack-wing-workflow.md](./content-pack-wing-workflow.md) — crew close-out (separate from coordinator planning)
- [G1000_SORTIE_FPL_FLIGHT_TEST.md](./G1000_SORTIE_FPL_FLIGHT_TEST.md) — VR-114 serpentine flight test (offset waypoints, no Parallel Track)
