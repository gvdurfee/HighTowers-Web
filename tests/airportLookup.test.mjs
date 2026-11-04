import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  airportLookupMessage,
  cleanAirportId,
  FAA_AIRPORT_SERVICE_MESSAGE,
  fetchAirport,
} from '../src/services/airportLookup.ts'

const tcc = {
  IDENT: 'TCC',
  NAME: 'Tucumcari Muni',
  ICAO_ID: 'KTCC',
  LATITUDE: '35-10-58.0010N',
  LONGITUDE: '103-36-11.5000W',
  ELEVATION: 4064.9,
}

const abq = {
  IDENT: 'ABQ',
  NAME: 'Albuquerque Intl Sunport',
  ICAO_ID: 'KABQ',
  LATITUDE: '35-02-20.1536N',
  LONGITUDE: '106-36-29.7438W',
  ELEVATION: 5354.9,
}

function whereOf(url) {
  return new URL(url).searchParams.get('where') ?? ''
}

function featureFor(where) {
  if (where.includes("='KTCC'") || where.includes("='TCC'")) return tcc
  if (where.includes("='KABQ'")) return abq
  return null
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubAirports() {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const where = whereOf(String(url))
      calls.push(where)
      const attrs = featureFor(where)
      return {
        ok: true,
        json: async () => ({ features: attrs ? [{ attributes: attrs }] : [] }),
      }
    })
  )
  return calls
}

describe('fetchAirport', () => {
  it('finds KTCC by ICAO id and shows the airport name', async () => {
    const calls = stubAirports()
    const result = await fetchAirport('KTCC')
    expect(result.status).toBe('found')
    expect(result.airport).toMatchObject({
      identifier: 'KTCC',
      name: 'Tucumcari Muni',
    })
    expect(result.airport.latitude).toBeCloseTo(35.182778, 4)
    expect(result.airport.longitude).toBeCloseTo(-103.603194, 4)
    expect(calls).toEqual(["ICAO_ID='KTCC' OR IDENT='KTCC'"])
  })

  it('finds TCC by FAA id', async () => {
    stubAirports()
    const result = await fetchAirport('TCC')
    expect(result.status).toBe('found')
    expect(result.airport).toMatchObject({ identifier: 'KTCC', name: 'Tucumcari Muni' })
  })

  it('finds an id with extra spaces (" ktcc ")', async () => {
    const calls = stubAirports()
    expect(cleanAirportId(' ktcc ')).toBe('KTCC')
    expect(cleanAirportId(' \u200bk-tcc!\uFEFF ')).toBe('KTCC')
    const result = await fetchAirport(' ktcc ')
    expect(result).toMatchObject({ status: 'found', id: 'KTCC' })
    expect(result.airport.name).toBe('Tucumcari Muni')
    expect(calls).toEqual(["ICAO_ID='KTCC' OR IDENT='KTCC'"])
  })

  it('finds KABQ', async () => {
    stubAirports()
    const result = await fetchAirport('KABQ')
    expect(result.status).toBe('found')
    expect(result.airport).toMatchObject({
      identifier: 'KABQ',
      name: 'Albuquerque Intl Sunport',
    })
  })

  it('says the FAA service has no such airport, using the cleaned id', async () => {
    const calls = stubAirports()
    const result = await fetchAirport(' kzzz ')
    expect(result).toEqual({ status: 'not-found', id: 'KZZZ' })
    expect(airportLookupMessage(result)).toBe('Could not find airport: KZZZ')
    expect(calls).toEqual([
      "ICAO_ID='KZZZ' OR IDENT='KZZZ'",
      "ICAO_ID='ZZZ' OR IDENT='ZZZ'",
    ])
  })

  it('reports a network failure instead of a missing airport', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    const result = await fetchAirport('KABQ')
    expect(result).toEqual({ status: 'unavailable', id: 'KABQ' })
    expect(airportLookupMessage(result)).toBe(FAA_AIRPORT_SERVICE_MESSAGE)
    expect(FAA_AIRPORT_SERVICE_MESSAGE).toBe(
      "FAA airport service didn't respond. Check your connection and try again."
    )
  })

  it('reports an HTTP 500 instead of a missing airport', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      }))
    )
    const result = await fetchAirport('KTCC')
    expect(result).toEqual({ status: 'unavailable', id: 'KTCC' })
    expect(airportLookupMessage(result)).toBe(
      "FAA airport service didn't respond. Check your connection and try again."
    )
  })

  it('reports an unexpected response instead of a missing airport', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ error: { code: 400, message: 'Invalid query' } }),
      }))
    )
    const result = await fetchAirport('KTCC')
    expect(result.status).toBe('unavailable')
    expect(airportLookupMessage(result)).toBe(FAA_AIRPORT_SERVICE_MESSAGE)
  })

  it('retries the 3-letter FAA id when the K-prefixed id is not stored', async () => {
    const calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const where = whereOf(String(url))
        calls.push(where)
        const attrs =
          where.includes("='EZZ'")
            ? {
                IDENT: 'EZZ',
                NAME: 'Example Muni',
                ICAO_ID: '',
                LATITUDE: '35-00-00.0000N',
                LONGITUDE: '104-00-00.0000W',
                ELEVATION: 4000,
              }
            : null
        return {
          ok: true,
          json: async () => ({ features: attrs ? [{ attributes: attrs }] : [] }),
        }
      })
    )
    const result = await fetchAirport('KEZZ')
    expect(result.status).toBe('found')
    expect(result.airport).toMatchObject({ identifier: 'EZZ', name: 'Example Muni' })
    expect(calls).toEqual([
      "ICAO_ID='KEZZ' OR IDENT='KEZZ'",
      "ICAO_ID='EZZ' OR IDENT='EZZ'",
    ])
  })
})
