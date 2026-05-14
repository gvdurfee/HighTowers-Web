import { describe, it, expect } from 'vitest'
import AdmZip from 'adm-zip'
import { parseForeFlightUserWaypointsCsv } from '../shared/content-pack-core/foreflightUserWaypointsCsv.js'
import {
  assertForeFlightUserWaypointsShape,
  primaryRouteNumberFromCsvDoc,
} from '../shared/content-pack-core/contentPackWaypoints.js'
import { applyAllMissionTowersToUserWaypointsCsvText } from '../shared/content-pack-core/applyTowerToUserWaypointsCsv.js'
import {
  synthesizeMinimalContentPackBuffer,
  inspectZipForNonEssentialEntries,
} from '../server/lib/contentPackRepository.js'

describe('synthesizeMinimalContentPackBuffer', () => {
  it('produces a 2-entry pack with the correct manifest and an empty CSV', () => {
    const { buf, rootDir, csvMemberPath } = synthesizeMinimalContentPackBuffer({
      routeNumber: '355',
      organizationName: 'NM Wing CAP',
    })
    expect(rootDir).toBe('IR355_content_pack')
    expect(csvMemberPath).toBe('IR355_content_pack/navdata/user_waypoints.csv')

    const zip = new AdmZip(buf)
    const entries = zip.getEntries().filter((e) => !e.isDirectory)
    const entryNames = entries.map((e) => e.entryName).sort()
    expect(entryNames).toEqual([
      'IR355_content_pack/manifest.json',
      'IR355_content_pack/navdata/user_waypoints.csv',
    ])

    const manifest = JSON.parse(
      zip.getEntry('IR355_content_pack/manifest.json').getData().toString('utf8')
    )
    expect(manifest).toEqual({
      name: 'IR355 Reported Towers',
      abbreviation: 'IR355.V1',
      version: 1.0,
      organizationName: 'NM Wing CAP',
    })

    const csvText = zip
      .getEntry('IR355_content_pack/navdata/user_waypoints.csv')
      .getData()
      .toString('utf8')
    expect(csvText).toContain('WAYPOINT_NAME')
    expect(csvText).toContain('Latitude')
    expect(csvText).toContain('Longitude')

    const doc = parseForeFlightUserWaypointsCsv(csvText)
    expect(() => assertForeFlightUserWaypointsShape(doc)).not.toThrow()
    expect(doc.rows.length).toBe(0)
    // Empty CSV can't auto-derive a route number; the create-empty caller
    // must set primary_route_number from the form input.
    expect(primaryRouteNumberFromCsvDoc(doc)).toBeNull()
  })

  it('rejects non-numeric route numbers', () => {
    expect(() => synthesizeMinimalContentPackBuffer({ routeNumber: 'foo' })).toThrow(/numeric/)
    expect(() => synthesizeMinimalContentPackBuffer({ routeNumber: '' })).toThrow(/numeric/)
    expect(() => synthesizeMinimalContentPackBuffer({ routeNumber: 'IR112' })).toThrow(/numeric/)
  })

  it('honors caller-provided displayName and abbreviation overrides', () => {
    const { buf } = synthesizeMinimalContentPackBuffer({
      routeNumber: '112',
      displayName: 'NM IR112 — Greg test',
      abbreviation: 'IR112.TEST',
      organizationName: 'NM Wing CAP',
    })
    const zip = new AdmZip(buf)
    const manifest = JSON.parse(
      zip.getEntry('IR112_content_pack/manifest.json').getData().toString('utf8')
    )
    expect(manifest.name).toBe('NM IR112 — Greg test')
    expect(manifest.abbreviation).toBe('IR112.TEST')
  })

  it('synthesized pack accepts a first apply that appends sequentially', () => {
    const { buf } = synthesizeMinimalContentPackBuffer({ routeNumber: '420' })
    const zip = new AdmZip(buf)
    const csvText = zip
      .getEntry('IR420_content_pack/navdata/user_waypoints.csv')
      .getData()
      .toString('utf8')
    const towers = [
      { lat: 36.1, lon: -107.1 },
      { lat: 36.2, lon: -107.2 },
      { lat: 36.3, lon: -107.3 },
    ]
    const cum = applyAllMissionTowersToUserWaypointsCsvText({
      csvText,
      towers,
      routeNumber: '420',
    })
    expect(cum.ok).toBe(true)
    if (!cum.ok) return
    expect(cum.refinedCount).toBe(0)
    expect(cum.unchangedCount).toBe(0)
    expect(cum.appendedCount).toBe(3)
    const newNames = cum.items
      .filter((it) => it.outcome === 'appended')
      .map((it) => it.newWaypointName)
    expect(newNames).toEqual(['420A', '420B', '420C'])
  })
})

describe('inspectZipForNonEssentialEntries', () => {
  it('reports zero extras for the synthesized minimal pack', () => {
    const { buf } = synthesizeMinimalContentPackBuffer({ routeNumber: '112' })
    const result = inspectZipForNonEssentialEntries(buf)
    expect(result.count).toBe(0)
    expect(result.samplePaths).toEqual([])
  })

  it('does not flag canonical navdata/user_waypoints.csv as extra (regression)', () => {
    const { buf } = synthesizeMinimalContentPackBuffer({ routeNumber: '213' })
    const z = new AdmZip(buf)
    // Simulate a real-world SR213 pack layout (root + manifest + CSV only).
    z.addFile(
      'SR213_content_pack/manifest.json',
      Buffer.from(JSON.stringify({ name: 'SR213', abbreviation: 'SR213.V1', version: 2, organizationName: 'ForeFlight' }), 'utf8')
    )
    z.addFile(
      'SR213_content_pack/navdata/user_waypoints.csv',
      Buffer.from('WAYPOINT_NAME,Waypoint description,Latitude,Longitude,Elevation,,\n', 'utf8')
    )
    const result = inspectZipForNonEssentialEntries(z.toBuffer())
    expect(result.count).toBe(0)
    expect(result.samplePaths).toEqual([])
  })

  it('flags layers/byop content but ignores macOS cruft', () => {
    const { buf: minimalBuf } = synthesizeMinimalContentPackBuffer({ routeNumber: '112' })
    const z = new AdmZip(minimalBuf)
    // Add a "non-essential" KML and a macOS cruft file to exercise the filter.
    z.addFile('IR112_content_pack/layers/example.kml', Buffer.from('<kml />', 'utf8'))
    z.addFile('IR112_content_pack/byop/plate.pdf', Buffer.from('%PDF-1.4\n', 'utf8'))
    z.addFile('__MACOSX/IR112_content_pack/._.DS_Store', Buffer.from([0]))
    z.addFile('IR112_content_pack/.DS_Store', Buffer.from([0]))

    const result = inspectZipForNonEssentialEntries(z.toBuffer())
    expect(result.count).toBe(2)
    expect(result.samplePaths.sort()).toEqual([
      'IR112_content_pack/byop/plate.pdf',
      'IR112_content_pack/layers/example.kml',
    ])
  })
})
