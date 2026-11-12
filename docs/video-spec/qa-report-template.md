# QA report template

One block per scene. Copy this block. Do not mark PASS without the evidence files.

```
Chapter:
Scene id:
Spec file:
Expected action time:
Observed time:
Difference:
Defects:
Evidence files:
Verdict: PASS | REWORK | BLOCKED
```

Rules:

- Missing evidence means BLOCKED, never PASS.
- The Director's self-assessment is not evidence.
- Evidence is a file QA can open: a frame, a timestamp, a capture log, or a probe of the rendered file.
- If the spec says PROPOSED - Video Director to set, Greg to approve, the verdict for that number is BLOCKED until the value is approved and written into the spec.
