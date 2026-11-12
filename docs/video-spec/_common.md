# Common video rules

Status: Draft. These are the shared rules. A chapter file overrides nothing here unless it cites a source for that scene.

The approved spec is the authority for a scene once its status is Approved. This file is the shared part of that spec.

## View transition, italic cues, and the button outline

Copied from `docs/TRAINING_VIDEO_SCRIPT.md` lines 24–35:

```
24: - **VIEW TRANSITION** — production timing only. Do not speak this rule. Order of priority for a view change:
25:   1. Keep the current working view visible throughout all narration that gives directions for its controls, including the final Create or Update instruction.
26:   2. After that complete instruction beat ends, hold the same view for 2.000 seconds.
27:   3. Only then click the control that navigates.
28:   4. Once the destination is ready, begin the narration that explains the destination.
29:   - Apply this to view changes, not typing, highlighting, or other actions within the same view. A view transition replaces the main working screen: form-to-detail, detail-to-correction form, correction form-to-detail, detail-to-Map View, and Map View-to-detail. It is not scrolling, typing, highlighting, opening a lightbulb, a routine save within the same view, or showing a download notification. A modal alone is not a new view for this rule.
30:   - The outgoing view stays up through the directions for that view, then holds for 2.000 seconds. The navigation click comes after that hold. Do not put the hold on the destination, and do not leave an outgoing instruction playing after the click.
31:   - An italic cue never causes the navigation click and never inserts the two-second hold before its command word. The cue may point at or highlight the named control while the direction is spoken. Do not split a sentence to put the hold before the command word.
32:   - Narration that explains the destination starts after the destination is ready. Where a beat mixes an outgoing instruction and an incoming explanation, divide only at a clean sentence boundary and keep every word in order.
33:   - One intentional two-second hold per qualifying transition. A load or save wait is separate. It is not a substitute for the hold, and it is not inserted inside a spoken word or sentence.
34:   - Do not add a two-second hold before every ON-SCREEN block. Same-view actions keep their existing spoken cues and timing.
35: - **BUTTON OUTLINE** — production only. Do not speak this rule. Outline the relevant button while the narration explains pressing it. Keep the outline until the press or the next cue, then clear it. The outline must not cover text or shift layout, and it adds no pauses and no audio changes.
```

The 2.000 s hold is the presentation hold. A load or save wait is separate. It does not replace the hold, and it is not inserted inside a spoken word or sentence. Script lines 31–33.

An italic cue emphasizes the named control. It does not cause the navigation click and it does not insert the hold before the command word. Script line 31.

## Button outline class

The script states the outline rule and does not name the CSS. The Chapter 2 capture adds class `ht-tour-hl` in `playwright/record-ch2-cues.cjs` lines 338–347: `box-shadow: inset 0 0 0 2px #FFD911`. The outline is cleared in `clearEmphasis` at lines 349–353.

Chapter 1 uses a different class, `ht-cue`, in `playwright/record-ch1-cues.cjs` lines 14–21: `box-shadow: inset 0 0 0 2px rgba(255, 217, 17, 0.95)`. Same inset weight and the same yellow. Not the same class name.

## Output

Chapter 1 and Chapter 2 captures set a 1920×1080 viewport and `recordVideo` at 30 fps: `record-ch1-cues.cjs` lines 61–66 and `record-ch2-cues.cjs` lines 201–206.

`mux-ch2-cues.py` and `mux-ch1-cues.py` encode H.264 (`libx264`), AAC, `yuv420p`, 1920×1080, 30 fps. The Chapter 2 cue manifest's ffprobe line records `h264`, 1920×1080, `yuv420p`, `30/1`, and `aac`.

Loudness is normalized by `match_loudness` in `playwright/generate-chapters-00-02.py`. The established targets in that file, lines 29–30, are `MATCH_LUFS = -29.1` and `MATCH_TRUE_PEAK = -9.0`. No other loudness tolerance is set here.

## Locked narration

Copied from `.cursor/rules/htw.mdc`:

- Playwright and `@playwright/test` are pinned at 1.65.0. The capture browser is Chrome for Testing 158.0.8127.18. Node is 24.16.0.
- Narration is the Python urllib client. No ElevenLabs SDK is installed.
- Locked model: `eleven_v4`. Locked voice: `HKFOb9iktHA85uKXydRT`.
- Locked request: stability 0.55, similarity_boost 0.75, style 0.0, use_speaker_boost false, output format `mp3_44100_128`.
- Do not change the ElevenLabs model, voice, or settings, and do not re-render approved chapters, without explicit approval.
- `eleven_v4_turbo` is a newer realtime model. Do not switch to it.

ElevenLabs word timing is the master timeline when a word-timestamp file exists for the audio that was actually used. Where only `chNN-timings.json` exists, those beat times are the measured audio times for that file, and they are not word times.

## Host and port

The script text says `http://localhost:5173` (line 9).

The Chapter 1 and Chapter 2 cue captures use `http://localhost:5174`.

Older chapter recorders listed in OPEN-ITEMS default to port 5173.

Team Dispatch width data, when the script's local note applies, also uses the Node API on port 3001 (`npm run dev:all`). Script line 10.
