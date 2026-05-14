import fs from 'node:fs'
import path from 'node:path'
import pptxgen from 'pptxgenjs'

const BRAND = {
  capUltramarine: '0E2B8D',
  capPimento: 'DB0029',
  capSilver: 'ABABAB',
  capYellow: 'FFD911',
  slateText: '0F172A',
  slateSubtle: '334155',
  bg: 'FFFFFF',
}

function inches(n) {
  return n
}

function addTopBar(slide, shapeType, title, subtitle) {
  slide.addShape(shapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.6,
    fill: { color: BRAND.capUltramarine },
    line: { color: BRAND.capUltramarine },
  })

  slide.addText(title, {
    x: 0.6,
    y: 0.12,
    w: 12.2,
    h: 0.35,
    fontFace: 'Aptos Display',
    fontSize: 22,
    color: 'FFFFFF',
    bold: true,
  })

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.6,
      y: 0.62,
      w: 12.2,
      h: 0.4,
      fontFace: 'Aptos',
      fontSize: 14,
      color: BRAND.slateSubtle,
    })
  }
}

function addBullets(slide, bullets, opts = {}) {
  const {
    x = 0.9,
    y = 1.45,
    w = 11.8,
    h = 5.4,
    fontSize = 24,
  } = opts

  const rich = bullets.map((t) => ({ text: t, options: { bullet: { indent: 22 } } }))
  slide.addText(rich, {
    x,
    y,
    w,
    h,
    fontFace: 'Aptos',
    fontSize,
    color: BRAND.slateText,
    paraSpaceAfter: fontSize * 0.35,
  })
}

function addFooter(slide, footerText) {
  slide.addText(footerText, {
    x: 0.6,
    y: 7.15,
    w: 12.2,
    h: 0.25,
    fontFace: 'Aptos',
    fontSize: 10,
    color: BRAND.capSilver,
  })
}

function setNotes(slide, notes) {
  // pptxgenjs uses slide.addNotes() (string) if present.
  if (typeof slide.addNotes === 'function') slide.addNotes(notes)
}

function main() {
  const outDir = path.resolve('docs', 'presentations')
  fs.mkdirSync(outDir, { recursive: true })

  const assetsDir = path.join(outDir, 'assets')
  const foreFlightScreenshot = path.join(assetsDir, 'foreflight-content-pack.png')
  const capLogo = path.join(assetsDir, 'cap-logo.png')
  const towerAnalysisScreenshot = path.join(assetsDir, 'tower-analysis.png')

  const pptx = new pptxgen()
  const shapeType = pptx.ShapeType
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'HighTowers Web'
  pptx.company = 'CAP / HighTowers Web'
  pptx.subject = 'HighTowers Web Management Brief'

  const footer = 'HighTowers Web — internal leadership briefing'

  // 1) Title
  {
    const s = pptx.addSlide()
    s.background = { color: BRAND.bg }
    s.addShape(shapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
      fill: { color: BRAND.capUltramarine },
      line: { color: BRAND.capUltramarine },
    })
    s.addText('HighTowers Web', {
      x: 0.9,
      y: 2.35,
      w: 11.6,
      h: 0.8,
      fontFace: 'Aptos Display',
      fontSize: 54,
      color: 'FFFFFF',
      bold: true,
    })
    s.addText('Mission reporting + tower analysis + ForeFlight Content Pack updates', {
      x: 0.95,
      y: 3.25,
      w: 11.8,
      h: 0.5,
      fontFace: 'Aptos',
      fontSize: 20,
      color: 'FFFFFF',
    })
    s.addText('30-minute management overview (with live demo)', {
      x: 0.95,
      y: 4.0,
      w: 11.8,
      h: 0.4,
      fontFace: 'Aptos',
      fontSize: 14,
      color: 'FFFFFF',
    })
    if (fs.existsSync(capLogo)) {
      // White tile so the logo pops on ultramarine background.
      s.addShape(shapeType.roundRect, {
        x: 11.7,
        y: 0.35,
        w: 1.35,
        h: 1.35,
        fill: { color: 'FFFFFF' },
        line: { color: 'FFFFFF' },
        radius: 0.15,
      })
      s.addImage({
        path: capLogo,
        x: 11.76,
        y: 0.41,
        w: 1.23,
        h: 1.23,
      })
    }
    setNotes(
      s,
      [
        'Open with: “Today I’ll walk through HighTowers Web—one place to capture tower observations, analyze tower photos, export the customer PDF, and update ForeFlight Content Packs for next season’s crews.”',
        'Goal: throughput + quality + repeatability.',
      ].join('\n')
    )
  }

  // 2) The problem
  {
    const s = pptx.addSlide()
    addTopBar(
      s,
      shapeType,
      'The problem we’re solving',
      'Manual re-entry and seasonal rework create avoidable delay and error.'
    )
    addBullets(s, [
      'Manual re-entry across tools (photos, notes, coordinates, heights)',
      'Inconsistent waypoint naming and coordinate rounding',
      'Seasonal effort to refresh ForeFlight crew navigation packs',
      'Hard to audit: “what changed” and “why” across missions',
    ])
    addFooter(s, footer)
    setNotes(s, 'Emphasize risk reduction: fewer transcription errors; faster turnaround; better standardization.')
  }

  // 3) What the app does
  {
    const s = pptx.addSlide()
    addTopBar(
      s,
      shapeType,
      'What HighTowers Web does',
      'A single workflow from mission setup to report export and crew-pack update.'
    )
    addBullets(s, [
      'Mission + flight plan + waypoints (route context)',
      'Air Force Report Form: up to 6 towers per mission',
      'Tower Data Analysis: photo-assisted height + location capture',
      'Export Reported Data: standardized customer-ready PDF',
      'ForeFlight Content Pack Update: bulk refine/append user waypoints in a ZIP',
    ])
    addFooter(s, footer)
    setNotes(s, 'Keep this slide high-level—details come next. Call out “new” ForeFlight pack update capability.')
  }

  // 4) Workflow overview
  {
    const s = pptx.addSlide()
    addTopBar(
      s,
      shapeType,
      'End-to-end workflow',
      'From mission creation to export, with optional analysis and pack updates.'
    )
    addBullets(s, [
      '1) Select or create mission; associate a flight plan (waypoints)',
      '2) Capture tower observations (structure, lighting, notes, coordinates)',
      '3) Optional: Tower Data Analysis from image + map record → estimated height',
      '4) Export Reported Data PDF (map + photos when configured)',
      '5) Update ForeFlight Content Pack ZIP for next season’s crews',
    ])
    addFooter(s, footer)
    setNotes(s, 'Message: “once data is captured, export becomes a button—less rework.”')
  }

  // 5) Data model (plain English)
  {
    const s = pptx.addSlide()
    addTopBar(
      s,
      shapeType,
      'Data model (plain English)',
      'Structured records enable consistent exports and pack updates.'
    )
    addBullets(s, [
      'Missions: metadata + Additional Notes',
      'Flight plans: ordered waypoints used for naming and context',
      'Tower reports: per observation (date, notes, structure, lighting, height estimate)',
      'Tower locations: lat/long/elevation + image-derived metadata',
      'Local-first storage for fast load and resilience (optional API for map/PDF)',
    ])
    addFooter(s, footer)
    setNotes(s, 'Focus on “structured data” → “repeatable outputs.” Avoid deep technical details.')
  }

  // 6) Tower Data Analysis
  {
    const s = pptx.addSlide()
    addTopBar(
      s,
      shapeType,
      'Tower Data Analysis',
      'Photo-assisted height workflow that writes back to the mission record.'
    )
    if (fs.existsSync(towerAnalysisScreenshot)) {
      // Full-bleed screenshot under the header, preserving aspect ratio.
      // The image is wider than the available area, so we scale to width and
      // let the top/bottom overflow be clipped by the slide bounds (no distortion).
      const slideW = 13.333
      const headerH = 0.6
      const contentH = 7.5 - headerH
      const imgAspect = 1024 / 600 // tower-analysis.png
      const imgW = slideW
      const imgH = imgW / imgAspect
      const overflow = Math.max(0, imgH - contentH)
      const imgY = headerH - overflow / 2

      s.addImage({
        path: towerAnalysisScreenshot,
        x: 0,
        y: imgY,
        w: imgW,
        h: imgH,
      })
    } else {
      addBullets(s, [
        'Add `docs/presentations/assets/tower-analysis.png` to show the analysis workflow visually.',
      ])
    }
    addFooter(s, footer)
    setNotes(s, 'Demo cue: show selecting an image, recording map point, aligning sliders, saving.')
  }

  // 7) Export Reported Data
  {
    const s = pptx.addSlide()
    addTopBar(
      s,
      shapeType,
      'Export Reported Data',
      'One-click PDF generation for the customer / stakeholder.'
    )
    addBullets(s, [
      'Standardized Air Force Route Survey Report PDF',
      'Mission map included when configured (Mapbox token + hosted API as needed)',
      'Tower photos include CAP-style coordinate overlay; size optimized for sharing',
      'Additional Notes printed on the report (and ready for leadership review)',
    ])
    addFooter(s, footer)
    setNotes(s, 'Demo cue: generate the PDF and show the Additional Notes section near the end.')
  }

  // 8) ForeFlight Content Pack Update (new)
  {
    const s = pptx.addSlide()
    addTopBar(
      s,
      shapeType,
      'ForeFlight Content Pack Update (new)',
      'Bulk-refresh crew navigation packs from mission tower reports.'
    )
    // Left bullets
    addBullets(
      s,
      [
        'Upload ForeFlight Content Pack ZIP',
        'App updates `navdata/user_waypoints` (CSV) inside the pack',
        'Download an updated ZIP; unzip/import into ForeFlight',
        'Two outcomes per tower:',
        '• Refine an existing waypoint when within ~30 m (same name)',
        '• Append a new waypoint row otherwise (named from primary route number)',
      ],
      { fontSize: 20, x: 0.85, y: 1.25, w: 6.35, h: 5.7 }
    )

    // Right screenshot (if present)
    if (fs.existsSync(foreFlightScreenshot)) {
      s.addShape(shapeType.roundRect, {
        x: 7.35,
        y: 1.1,
        w: 5.65,
        h: 5.95,
        fill: { color: 'FFFFFF' },
        line: { color: BRAND.capSilver, width: 1 },
        radius: 0.15,
      })
      s.addImage({
        path: foreFlightScreenshot,
        x: 7.45,
        y: 1.2,
        w: 5.45,
        h: 5.75,
      })
      s.addText('Screenshot: Content Pack preview + download', {
        x: 7.35,
        y: 6.95,
        w: 5.65,
        h: 0.25,
        fontFace: 'Aptos',
        fontSize: 10,
        color: BRAND.capSilver,
        align: 'center',
      })
    } else {
      s.addShape(shapeType.roundRect, {
        x: 7.35,
        y: 1.1,
        w: 5.65,
        h: 5.95,
        fill: { color: 'F8FAFC' },
        line: { color: BRAND.capSilver, width: 1 },
        radius: 0.15,
      })
      s.addText('Insert screenshot here', {
        x: 7.35,
        y: 3.95,
        w: 5.65,
        h: 0.4,
        fontFace: 'Aptos',
        fontSize: 16,
        color: BRAND.capSilver,
        align: 'center',
      })
    }
    addFooter(s, footer)
    setNotes(s, 'Demo cue: upload ZIP, point to preview counts (refined vs appended) and example refinements.')
  }

  // 9) Precision & safety rules
  {
    const s = pptx.addSlide()
    addTopBar(
      s,
      shapeType,
      'Precision & safety rules',
      'Conservative logic reduces risk of unintended navigation changes.'
    )
    addBullets(s, [
      'Refinement threshold: ~30 m to prevent accidental mismatches',
      'Writes lat/long using 4 decimals (matches ForeFlight export convention)',
      'Leaves pack elevation cells untouched (no elevation edits in the ZIP)',
      'Blocks new-row appends if mission lacks flight-plan route context for naming',
      'Preview step before download provides transparency and quick QA',
    ], { fontSize: 22 })
    addFooter(s, footer)
    setNotes(s, 'Position this as “guardrails”: reduce false matches; keep changes explicit and reviewable.')
  }

  // 10) Management value
  {
    const s = pptx.addSlide()
    addTopBar(s, shapeType, 'Value to the organization', 'Speed, consistency, and season-to-season readiness.')
    addBullets(s, [
      'Faster turnaround: fewer manual steps and less re-entry',
      'Fewer errors: consistent naming, rounding, and formatting',
      'Repeatability and auditability: structured records and deterministic exports',
      'Crew readiness: ForeFlight packs updated from actual reported towers',
      'Lower training burden: guided UI + smoke test checklist',
    ], { fontSize: 22 })
    addFooter(s, footer)
    setNotes(s, 'Tie back to leadership priorities: efficiency, quality, risk, and readiness.')
  }

  // 11) Live demo (5 minutes)
  {
    const s = pptx.addSlide()
    addTopBar(s, shapeType, 'Live demo (5 minutes)', 'Show the workflow end-to-end with one mission.')
    addBullets(s, [
      '1) Pick mission and confirm flight plan/waypoints',
      '2) Tower Data Analysis: save one tower report',
      '3) Export Reported Data: generate the PDF',
      '4) ForeFlight Content Pack Update: upload ZIP → preview → download updated ZIP',
    ])
    addFooter(s, footer)
    setNotes(
      s,
      [
        'Keep the demo tight: one tower save + one export + one pack preview.',
        'If Mapbox isn’t configured, call it out briefly and proceed (PDF still generates).',
      ].join('\n')
    )
  }

  // 12) Next steps
  {
    const s = pptx.addSlide()
    addTopBar(s, shapeType, 'Next steps', 'Pilot, harden, and scale.')
    addBullets(s, [
      'Pilot with 1–2 crews; collect workflow feedback',
      'Finalize training: quickstart + smoke test checklist',
      'Decide/confirm hosting for PDF map rendering (if required)',
      'Operationalize season refresh: pack updates per mission, then consolidated for crews',
      'Track success metrics: time-to-report, corrections, pack-update time',
    ], { fontSize: 22 })
    addFooter(s, footer)
    setNotes(s, 'Close with an “ask”: approve pilot; confirm hosting; define success metrics.')
  }

  const outPath = path.join(outDir, 'HighTowers-Web-Management-Overview.pptx')
  pptx.writeFile({ fileName: outPath })

  const outlinePath = path.join(outDir, 'HighTowers-Web-Management-Overview.md')
  fs.writeFileSync(
    outlinePath,
    [
      '# HighTowers Web — Management Overview (30 minutes)',
      '',
      '## Slide 1 — Title',
      '- HighTowers Web',
      '- Mission reporting + tower analysis + ForeFlight Content Pack updates',
      '',
      '## Slide 2 — The problem we’re solving',
      '- Manual re-entry across tools',
      '- Inconsistent waypoint naming and rounding',
      '- Seasonal rework to refresh ForeFlight crew packs',
      '- Hard to audit what changed and why',
      '',
      '## Slide 3 — What the app does',
      '- Mission + flight plan + waypoints',
      '- Air Force Report Form (up to 6 towers)',
      '- Tower Data Analysis (photo-assisted)',
      '- Export Reported Data (PDF)',
      '- ForeFlight Content Pack Update (ZIP)',
      '',
      '## Slide 4 — End-to-end workflow',
      '- Mission + flight plan',
      '- Capture observations',
      '- Optional analysis',
      '- Export PDF',
      '- Update ForeFlight pack',
      '',
      '## Slide 5 — Data model (plain English)',
      '- Missions, flight plans, tower reports, tower locations',
      '- Local-first storage; optional API for map/PDF',
      '',
      '## Slide 6 — Tower Data Analysis',
      '- Image + map record location',
      '- Slider alignment for height',
      '- Save to mission record',
      '',
      '## Slide 7 — Export Reported Data',
      '- One-click PDF',
      '- Map when configured',
      '- Photos with overlay',
      '- Additional Notes included',
      '',
      '## Slide 8 — ForeFlight Content Pack Update (new)',
      '- Upload ZIP; updates navdata/user_waypoints',
      '- Preview refine vs append',
      '- Download updated ZIP',
      '',
      '## Slide 9 — Precision & safety rules',
      '- ~30 m refinement threshold',
      '- 4-decimal coords',
      '- No elevation edits in ZIP',
      '- Blocks appends without route context',
      '',
      '## Slide 10 — Value to the organization',
      '- Faster turnaround, fewer errors, repeatable, crew readiness',
      '',
      '## Slide 11 — Live demo (5 minutes)',
      '- Mission → save one tower → export PDF → pack update preview/download',
      '',
      '## Slide 12 — Next steps',
      '- Pilot, training checklist, hosting decision, metrics',
      '',
      '---',
      'Brand colors (from tailwind):',
      `- CAP Ultramarine: #${BRAND.capUltramarine}`,
      `- CAP Pimento: #${BRAND.capPimento}`,
      `- CAP Silver: #${BRAND.capSilver}`,
      `- CAP Yellow: #${BRAND.capYellow}`,
      '',
    ].join('\n'),
    'utf8'
  )
}

main()

