# HighTowers-Web — Phase A: Wing Coordinator Persistence

**Brief for Director of Operations** · New Mexico Wing · Low Level Route tower surveys

---

## Purpose

HighTowers-Web supports **crew mission work** (flight plans, tower analysis, reports, content packs) and a **Coordinator Survey Console** (sortie planning when teams or weather change). Today, **coordinator plans are not saved on the server**—they exist only in the coordinator’s browser until re-entered.

**Phase A** adds **wing-level persistence for coordinator scenarios** so replanning does not mean starting over, and published sortie briefs can be **reopened and shared** by reference.

---

## Problem Phase A solves

| Situation today | After Phase A |
|-----------------|---------------|
| Coordinator builds a 2- or 3-team plan; weather drops a crew next day | Reopen the **same scenario**, change airports/teams, re-run, publish **updated brief** |
| Coordinator and crews need a common reference | **Published scenario** links to the flight plan and documents sortie assignments |
| Browser refresh or different laptop loses planner inputs | Scenario **saved on the wing API** (Railway), not only in the browser |

**Phase A does not yet solve:** pilot sets up a mission on one device and airborne photographer completes analysis on another (**Phase C**—mission sync across users). Training SOP should state that **crew close-out stays on one browser profile** until Phase C.

---

## What we will build (scope)

1. **Save coordinator scenario** — flight plan reference, team airports, planner mode, sortie budget, results (sortie list per team).
2. **Load / list scenarios** — by route or campaign name for the season.
3. **Version or republish** — new version when roster or weather changes (e.g. “v2 after Team 2 cancel”).
4. **Shareable brief** — printable or linkable summary for aircrew (waypoint ranges, offsets, ferry legs).
5. **Hosting** — same stack as today: **GitHub Pages** (app) + **Railway** (API + SQLite).

**Out of scope for Phase A:** syncing crew missions, tower photos, or report data across devices (Phase C).

---

## Who uses what

| Role | Tool | Phase A change |
|------|------|----------------|
| **Wing coordinator** | Coordinator Survey Console | Can **save, reload, and republish** plans |
| **Aircrew** | Main app | Receive **coordinator brief**; crew workflow unchanged |
| **Wing administrator** | Content Pack console | Unchanged |

---

## Training and SOP (interim, until Phase C)

1. **Coordinator** saves and republishes scenarios after roster or weather changes.
2. **Crew mission setup and post-flight analysis** should use the **same browser/device** when pilot and photographer are different people—or explicit handoff until Phase C.
3. **Artifacts of record** remain: Air Force PDF, updated content pack ZIP, wing folder storage.
4. **Live app URL:** `https://gvdurfee.github.io/HighTowers-Web/`

Training is the right time to collect wing feedback; Phase A can ship incrementally while training proceeds on current crew workflows.

---

## Why Phase A now (not Phase C)

| | Phase A | Phase C (later) |
|---|---------|------------------|
| **Effort** | Moderate; extends existing Railway API | Larger; photos, conflicts, multi-user crew data |
| **Risk** | Low; coordinator-only data | Higher; privacy, sync, support |
| **Value** | Immediate for coordinator replanning | Required for pilot/photographer split across devices |
| **Timing** | Aligns with coordinator console already live | After training feedback and SOP maturity |

---

## Recommendation

Approve **Phase A** as the next development increment: **persist coordinator survey scenarios on the wing API** so operations can rely on replanning and shared briefs when the app becomes mandatory post-training. Defer **Phase C** until after training surfaces priority improvements from the flying community.

---

## Decision requested

- [ ] Approve Phase A scope for development after training (or in parallel if coordinator replanning is urgent).
- [ ] Confirm interim SOP: crew data single-browser until Phase C; coordinator uses saved scenarios once Phase A is deployed.
- [ ] Use training to log enhancement requests for post–Phase A prioritization.

---

*Printable PDF: `docs/handouts/Phase-A-Coordinator-Persistence-Brief.pdf`* · Regenerate: `npm run handout:phase-a-pdf`
