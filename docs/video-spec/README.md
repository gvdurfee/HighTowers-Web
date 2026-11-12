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

Draft, Approved, Superseded.

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
