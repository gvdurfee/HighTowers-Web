# Open items

These are recorded, not fixed. A tolerance that is not already established is not given a number.

## Port

- `docs/TRAINING_VIDEO_SCRIPT.md` line 9 says `http://localhost:5173`.
- Chapter 1 and Chapter 2 cue captures use `http://localhost:5174`: `record-ch1-cues.cjs` line 9, `record-ch2-cues.cjs` line 12, and both cue manifests' `app` field.
- `record-00-introduction.cjs` line 7, `record-03-report-form.cjs` line 8, `record-04-tower-analysis.cjs` line 8, `record-05-export.cjs` line 9, and `record-06-content-pack.cjs` line 8 default to `http://localhost:5173`.

## Per-beat word timestamps

Checked `narration/chapter-00-beats` through `chapter-06-beats` and `narration/ch02-beats`. Every beat id has a `.meta.json`. None of those files contains an `alignment` object.
There is no `narration/chapter-02-beats` directory. Chapter 2 per-beat audio files are `narration/ch02-beats`.
Clip-level word timestamps, not one file per beat id:

- Chapter 1: `playwright/_ch1-sidebar-cues/audio/01-timestamps.json`, `02-timestamps.json`, `03-timestamps.json`.
- Chapter 2: `playwright/_ch2-complete-instructions/audio/01-timestamps.json` through `11-timestamps.json`.

Chapters 00, 03, 04, 05, and 06 have no per-beat word-timestamp file in the sources listed for this spec.
Older `_final-v4` timestamp files exist under the playwright tree. They are not named by the current beat ids and were not used as this spec's timing source.

## Clocks that were not reconciled

- `ch02-timings.json` `narration_dur` is 230.537 s.
- `_ch2-complete-instructions/cues.json` `totalSec` is 202.24 s.
- The approved clip duration is 217.10 s.
- `ch02-timings.json` records `model` `eleven_flash_v2_5` and `speed` 0.8. `.cursor/rules/htw.mdc` locks the current narration path to `eleven_v4` and does not apply that speed to v4. This spec does not change either file.

How far the Chapter 2 cue clock may drift from the timings file before a scene fails: PROPOSED - Video Director to set, Greg to approve.

## Record-script actions with no script narration

- `record-ch2-cues.cjs` lines 624–629 click the Inner sortie radio. The Chapter 2 script does not narrate that control.
- `record-ch2-cues.cjs` lines 654–669 fill Left and Right NM, click `Apply to every segment`, Save, and Fit display to route. The Map View narration does not say those steps.
- The current app label in `src/components/OffsetRoutePanel.tsx` includes `Apply corridor to every segment` (around line 751). The record script still asks for `Apply to every segment` (line 656). Not changed.
- `record-ch1-cues.cjs` line 91 clicks the sidebar item at a highlight cue. Script line 80 says spotlight. Script line 80 also says not to return to Team Dispatch.

## Chapters and sections with no beat file

- Chapter 7 is in the script at lines 310–328, including [RE-RECORD] at line 322. The script says it is not in `generate-chapters-00-02.py`. No `ch07-beats.json`, so no `ch07.md`.
- Appendix A, Appendix B, and Appendix C are in the script and have no `chNN-beats.json`. Appendix A line 335 and Appendix C line 418 are marked [RE-RECORD].
- Title-card narration is in the script and is `title_dur` in the timings files. It has no beat id, so it is not a scene.

## Sortie-export additions

The Draft sortie-export narration (side flown first, separate sortie downloads) was not found in `ch02-beats.json` or in the Chapter 2 narration block. It was not reconstructed.

## Script text that is not the beat text

- Chapter 00 beats whose text is not a substring of that chapter's script section: 06, 07, 08.
- Chapter 01 beats whose text is not a substring of that chapter's script section: 03, 04, 05, 11, 07a.
- Chapter 02 beats whose text is not a substring of that chapter's script section: sequence_7, sequence_8, hotel_1, hotel_3, hotel_4, hotel_5, hotel_6, export_1, export_3, export_4, export_6, export_7, export_8.
- Chapter 03 beats whose text is not a substring of that chapter's script section: 09, 12.
- Chapter 04 beats whose text is not a substring of that chapter's script section: 02b.
- Chapter 05: every beat text occurs inside that chapter's script section after straightening quotes and removing asterisks. Differences can still be punctuation or extra script sentences.
- Chapter 06 beats whose text is not a substring of that chapter's script section: 01, 04.

Extra script narration that the beat files do not contain, from the sections read:

- Chapter 0 script line 62 says Team Dispatch and describes offset waypoints. Beats 07 and 08 say Coordinator Console and additional passes.
- Chapter 1 script lines 78–80 say Team Dispatch, the page heading, weather re-fly, and Map View offset files. `ch01-beats.json` beats 04, 05, and 11 say Coordinator Console, wide corridors, and do not contain the weather re-fly sentence. The cue clip in `_ch1-sidebar-cues/cues.json` matches the script wording, not the beat file.
- Chapter 2 hotel narration, script lines 150–152, gives the spoken coordinates and “The Hotel point is added to the route.” `ch02-beats.json` hotel_1–hotel_7 is the older “in ForeFlight, tap that waypoint” sequence. `cues.json` clip 09 matches the script.
- Chapter 2 sequence, script line 125, says “Sierra Romeo 213 Hotel, in this example is missing from the public source.” Beat sequence_7 says “is often missing.” Cue clip 05 matches the script.
- Chapter 2 export, script lines 166, says to follow the G1000 Pilot's Guide and names Map View and Team Dispatch. Beat export_8 says “Sortie fragments and team assignment files are issued from Coordinator Console, not from this page.” Cue clip 11 matches the script.
- Chapter 3 script line 206 omits “to” in “don't forget come back.” Beat 12 says “don't forget to come back.”
- Chapter 4 script line 226 uses a mismatched quote in `Select Image'`. Beat 02b does not include that stray quote. The long flyover paragraph is one script narration and several beats.
- Chapter 5 script lines 253–254, before the sentence that matches beat 01, narrate the no-new-towers case. That preamble is not in `ch05-beats.json`.
- Chapter 6 script line 294 spells “previosuly” and “Airforce.” Beat 01 spells “previously” and “Air Force.” Beat 04 has no matching ON-SCREEN block.

## Acceptance numbers that are not established

Any allowed difference between a cue time and a beat start, and any allowed extra settle after the 2.000 s hold (`record-ch2-cues.cjs` lines 378–386 records a settle when the wait runs long): PROPOSED - Video Director to set, Greg to approve.
