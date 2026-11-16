# Team Dispatch — Wing handout

**HighTowers-Web** · Wing planning aid for Low Level Route tower surveys  
**Audience:** Wing coordinators, squadron leadership, and the pilots who fly the sortie files.

The sidebar name and the page heading are both **Team Dispatch** (Mission Planning). The address is `/coordinator/survey`.

---

## What the sortie file is

There is **no G1000 Parallel Track** in these files. Every lane is its own set of user waypoints at the real offset coordinates. The G1000 navigates leg to leg between the loaded user waypoints. Fly by hand, or with the autopilot in GPS/NAV mode.

The download is the `.fpl`. Before you start each lane, confirm the aircraft symbol is on the intended yellow track on both the ForeFlight moving map and the G1000 MFD (multi-function display) map.

---

## Inner and Outer

**Inner** is the side toward the inside of the route’s overall curve, as seen on the map. **Outer** is the other side.

If the route is nearly straight or S-shaped, it has no clear inside. The app then uses Inner = left of the route as flown from the entry point, and it says so on the Sortie 1 side picker: “This route has no clear inside; Inner = left of the route flown from [entry point].”

The side picker always shows which side is Inner. Pilots go by the side shown on the picker, not by their own reading of the map.

The picker labels are **Inner (inside the route’s curve)** and **Outer (outside the route’s curve)**.

---

## Waypoint names

**Solo Flight Plans.** Point letters, the lane number, then I or O. Examples: `A1I`, `A1O`. Each sortie lists its side; fly the side shown. The file is already in flying order.

**Team Dispatch.** Point letters, the lane number, then I or O. Examples: `B1O`, `XM2I`.

Think of the first one or two letters as the MTR point the waypoint is offset from. The 1, 2, or 3 is the offset lane of the serpentine route the G1000 flies to cover the corridor, counted outward from the centerline. The last letter says Inner or Outer.

A rare repeat on the same lane adds a digit (example: `B12I`).

Names are at most 6 characters, A–Z and 0–9 only, and unique within each file. A solo name drops the leading zero only when that is needed to fit (example: `XYZ01I`).

Lane offsets are real distances stated for that plan (often 3, 9, and 15 NM). Lane 1 is closest to the centerline. A team `.fpl` contains no published centerline fixes.

---

## Before the SD card

Not a concern: per the Director of Operations, user waypoints and the flight plans that created them are erased after each mission. Confirm no leftover user waypoints before loading, because short names repeat between routes. After import, spot-check one waypoint’s coordinates against the plan.

Follow the G1000 Pilot's Guide for importing user flight plans from the SD card.

---

## How dispatchers staff a route

Team Dispatch staffs **one, two, or three teams**. **1 team** is one aircraft. Each sortie lists its side; fly the side shown. A later sortie is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Each sortie is its own `.fpl` file.

The screen is one page, not a numbered wizard. Work it in this order. The words in parentheses are the headings on the screen today:

1. **Crews and aircraft** (Teams & parameters — look up each team’s departure).
2. **Route** (load the published MTR; the empty page says “Load the published route”).
3. **Corridor and tracks** (Scenario — corridor and lane spacing). Published widths are **Left NM** and **Right NM** of the centerline as flown. Lane lists are **Left offsets** and **Right offsets**. Those fields are not the Inner/Outer choice.
4. **Segments and refuel** (Results — segment from/to and the refuel stop).
5. **Sortie 1 side** (the Inner / Outer radios).
6. **Results** (download each sortie `.fpl` and email it to that aircraft’s Mission Pilot).

With two aircraft, each crew keeps the one side it picked on every sortie. With three aircraft, a later sortie may fly the other side of that crew's piece. This is not guaranteed separation; pilots still deconflict. Announce when you enter and exit each lane, giving your position by waypoint name (for example, entering B1O). Keep radio contact and stagger takeoff times. Pilots resume a suspended search themselves.

The aircraft-count choice **1 team** is one aircraft. Each sortie lists its side; fly the side shown. A later sortie is already in flying order; load it and fly it as listed. Do not invert the flight plan on the G1000. Each sortie is its own `.fpl` file. With two aircraft, each crew keeps one side on every sortie. With three aircraft, a later sortie may fly the other side of that crew's piece. Pilots resume a suspended search themselves.

---

## Map View

The map legend reads: “Map: ultramarine centerline with point letters, white edges, yellow sortie tracks, blue arrows.” The centerline color is `#3F00FF`.

The centerline is the published route, labeled with the published point letters only. Corridor edges are white. The sortie tracks are yellow. Direction arrows are blue. The highlighted sortie is drawn through the same coordinates as the labels and the `.fpl`.

---

## Who uses what

| Role | Uses |
|------|------|
| **Wing coordinator** | Team Dispatch — two or three teams, sortie `.fpl` files |
| **Aircrew** | Flight Plans, Map View, tower analysis, the Air Force report |
| **Wing administrator** | Content pack console — separate from Team Dispatch |

---

## Disclaimer

**Wing planning aid only.** Verify the corridor in ForeFlight Military Flight Bag before flying. Go by the Sortie 1 side the app shows.

---

*Printable PDF: `docs/handouts/Coordinator-Survey-Console-Handout.pdf` (regenerate with `npm run handout:coordinator-pdf`).*
