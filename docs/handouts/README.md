# HighTowers-Web handouts

Printable PDFs for wing operations and training. Regenerate after editing the markdown sources.

| PDF | Audience | Source | Regenerate |
|-----|----------|--------|------------|
| [Coordinator-Survey-Console-Handout.pdf](./Coordinator-Survey-Console-Handout.pdf) | Coordinators, squadrons, aircrew | [../COORDINATOR_SURVEY_CONSOLE_HANDOUT.md](../COORDINATOR_SURVEY_CONSOLE_HANDOUT.md) | `npm run handout:coordinator-pdf` |
| [Phase-A-Coordinator-Persistence-Brief.pdf](./Phase-A-Coordinator-Persistence-Brief.pdf) | Director of Operations, wing leadership | [../PHASE_A_COORDINATOR_PERSISTENCE_BRIEF.md](../PHASE_A_COORDINATOR_PERSISTENCE_BRIEF.md) | `npm run handout:phase-a-pdf` |

Generate both:

```bash
npm run handout:all
```

HTML print alternative (coordinator only): [coordinator-survey-console.html](./coordinator-survey-console.html)
