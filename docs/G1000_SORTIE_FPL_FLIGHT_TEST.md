# G1000 sortie `.fpl` — flight test checklist

Manual validation for **Coordinator Survey Console → Export .fpl** (or **Flight Plan detail → Export sortie fragment**).

Use one real sortie before wing-wide rollout — VR114 **C→M1** with four offsets (3, 9, 15, 21 NM) from **KABQ** is a good first case.

---

## Before import

- [ ] Clear or review existing **survey user waypoints** in the G1000 per wing SOP.
- [ ] Confirm the linked flight plan in HighTowers has the full route waypoint sequence loaded.
- [ ] Run the coordinator planner (or manual fragment export) and note **Start at**, **Offsets**, and **side** from the pilot brief modal.

---

## Import

- [ ] Import the downloaded `.fpl` via your usual G1000 flight-plan transfer method.
- [ ] Open **User Waypoints** — each MTR name in the sortie fragment appears **once** with correct coordinates.
- [ ] Open the **active route** — order should show:
  - Departure (team base, e.g. KABQ)
  - Serpentine traversal along the fragment (outbound / inbound legs alternating)
  - Return to the same departure airport

---

## Parallel track

- [ ] Activate **Parallel Track** for the **first offset** and correct **left/right** side before the first survey leg.
- [ ] Fly or simulate the first outbound leg; confirm track spacing matches the brief.
- [ ] At the turnaround, set the **next offset** before the inbound leg (per pilot brief list).

---

## Heading mode at sharp turns (>120°)

- [ ] Identify at least one MTR kink where parallel track drops or GPS goes direct to the next fix.
- [ ] Use **Heading** mode to hold offset manually through the turn.
- [ ] Re-enable **Parallel Track** in the flight plan menu, then return to **GPS** navigation.
- [ ] Document which waypoint pairs need this SOP for your airframe/software version.

---

## Limits and cleanup

- [ ] Note total **route-point count** from the pilot brief; confirm the G1000 accepts the full active route (warning appears in-app above ~30 user route points).
- [ ] After the sortie (or sim), remove or archive survey user waypoints per wing SOP.
- [ ] Record any avionics quirks in wing training notes.

---

## Related

- [COORDINATOR_SURVEY_CONSOLE.md](./COORDINATOR_SURVEY_CONSOLE.md) — planner model and outputs
- [TRAINING_VIDEO_SCRIPT.md](./TRAINING_VIDEO_SCRIPT.md) — crew workflow (Chapter 2 flight planning)
