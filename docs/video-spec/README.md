# Video spec governance

Status: Draft, except where a chapter file says Approved.

The approved spec is the authority for the training video. Memory of an earlier session, and the current code, are not a substitute for an Approved spec. If code and an Approved spec disagree, the spec stays in force until it is changed and logged.

## Owners

| Role | Owns |
|---|---|
| Chief of Staff (Valerie) | Spec governance |
| Video Director | Scene specs, narration-to-action timing, and acceptance criteria |
| Cursor | Implements an Approved spec |
| Independent Video QA | Verifies rendered output with evidence |
| Greg | Approves |

## Status values

Draft, Approved, Superseded, Retired.

## Chapters

The training video is Chapters 1–6. Chapter 0 is Retired. See `ch00.md`.

Final program, accepted clips:

| Chapter | File | Duration | SHA-256 |
|---|---|---:|---|
| 1 | `_ch1-v3-spec/chapter1-v3.mp4` | 83.533 s | `a42c83e661e7f6da44453e97f2da3846770d006adc522dec91564e17ca4a5a4c` |
| 2 | `_ch2-v2-spec/chapter2-v2.mp4` | 245.63 s | `2d0ea6ded494cbc9f01b25907a9dd15859ce3a3aa742e2a8c18716141c7fb557` |
| 3 | `_ch3-v2-spec/chapter3-v2.mp4` | 127.872 s | `c9c71351480ec1982b8fd847a2ddfaee47a1df97678fe1646bd3c756ed223186` |
| 4 | `_ch4-v8-spec/chapter4-v8.mp4` | 149.833 s | `80a038308ee4f9ccf3848c4fdd6401ffbab038046656acaef40eb2b3abc38821` |
| 5 | `_ch5-v5-spec/chapter5-v5.mp4` | 121.667 s | `97691bed8dbc833edac8d8cd80f1a378069a21d80a4c0ee53f6955a8ba8fc945` |
| 6 | `_ch6-v2-spec/chapter6-v2.mp4` | 94.241 s | `ee4ae5234ad6a26b90147f9f39647015d83ff6db89fb59a3c1130b93e4ec3c25` |

Chapter 4 in this table is `_ch4-v8-spec/chapter4-v8.mp4`, approved by Greg on 2026-11-13. Earlier Chapter 4 files stay on disk and are not the program: `_ch4-beats/chapter4-v4-beats.mp4` SHA-256 `99ec20706af0ce0464c9f334ee9eab54a1d2c5ac86a26a8f5813f6d026c8d406`, `_final-v4/chapter4-v4-beats.mp4` SHA-256 `9b97e5a6c0a94b93bbf6e5261df46dcbfe9e3e82b978cfbec4ec50bd06c5fabc`, v5 `591128dde65a7c9e474ff261547b72974b354e9ecde96889d37c660e76a962f6`, v6 `d050b737a551c97a3aff9c88e86955633328a1436d148639091c1fe810f515ad`, v7 `beaef879f906ac5aa67687aebf00102c999c6ac32e8a99d51ce37883352b0ad2`.

Approved for timing only is Approved, limited to the named clip. It does not approve a change to the narration.

A scene is not accepted while it is Draft. Superseded text stays in the changelog and is not the authority.

## Rules

- ElevenLabs word timing is the master timeline for audio that has word timestamps. Beat times in `chNN-timings.json` are measured audio times for that file. They are not a second master clock.
- Implementation prompts stay short and cite the spec file and scene ids. Use `prompt-template.md`.
- QA runs before a scene is accepted. Use `qa-report-template.md`. Missing evidence is BLOCKED, never PASS. The Director's self-assessment is not evidence.
- Every spec change is logged in `CHANGELOG.md` with its reason.
- No pipeline redesign unless the change names the requirement that needs it.
- Completed approved assets are preserved. Do not re-render, regenerate, or delete them without explicit approval.
- A number that is not already in the sources is not invented. The marker for an unset tolerance is: PROPOSED - Video Director to set, Greg to approve.
