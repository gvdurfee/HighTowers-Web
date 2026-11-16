# Team Dispatch — product spec

The sidebar label and the page heading are both **Team Dispatch**. Address: `/coordinator/survey` (optional `?plan=<flightPlanId>`).

This is the wing tool for staffing **one, two, or three teams** on a Low Level Route. **1 team** is one aircraft that flies both sides; each sortie lists its own side. Sorties 2 and later are already in flying order; load the file and fly it as listed. Do not invert the flight plan on the G1000. Each sortie is its own `.fpl` file.

**Shipped sortie files.** There is no G1000 Parallel Track. Every lane is user waypoints at the real offset coordinates. The G1000 flies leg to leg between those waypoints, by hand or on autopilot in GPS/NAV. A team file has no published centerline fixes. The download is the `.fpl`.

**Inner and Outer.** Inner is the inside of the piece the crew is assigned. Compass words come from the first lane leg in flying order. With two aircraft, each crew stays on the one side it picked. With one or three aircraft, each sortie lists its side. Pilots fly the side shown.

Team Dispatch is intended for wide-corridor MTRs (for example VR114). Narrow-corridor routes (for example IR111) use the single-aircrew map.

**Rulings.** Miles include the lane-to-lane connectors and the corner extensions, so outer lanes meet at a bend. Save is blocked when any sortie is over the distance limit; the reason says to add a refuel airport or another aircraft. Compare plans uses the same sortie list as Save and shows that plan as a card. One saved sortie list feeds the preview, the review, the planning page, Map View, every `.fpl`, and every total.

**VR114 reference** (A–M1, tracks 2.5 NM then every 5 NM, KLRU / KABQ / KSKX, refuel KTCC, 400 NM). Inner / Outer / Inner is 8 sorties and 2,633.7 NM: KSKX A–B 3 / 1,009.6, KABQ B–E 3 / 968.9, KLRU E–M1 2 / 655.2. The longest sortie is 380.6 NM. Outer / Inner / Outer is 8 sorties and 2,697.6 NM.

## Multi-day surveys: crews resume on their own; the dispatcher can mark where a crew stopped

A crew does not have to finish its piece in one day. Leave the flight plan loaded. The next day, after takeoff, the pilots select the waypoint where they stopped, fly Direct-To it, and continue. The app does not pick day breaks, resume points, or Direct-To help, and the `.fpl` files do not change.

On Map View, a saved team plan can mark each sortie Not started, Stopped at one of that sortie's lane waypoints, or Completed. An optional note and the date are stored with the team plan, in a field beside the sortie list. The map draws the covered survey as a solid blue line and what is left as a dashed orange line. Map View and the sortie brief show `Surveyed X of Y NM (Z%)` for each crew and for the plan. Those miles are survey lane miles only. If a later save changes one sortie's waypoints, only that sortie's mark is cleared, and one notice names it.

**Names.** Team lanes use the crew’s home-field letter, the point, the lane number, and I or O (`QB1O`, `XB2I`). Lane 1 is 2.5 NM from centerline when that is the plan spacing, then every 5 NM. At most 6 characters, A–Z and 0–9. One name is one position across the plan’s files. When the same name would sit at a different place, a letter is inserted before the side letter (`B1AI`). That letter is not a lane number.

**On-screen order** (the page is not a numbered stepper; parentheses are the headings):

1. Crews and aircraft (Teams & parameters)
2. Route (Load the published route)
3. Corridor and tracks (Scenario — Left NM / Right NM and Left offsets / Right offsets are the published sides of the centerline as flown, not the Inner/Outer choice)
4. Segments and refuel (Results)
5. Sortie 1 side (Inner / Outer radios)
6. Results (download each `.fpl`)

Each sortie lists its side; fly the side shown. With three aircraft, neighboring crews are warned when they pick the same side on Sortie 1. Later sorties may share a side because they are on different pieces. Announce entering and exiting each lane by waypoint name, for example “entering XB1O”.

**Map View legend:** “Map: ultramarine centerline with point letters, white edges, yellow sortie tracks, blue arrows.” The drawn centerline is ultramarine `#3F00FF` so it reads on satellite imagery. Edges are white. Tracks are yellow `#FFD911`.

**Not in scope:** ForeFlight corridor display (crews use Military Flight Bag), maintenance scheduling, crew availability, MOA activation, or ATP-quality routing.

**Launch:** Sidebar **Mission Planning** → **Team Dispatch**. Load the published MTR. After staffing, email each sortie `.fpl` to that aircraft’s Mission Pilot.

**Wing handout (print/PDF):** [`docs/handouts/Coordinator-Survey-Console-Handout.pdf`](./handouts/Coordinator-Survey-Console-Handout.pdf) — coordinator and crew communication; source [`COORDINATOR_SURVEY_CONSOLE_HANDOUT.md`](./COORDINATOR_SURVEY_CONSOLE_HANDOUT.md). Regenerate: `npm run handout:coordinator-pdf`.

**Status:** PR 1 scaffold — shared planner modules, `MTR_WDTH` API, UI shell, VR114 parser tests. Sortie packing and multi-team optimization follow in later commits on this branch.

---

## 1. Problem

Wide MTR corridors (for example **VR114**: 20 NM each side on A→B, then 10 NM left and 20 NM right of the centerline as flown on B→M1) need several offset lanes on a side. Wings often assign **two aircraft** from **different departure airports**. With two aircraft, each crew keeps the one side it picked on every sortie. With three aircraft, a later sortie may fly the other side of that crew's piece. Pilots resume a suspended search themselves; the app does not add a resume step. The serpentine flight test for these files is **VR-114 only**.

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
| **Two aircraft** | Each crew stays on the one side it picked for every sortie. |
| **Geographic split** | Three teams, each assigned a segment. Each sortie lists its side. The coordinator chooses Sortie 1 side for each crew. |
| **1 team** | One aircraft flies both sides. Each sortie lists its side. Sorties after the first are already in flying order. |

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
