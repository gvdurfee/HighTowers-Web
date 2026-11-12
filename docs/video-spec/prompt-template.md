# Implementation prompt template

Keep the prompt short. Cite the spec. Do not paste the spec back in.

```
Implement scene <scene id>, and only that scene, from docs/video-spec/<file>.md.
Also follow docs/video-spec/_common.md.

Allowed files:
- <path>
- <path>

Do not re-render approved media. Do not change the locked ElevenLabs model, voice, or settings.

Return:
- the spec file and scene id
- the files changed
- evidence: <frame, timestamp, or log path> showing the action at the spec's time
```

If the scene status is Draft, stop and say so. Do not implement a Draft scene as if it were Approved.
