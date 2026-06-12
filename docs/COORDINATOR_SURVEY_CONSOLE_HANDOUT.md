# Coordinator Survey Console — Wing handout

**HighTowers-Web** · Wing planning aid for Low Level Route tower surveys  
**Audience:** Wing coordinators, squadron leadership, and aircrew who need to understand how staffing decisions are made.

---

## What this tool is

The **Coordinator Survey Console** helps a wing coordinator answer:

- How many **sorties** does each team need?
- Which **contiguous MTR waypoint ranges** should each aircraft fly?
- How do **1 vs 2 vs 3 teams** compare on **total wing sorties**?

It uses **NASR corridor width**, your **flight-plan waypoint sequence**, **departure airports you choose**, and a **per-sortie distance budget** (typically 400–500 NM). It models **G1000 parallel-track offsets** on each side of the centerline.

**It is not:** a weather tool, MOA planner, ATC product, or ForeFlight replacement. Crews still fly corridors in **ForeFlight Military Flight Bag**.

---

## Who uses what

| Role | Uses |
|------|------|
| **Wing coordinator** | Coordinator Survey Console — staffing what-if, sortie briefs |
| **Aircrew** | Main app — flight plans, tower analysis, maps, PDF export, content packs |
| **Wing administrator** | Content Pack console — pack lifecycle (separate from coordinator planning) |

---

## How coordinators work in practice

1. **Start with available squadrons** — CAP teams operate from airports near their home base. The tool does **not** pick airports for you; you enter the teams that can participate.
2. **Build or open a flight plan** for the MTR and open the console from **Flight Plans**.
3. **Run a what-if** — enter Team 2 and/or Team 3 departure airports; choose planner mode or **Compare 1 vs 2** / **Compare 2 vs 3**.
4. **Brief teams** — each team gets sortie rows: waypoint from→to, offsets, ferry in / along-route / ferry out NM.
5. **Re-run when the roster changes** — if weather or availability drops a team the day before:
   - Recalculate with **two teams** and re-brief waypoint assignments, **or**
   - **Replace** the dropped team with another squadron’s airport and re-run (other teams may get new segments too).

> **Management one-liner:** The coordinator names which teams and airports can play; HighTowers calculates how to divide the route and sorties to cover the MTR with the fewest flights practical under the distance cap—and you can re-run when the roster changes.

---

## Planner modes (quick reference)

| Mode | Idea |
|------|------|
| **1 team** | One aircraft: **inner then outer** passes on the **full route** from one base. |
| **2 teams** | **Parallel staffing:** Team 1 = one side of the corridor, Team 2 = the other; **same geography**, different bases. |
| **3 teams** | **Geographic split:** Route cut into **three segments**; each team flies **both sides** of its segment. The optimizer picks **where to split** and **which base serves which segment** (fewest total sorties, then NM). |
| **Compare 1 vs 2** | One aircraft (full corridor, both sides sequential) vs two aircraft (opposite sides). |
| **Compare 2 vs 3** | Two aircraft (opposite sides) vs three aircraft (geographic split). |

Use **Compare** when you have a **surplus** of squadrons statewide and need to decide how many teams to assign.

---

## What the optimizer does (and does not do)

**Does:**

- Minimize **total wing sorties**; tie-break **total NM**.
- Pack contiguous waypoint chains into sorties that fit the **NM budget**.
- Include **ferry** legs (base ↔ route) and **parallel-track** legs in each sortie’s distance.
- For each sortie, pick the **best end** of the assigned chain to start from (shortest total NM for that sortie).
- For **3-team geographic** mode, search segment boundaries and team-to-segment assignments.

**Does not:**

- Choose which CAP squadrons or airports to use (coordinator input).
- Change the MTR waypoint list (comes from the flight plan).
- Replace ForeFlight corridor display or wing weather judgment.

---

## Reading the results

| Label | Meaning |
|-------|---------|
| **Inner / Outer** | Left and right of MTR centerline (offset lists differ on asymmetric spans, e.g. VR114 B→M1). |
| **Offsets (3, 9, 15…)** | G1000 parallel-track spacing in NM (default policy: 3 → 9 → 15 → +1 NM past published half-width). |
| **Ferry in / out** | Departure airport ↔ route entry or exit for that sortie. |
| **Along route** | Directed offset legs on the assigned waypoint chain. |
| **⚠ in Total** | Sortie exceeds the NM budget — consider a shorter segment or more teams. |
| **Geographic split** | Shared boundary waypoints; tool assigns segments to bases. |

---

## URLs (NM Wing pilot hosting)

| Purpose | URL |
|---------|-----|
| **Crew app** | `https://gvdurfee.github.io/HighTowers-Web/` |
| **Coordinator console** | Flight Plans → **Coordinator Survey Console**, or `/coordinator/survey?plan=<flightPlanId>` |
| **Wing admin (content packs)** | `/admin/content-packs` — wing staff only; not in the main sidebar |

After updates on `main`, **hard refresh** the browser (Cmd+Shift+R). The static app rebuilds on GitHub Pages; the API on Railway updates automatically when `server/` changes.

---

## Disclaimer

**Wing planning aid only.** Verify corridors and procedures in **ForeFlight Military Flight Bag** before flying.

---

## Related documentation (in repo)

- `docs/COORDINATOR_SURVEY_CONSOLE.md` — technical product spec
- `docs/content-pack-wing-workflow.md` — crew close-out and ForeFlight packs (separate from coordinator planning)
- `docs/FIRST_TIME_WING_ADMIN_RUNBOOK.md` — hosting and wing admin setup

*Printable PDF: `docs/handouts/Coordinator-Survey-Console-Handout.pdf`*
