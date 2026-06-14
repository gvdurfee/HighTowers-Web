#!/usr/bin/env node
/**
 * Generate docs/handouts/Phase-A-Coordinator-Persistence-Brief.pdf
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import {
  MARGIN_L,
  MUTED,
  PIMENTO,
  ULTRAMARINE,
  createHandoutContext,
} from './handout-pdf-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const pdfPath = path.join(root, 'docs/handouts/Phase-A-Coordinator-Persistence-Brief.pdf')

async function main() {
  const doc = await PDFDocument.create()
  const h = await createHandoutContext(doc)

  h.drawTextSafe('Phase A: Wing Coordinator Persistence', {
    x: MARGIN_L,
    y: h.y - 18,
    size: 17,
    font: h.fontBold,
    color: ULTRAMARINE,
  })
  h.y -= 24
  h.drawParagraph('HighTowers-Web - Brief for Director of Operations', { size: 10, color: MUTED })
  h.drawParagraph('New Mexico Wing - Low Level Route tower surveys', { size: 9, color: MUTED, after: 6 })
  h.drawRule()

  h.drawHeading('Purpose', 10)
  h.drawParagraph(
    'HighTowers-Web supports crew mission work (flight plans, tower analysis, reports, content packs) and a Coordinator Survey Console for sortie planning when teams or weather change. Today, coordinator plans are not saved on the server - they exist only in the coordinator browser until re-entered.',
    { size: 9 }
  )
  h.drawParagraph(
    'Phase A adds wing-level persistence for coordinator scenarios so replanning does not mean starting over, and published sortie briefs can be reopened and shared by reference.',
    { size: 9, after: 4 }
  )

  h.drawHeading('Problem Phase A solves', 10)
  h.drawTable([
    ['Weather / roster change', 'Reopen same scenario, change teams, publish updated brief'],
    ['Common reference', 'Published scenario links flight plan and sortie assignments'],
    ['New laptop / refresh', 'Scenario saved on wing API (Railway), not only browser'],
  ])

  h.drawParagraph(
    'Phase A does not yet solve: pilot sets up mission on one device and airborne photographer completes analysis on another (Phase C). Training SOP: crew close-out stays on one browser profile until Phase C.',
    { size: 8.5, color: MUTED, after: 4 }
  )

  h.drawHeading('What we will build', 10)
  h.drawBullets(
    [
      'Save coordinator scenario (flight plan, team airports, mode, budget, sortie results).',
      'Load and list scenarios by route or campaign for the season.',
      'Version or republish when roster or weather changes (audit trail).',
      'Shareable brief for aircrew (waypoint ranges, offsets, ferry legs).',
      'Hosting: GitHub Pages (app) + Railway API (SQLite) - same stack as today.',
    ],
    8.5
  )
  h.drawParagraph('Out of scope: syncing crew missions, tower photos, or reports across devices (Phase C).', {
    size: 8.5,
    bold: true,
    after: 4,
  })

  h.drawHeading('Training and interim SOP', 10)
  h.drawBullets(
    [
      'Coordinator saves and republishes scenarios after roster or weather changes.',
      'Crew setup and post-flight analysis: same browser/device when pilot and photographer differ - until Phase C.',
      'Artifacts of record remain: Air Force PDF, content pack ZIP, wing folder storage.',
      'Live app: https://gvdurfee.github.io/HighTowers-Web/',
    ],
    8.5
  )

  h.drawHeading('Why Phase A now (not Phase C)', 10)
  h.drawTable([
    ['Phase A', 'Moderate effort, low risk, immediate coordinator replanning value'],
    ['Phase C', 'Larger effort, crew sync and photos; after training feedback'],
  ])

  h.drawHeading('Recommendation', 10)
  h.drawParagraph(
    'Approve Phase A as the next development increment: persist coordinator survey scenarios on the wing API so operations can rely on replanning and shared briefs when the app becomes mandatory post-training. Defer Phase C until training surfaces priority improvements.',
    { size: 9, after: 4 }
  )

  h.drawHeading('Decision requested', 10)
  h.drawChecklist([
    'Approve Phase A scope for development after training (or in parallel if urgent).',
    'Confirm interim SOP: crew data single-browser until Phase C.',
    'Use training to log enhancement requests for post-Phase A prioritization.',
  ])

  h.ensureSpace(28)
  h.drawParagraph('Source: docs/PHASE_A_COORDINATOR_PERSISTENCE_BRIEF.md', { size: 7.5, color: MUTED })

  fs.mkdirSync(path.dirname(pdfPath), { recursive: true })
  fs.writeFileSync(pdfPath, await doc.save())
  console.log(`Wrote ${pdfPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
