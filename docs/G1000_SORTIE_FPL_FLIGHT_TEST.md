# G1000 sortie `.fpl` — flight test checklist

The serpentine flight test is flown on **VR-114 only**.

Use this list when you load a Team Dispatch sortie file, or a solo offset sortie downloaded from Map View, and check it on the airplane or in the simulator.

The file does **not** use G1000 Parallel Track. Every lane is its own set of user waypoints at the real offset coordinates. The G1000 flies leg to leg between those waypoints, by hand or with the autopilot in GPS/NAV mode. Do not turn Parallel Track on.

---

## What you should see in the file

- **Team Dispatch names** are the MTR point, then the lane number, then I or O. Example: `B1O`, `XM2I`. Think of the first one or two letters as the MTR point the waypoint is offset from. The 1, 2, or 3 is the offset lane of the serpentine route, counted outward from the centerline. The last letter says Inner or Outer. A rare repeat on the same lane adds a digit (example: `B12I`).
- **Solo Flight Plan names** are the point letters, a 3-digit route position, then I or O. Example: `A001I`, `A001O`. Sortie 1 flies the side chosen on the flight plan. Sortie 2 flies the other side, and its waypoints are listed in reverse order in the file. A name drops the leading zero only when that is required to stay within 6 characters (example: `XYZ01I`).
- Names are at most 6 characters, letters and digits only, and unique inside that file.
- Lane distances are the ones stated for that plan (often 3, 9, and 15 NM). Lane 1 is the lane closest to the centerline.
- A team file has **no published centerline fixes**. The survey points in the file are the offset lanes.
- Inner and Outer come from the route’s overall curve, as shown on the Sortie 1 side picker. Go by the side the picker shows.

---

## Before you load the card

- [ ] Not a concern: per the Director of Operations, user waypoints and the flight plans that created them are erased after each mission. Confirm no leftover user waypoints before loading, because short names repeat between routes.
- [ ] Confirm the HighTowers plan still has the published route you mean to fly.

Follow the G1000 Pilot's Guide for importing user flight plans from the SD card.

---

## After import (VR-114 serpentine)

- [ ] Open the active route. It should run from the departure airport, through the offset user waypoints, to the landing airport for that sortie.
- [ ] Spot-check one user waypoint’s coordinates against the plan.
- [ ] Before you start each lane, confirm the aircraft symbol is on the intended yellow track on **both** the ForeFlight moving map and the G1000 MFD (multi-function display) map.
- [ ] Fly or simulate the lane in GPS/NAV. Spacing should match the offsets named in the pilot brief for that file.
- [ ] At a sharp turn, stay on the loaded flight plan. The file already places the offset through the turn. Do not select Parallel Track.

The sortie download is the `.fpl`.

---

## After the sortie

- [ ] Delete the survey user waypoints from the G1000 when the route is finished, so the next route does not reuse a short name with old coordinates.
- [ ] Write down any avionics quirk in the wing training notes, including the G1000 software version.

---

## Related

- [COORDINATOR_SURVEY_CONSOLE.md](./COORDINATOR_SURVEY_CONSOLE.md) — Team Dispatch
- [COORDINATOR_SURVEY_CONSOLE_HANDOUT.md](./COORDINATOR_SURVEY_CONSOLE_HANDOUT.md) — pilot and dispatcher handout
- [TRAINING_VIDEO_SCRIPT.md](./TRAINING_VIDEO_SCRIPT.md) — crew workflow
