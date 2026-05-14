import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { WaypointRecord } from '@/db/schema'
import { primaryRouteNumberFromWaypoints } from '@/utils/contentPackWaypoints'
import {
  contentPackApi,
  getContentPackApiKey,
  type ServerContentPackSummary,
} from '@/services/contentPackApi'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'

type Props = {
  /** Flight-plan waypoints (already loaded by the parent page). */
  waypoints: WaypointRecord[]
}

/**
 * "Content Pack for this route" card on the Flight Plan detail page.
 *
 * For survey crews prepping next year's flight: derives the route number from
 * the flight plan's waypoints, queries the server for packs whose
 * `primary_route_number` matches, and offers a single-click ZIP download. When
 * multiple packs match the route, exposes a small picker; defaults to the most
 * recently updated one.
 *
 * The complementary mission close-out flow (Apply this mission's towers) lives
 * on the ForeFlight Content Pack Update page.
 */
export function FlightPlanContentPackCard({ waypoints }: Props) {
  const routeNumber = useMemo(() => primaryRouteNumberFromWaypoints(waypoints), [waypoints])

  const [packs, setPacks] = useState<ServerContentPackSummary[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadErr, setDownloadErr] = useState<string | null>(null)
  const [downloadSuccessName, setDownloadSuccessName] = useState<string | null>(null)
  const { isSeen, markSeen } = useHintsSeen()

  /** Reset selection whenever the route changes (e.g. user nav between plans). */
  useEffect(() => {
    setSelectedId(null)
    setDownloadSuccessName(null)
  }, [routeNumber])

  /** Fetch the pack list whenever this card is shown for a routed plan. */
  useEffect(() => {
    if (!routeNumber) return
    let cancelled = false
    setLoading(true)
    setLoadErr(null)
    void (async () => {
      try {
        const { packs } = await contentPackApi.listPacks()
        if (!cancelled) setPacks(packs)
      } catch (e) {
        if (!cancelled) {
          setPacks([])
          setLoadErr(e instanceof Error ? e.message : 'Failed to load content packs')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [routeNumber])

  /** Packs whose `primary_route_number` matches the flight plan's route. */
  const matchingPacks = useMemo(
    () =>
      routeNumber && packs
        ? packs.filter((p) => p.primary_route_number === routeNumber)
        : [],
    [packs, routeNumber]
  )

  /** Auto-select the most recently updated matching pack (server returns desc by updated_at). */
  useEffect(() => {
    if (selectedId) return
    if (matchingPacks.length === 0) return
    setSelectedId(matchingPacks[0]!.id)
  }, [matchingPacks, selectedId])

  const selected = matchingPacks.find((p) => p.id === selectedId) ?? null

  useEffect(() => {
    if (!downloadSuccessName) return
    const t = window.setTimeout(() => setDownloadSuccessName(null), 30_000)
    return () => window.clearTimeout(t)
  }, [downloadSuccessName])

  async function handleDownload() {
    if (!selected) return
    setDownloading(true)
    setDownloadErr(null)
    setDownloadSuccessName(null)
    try {
      const blob = await contentPackApi.downloadExportBlob(selected.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const base = (selected.name?.trim() || `foreflight-pack-${selected.id.slice(0, 8)}`)
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
        .trim()
      const filename = `${base}.zip`
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setDownloadSuccessName(filename)
    } catch (e) {
      setDownloadErr(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const apiKey = getContentPackApiKey()

  return (
    <section className="p-4 bg-white rounded-lg border border-gray-200">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h2 className="font-semibold text-gray-900">Content Pack for this route</h2>
        <GuidedHint
          hintId="flightPlan.contentPackCard"
          stepNumber={1}
          title="Download the latest pack for ForeFlight"
          body={
            <>
              When you’re prepping for the next flight on this route, download the latest content
              pack here and import it in ForeFlight. The pack already includes tower waypoints
              from previous years’ surveys. Apply your own mission’s towers later from the
              ForeFlight Content Pack Update page.
            </>
          }
          isSeen={isSeen('flightPlan.contentPackCard')}
          onDismiss={markSeen}
          surface="light"
        />
      </div>

      {!routeNumber ? (
        <p className="text-sm text-gray-600">
          This flight plan has no MTR-style waypoints (e.g. <code>112A</code>), so the app can’t
          auto-match a content pack. Open{' '}
          <Link to="/foreflight-content-pack" className="text-cap-ultramarine hover:underline">
            ForeFlight Content Pack Update
          </Link>{' '}
          to pick or publish one manually.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-700 mb-3">
            Route <strong>{routeNumber}</strong>.{' '}
            {loading ? (
              <span className="text-gray-500">Loading packs…</span>
            ) : matchingPacks.length === 0 ? (
              <span className="text-cap-pimento">
                No pack on the server matches this route. Publish one on the{' '}
                <Link to="/foreflight-content-pack" className="underline">
                  ForeFlight Content Pack Update
                </Link>{' '}
                page.
              </span>
            ) : (
              <span>
                {matchingPacks.length === 1
                  ? '1 pack available.'
                  : `${matchingPacks.length} packs available — pick one below.`}
              </span>
            )}
          </p>

          {!apiKey && !loading && matchingPacks.length === 0 && (
            <p className="text-xs text-cap-pimento mb-3">
              No API key saved in this browser. Add one on the ForeFlight Content Pack Update page
              under Settings → Server connection so this card can read the server.
            </p>
          )}

          {matchingPacks.length > 1 && (
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Choose pack</label>
              <select
                value={selectedId ?? ''}
                disabled={downloading}
                onChange={(e) => setSelectedId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {matchingPacks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · rev {p.current_revision} · updated{' '}
                    {new Date(p.updated_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm mb-4">
              <dt className="text-gray-500">Pack</dt>
              <dd className="text-gray-900 font-medium">{selected.name}</dd>
              <dt className="text-gray-500">Revision</dt>
              <dd className="text-gray-900">{selected.current_revision}</dd>
              <dt className="text-gray-500">Last updated</dt>
              <dd className="text-gray-900">{new Date(selected.updated_at).toLocaleString()}</dd>
            </dl>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={!selected || downloading}
              className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
            >
              {downloading ? 'Preparing ZIP…' : 'Download for ForeFlight (.zip)'}
            </button>
            <Link
              to="/foreflight-content-pack"
              className="text-sm text-cap-ultramarine hover:underline"
            >
              Manage on Content Pack Update →
            </Link>
          </div>

          {downloadSuccessName && (
            <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="space-y-1.5 min-w-0">
                <p className="font-semibold text-emerald-950">
                  <span className="break-all">{downloadSuccessName}</span> saved to your Downloads folder.
                </p>
                <p className="text-emerald-900/95 leading-relaxed">
                  To import in ForeFlight: open the Files app, find the ZIP, tap → Share → Open in ForeFlight. The pack
                  will appear under More → Content Packs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDownloadSuccessName(null)}
                className="flex-shrink-0 self-start px-3 py-1.5 rounded-md border border-emerald-200 bg-white text-emerald-900 text-xs font-medium hover:bg-emerald-50/80"
              >
                Got it
              </button>
            </div>
          )}
        </>
      )}

      {(loadErr || downloadErr) && (
        <p className="mt-3 text-sm text-cap-pimento">{downloadErr ?? loadErr}</p>
      )}
    </section>
  )
}
