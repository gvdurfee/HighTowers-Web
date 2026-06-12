# Coordinator Survey Console — product spec

Wing **coordinator what-if planner** for Low Level Route tower surveys: given MTR waypoint geometry, NASR corridor width text, team departure airports, and a per-sortie distance budget, recommend **how many sorties** each team needs and **which sequential waypoint ranges** to assign—minimizing total wing sorties.

**Not in scope:** ForeFlight corridor display (crews use Military Flight Bag), maintenance scheduling, crew availability, MOA activation, or ATP-quality routing.

**Launch:** Flight Plans → **Coordinator Survey Console** (bookmark `/coordinator/survey`; optional `?plan=<flightPlanId>`).

**Wing handout (print/PDF):** [`docs/handouts/Coordinator-Survey-Console-Handout.pdf`](./handouts/Coordinator-Survey-Console-Handout.pdf) — coordinator and crew communication; source [`COORDINATOR_SURVEY_CONSOLE_HANDOUT.md`](./COORDINATOR_SURVEY_CONSOLE_HANDOUT.md). Regenerate: `npm run handout:coordinator-pdf`.

**Status:** PR 1 scaffold — shared planner modules, `MTR_WDTH` API, UI shell, VR114 parser tests. Sortie packing and multi-team optimization follow in later commits on this branch.

---

## 1. Problem

Wide MTR corridors (e.g. **VR114**: 20 NM each side on A→B, asymmetric 10 L / 20 R on B→M1) require multiple **G1000 parallel track** passes per side. Wings often assign **two aircraft** from **different departure airports**, each surveying **opposite sides** of the centerline for safety.

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

For one **side** and one **assigned waypoint chain** (e.g. three waypoints → two legs):

1. Ferry: **team departure → closest waypoint** in assignment (entry).
2. Fly along the chain at offset **O₁** (e.g. 3 NM) toward the far end of the assignment.
3. **Turn around** at the last waypoint; fly back at **O₂** (e.g. 9 NM).
4. Repeat for all offsets on that side for that width span (e.g. 15 NM out, 21 NM back for 20 NM half-width).
5. **Return to departure airport** from the last leg’s end.

Offsets are **1 NM multiples** on the G1000. Default wing policy (configurable):

- First offset: **3 NM**
- Step: **6 NM** between track centers
- Outer margin: **+1 NM** past published half-width (e.g. 21 NM for a 20 NM corridor)

**Offset order:** inner-out (3→9→15→21) or outer-in; optimizer picks orientation and order that **minimizes total NM** and **turnarounds** when tied.

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
| **Opposite-side** | Team 1 = left offsets only; Team 2 = right only; same geography |
| **Geographic split** | Team 1 = waypoints A→D; Team 2 = D→M1 (etc.) |
| **Single team** | Both sides sequentially, or one side only |

Entry waypoint per team: **closest** in the coordinator’s sequence to that team’s departure (not user-picked).

Return: **same departure airport** unless a later version adds alternate recovery fields.

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
- Offset policy defaults (3 / 6 / +1)

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
| **Phase 4** | Export / print coordinator brief |

---

## 10. Testing fixtures

- **VR114** — asymmetric width change at B; regression for parser and future packer
- **5 NM entire route** — two passes per side, two-sortie mental model
- Unit tests in `tests/coordinatorSurvey.test.mjs` (no live FAA download in CI)

---

## 11. Related docs

- [COORDINATOR_SURVEY_CONSOLE_HANDOUT.md](./COORDINATOR_SURVEY_CONSOLE_HANDOUT.md) — wing communication (print/PDF)
- [handouts/Coordinator-Survey-Console-Handout.pdf](./handouts/Coordinator-Survey-Console-Handout.pdf) — same content, ready to email or print
- [MTR_DATA_SOURCE_INVESTIGATION.md](./MTR_DATA_SOURCE_INVESTIGATION.md) — NASR vs ArcGIS
- [content-pack-wing-workflow.md](./content-pack-wing-workflow.md) — crew close-out (separate from coordinator planning)
