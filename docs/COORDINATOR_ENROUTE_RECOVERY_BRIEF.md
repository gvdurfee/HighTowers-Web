# HighTowers-Web — En-route recovery (staged refuel) survey planning

**Product brief · Phase B · Team Dispatch**

Wing **what-if** extension for Low Level Route surveys when home base is far from the MTR and crews want to **complete both corridor sides in one flying day** by recovering at an **en-route refuel airport** instead of returning home after the first sortie.

Related: [COORDINATOR_SURVEY_CONSOLE.md](./COORDINATOR_SURVEY_CONSOLE.md) · [PHASE_A_COORDINATOR_PERSISTENCE_BRIEF.md](./PHASE_A_COORDINATOR_PERSISTENCE_BRIEF.md)

---

## Purpose

Today the sortie planner models every sortie as **home → survey → home**. That fits teams based near the route (e.g. KABQ for VR114) but **overstates ferry NM** when:

- Home base is distant from the MTR.
- Corridor half-width is **narrow (e.g. 5 NM)** — fewer offset lanes per side, so survey legs are short but ferry dominates the budget.
- Two aircraft fly **opposite sides** and each could **refuel near the route** between sides instead of flying home mid-day.

**Phase B** adds one **shared recovery / refuel airport** per scenario (coordinator-selected, ideally closest practical field near the MTR). Every aircraft uses the **same** refuel airport; each team keeps its own **home** departure. The planner can compare:

| Model | Sortie 1 ferry in | Sortie 1 ferry out | Sortie 2 ends at |
|-------|-------------------|--------------------|------------------|
| **Current (return home)** | Home → route entry | Route exit → **home** | Home |
| **En-route recovery** | Home → route entry (can be **long**) | Route exit → **shared refuel** (should be **short**) | **Home** |

Sortie 2 departs the **shared refuel** airport; along-route work may use a **different fragment** per aircraft if the optimizer finds that more efficient.

Objective remains: minimize **wing sorties** and **wing NM** within the per-sortie budget (400–500 NM), with tie-breakers unchanged.

---

## Shared recovery airport (coordinator input)

- **One refuel airport per scenario** — not per team. All aircraft recover at the same field for sortie 1 and depart from it for sortie 2.
- Coordinator picks the airport (lookup in the console; Phase B may later **suggest** the closest practical field to the route).
- **Single aircraft:** sortie 1 destination is that refuel airport; sortie 2 returns **home**.
- **Multiple teams:** each aircraft’s **home** may differ; **refuel airport is common** to the whole wing day.
- **ForeFlight / flight-plan prep:** crews may leave the **destination blank** while building the route waypoints; home = sortie 1 departure. The survey planner holds the refuel ICAO for ferry math and `.fpl` export.

### Sortie 1 ferry economics (why two sorties fit one day)

| Leg | Path | Typical length |
|-----|------|----------------|
| **Ferry in** | Home → route entry | Can be **long** (distant home base) |
| **Along route** | Offset lanes on the assigned segment | Often **short** on 5 NM corridors |
| **Ferry out** | Route exit → **shared refuel** | Should be **short** (refuel near the MTR) |

Avoiding **route exit → home** on sortie 1 is what makes a second sortie the same day feasible. Sortie 2: **refuel → route entry**, opposite side, **route exit → home**.

---

## Problem Phase B solves

| Situation today | After Phase B |
|-----------------|---------------|
| Planner forces return home after each sortie | Intermediate sorties recover at **en-route refuel**; **last sortie of the day** returns **home** |
| Coordinator cannot quantify “single day with fuel stop” | **Compare** return-home vs staged-recovery staffing side by side |
| Narrow (5 NM) routes look “easy” on offsets but fail on ferry | Ferry legs use **home / shared refuel / route** endpoints per sortie index |
| Multi-aircraft SOP lives only in verbal brief | Console hints document **pilot deconfliction** and **G1000 second-sortie** workflow |

**Phase B does not model:** fuel gallons, FBO hours, pump availability, MOA scheduling, or ATC separation — coordinators and pilots verify operationally.

---

## Pilot and multi-aircraft responsibilities (SOP reference)

These rules apply whenever **multiple aircraft** survey the same corridor segment. They belong in **hints, pilot briefs, and wing handouts** — not in automated separation logic.

1. **Deconfliction is pilot responsibility.** Stay in **radio contact** with the other survey aircraft. **Stagger takeoff times** so opposite-side or sequential legs do not conflict in the corridor. Announce when you enter and exit each lane, giving your position by waypoint name (for example, entering B1O).
2. **Sortie 1 destination** for every aircraft is the **same shared recovery / refuel airport** (not home), when the coordinator selects en-route recovery mode.
3. **Sortie 2 (the other side)** — after refuel at the **shared** field, each pilot flies the assigned side (the file may **differ per aircraft**) and returns **home**. The sortie `.fpl` already lists that side’s offset waypoints.
4. **Waypoint assignment per sortie** follows the planner’s ranges. Removing fixes from the **active flight plan** does **not** delete user waypoints from G1000 memory — only from that active plan. Delete old user waypoints before loading a new card, because short names can repeat and the G1000 may keep an old waypoint’s stored coordinates.
5. **Offset lanes are in the file.** Every lane is user waypoints at the real offset coordinates. Do not set a G1000 offset. Fly leg to leg, by hand or with the autopilot in GPS/NAV. Pilots deconflict by announcing entry and exit positions, keeping radio contact, and staggering takeoff times.

---

## What we will build (scope)

### Planner (shared/survey-planning)

1. **Airports:** per-team **home** (existing departure) + one **shared recovery** airport for the whole scenario.
2. **Ferry rules by sortie index within a flying day:**
   - **Sortie 1:** ferry **in** = home → route entry; along route; ferry **out** = route exit → **shared recovery**
   - Middle sorties (if any): recovery → entry; survey; exit → recovery
   - **Sortie 2 (last of day):** recovery → entry; survey; exit → **home**
3. **Fragment assignment:** sortie 2 waypoint ranges may **differ per aircraft** when that reduces wing NM or sortie count.
4. **Flying-day grouping** in results (Sortie 1 / 2 labels) for coordinator briefs.
5. **Compare mode extension:** return-home each sortie vs en-route recovery (1-team sequential and 2-team opposite-side scenarios).
6. **Fixture:** 5 NM entire-route width + distant home(s) + one shared recovery airport near route (unit tests, no live FAA in CI).

### UI (Team Dispatch)

1. **Shared recovery airport** lookup (one field for the scenario; used by all teams).
2. Toggle or planner mode: **Return home each sortie** vs **En-route recovery between sides**.
3. Results columns: ferry **in** / **out** endpoints (recovery vs home) where relevant.
4. **Guided hints** and quick-reference copy for deconfliction and G1000 second-sortie workflow (see above).

### Export (.fpl)

1. Sortie 1 `.fpl`: home → serpentine → **recovery** airport.
2. Sortie 2 `.fpl`: **recovery** → the other side’s offset waypoints → **home**. The file lists that side. Do not build the offset on the G1000.
3. Pilot brief modal: note recovery airport and sortie role (first side / second side / return home). The card says Sortie 2 is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Sortie 2 is its own `.fpl` file.

**Out of scope for Phase B:** Phase A scenario persistence (can follow or overlap); automatic NOTAM/FBO lookup; fuel burn modeling.

---

## Worked example (conceptual)

**Route:** IR1xx, 5 NM either side, four waypoints A→D.  
**Home:** KABC (200 NM from route).  
**Recovery:** KXYZ (15 NM from midpoint).  
**Budget:** 500 NM per sortie.

**Return-home model (current):**  
Sortie 1 inner: KABC → A→D inner passes → KABC (~420 NM).  
Sortie 2 outer: KABC → A→D outer passes → KABC (~420 NM).  
Two calendar days if crew cannot fly both safely after ferry.

**En-route recovery model (Phase B):**  
Sortie 1 inner: KABC → A→D inner → **KXYZ** (~310 NM).  
Ferry **in** KABC→A is long; ferry **out** D→**KXYZ** is short (shared refuel near route).  
Ground refuel at **KXYZ** (same field for all wing aircraft that day).  
Sortie 2 outer: KXYZ → A→D outer → **KABC** (~295 NM). Sortie 2 fragment may differ per team if optimizer assigns different sub-ranges.  
**Single flying day** per aircraft; two aircraft on opposite sides use the **same** recovery field with **staggered takeoffs** and **radio deconfliction**.

---

## Implementation phases (relative to current console)

| Phase | Deliverable |
|-------|-------------|
| **Now (docs + hints)** | This brief; coordinator quick reference; pilot brief SOP for recovery days |
| **Phase B1** | Ferry endpoint logic in `surveySortiePacker.js` + tests |
| **Phase B2** | Console inputs, compare return-home vs recovery |
| **Phase B3** | `.fpl` export dep/dest per sortie role; pilot brief fields |
| **Phase A** (same time as B) | Save/load scenarios including recovery airport choices |

---

## Recommendation

Proceed with **Phase B** after or in parallel with **Phase A** persistence. Priority audiences:

- Wings surveying **5 NM** corridors from **distant** home bases.
- **Two-team opposite-side** days staged at one en-route field.
- Coordinators who need a **numeric brief** for “single day with refuel” vs “two days return-home.”

---

## Decision requested

- [ ] Approve Phase B scope (**single shared** recovery airport + compare mode + pilot SOP in hints).
- [ ] Confirm wing SOP: pilot deconfliction, staggered takeoffs, G1000 active-plan trim for sortie 2.
- [ ] Nominate a **5 NM** route + home/recovery airports for first flight-test validation after B2.

---

*Revision: 2026-06 — initial brief; shared recovery airport and sortie 1 ferry in/out terminology.*
