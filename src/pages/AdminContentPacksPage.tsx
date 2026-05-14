import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { GuidedHint } from '@/components/GuidedHint'
import { useHintsSeen } from '@/hooks/useHintsSeen'
import {
  AdminAuthHttpError,
  clearAdminSession,
  createEmptyPack,
  deletePack,
  getAdminSession,
  loginWithPin,
  type AdminSession,
  uploadPack,
  verifyAdminSession,
} from '@/services/contentPackAdminApi'
import { contentPackApi, getContentPackApiKey, type ServerContentPackSummary } from '@/services/contentPackApi'

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso
}

export function AdminContentPacksPage() {
  const { isSeen, markSeen } = useHintsSeen()
  const [bootstrapping, setBootstrapping] = useState(() => !!getAdminSession())
  const [session, setSession] = useState<AdminSession | null>(() => getAdminSession())

  const [pin, setPin] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginErr, setLoginErr] = useState<string | null>(null)

  const [packs, setPacks] = useState<ServerContentPackSummary[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listErr, setListErr] = useState<string | null>(null)
  const [waypointCounts, setWaypointCounts] = useState<Record<string, number | null>>({})

  const [newRouteNumber, setNewRouteNumber] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newOrgName, setNewOrgName] = useState('')
  const [newAbbrev, setNewAbbrev] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [createOk, setCreateOk] = useState<string | null>(null)

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadDisplayName, setUploadDisplayName] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [uploadOk, setUploadOk] = useState<string | null>(null)
  const [uploadWarn, setUploadWarn] = useState<string | null>(null)

  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const authenticated = !!session && !bootstrapping

  useEffect(() => {
    let cancelled = false
    const existing = getAdminSession()
    if (!existing) {
      setBootstrapping(false)
      setSession(null)
      return
    }
    void (async () => {
      const ok = await verifyAdminSession()
      if (cancelled) return
      setSession(ok ? getAdminSession() : null)
      setBootstrapping(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const refreshInventory = useCallback(async () => {
    setListErr(null)
    setListBusy(true)
    try {
      const { packs: rows } = await contentPackApi.listPacks()
      setPacks(rows)
    } catch (e) {
      setPacks([])
      setListErr(e instanceof Error ? e.message : 'Failed to load content packs')
    } finally {
      setListBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!authenticated) {
      setWaypointCounts({})
      return
    }
    let cancelled = false
    if (packs.length === 0) {
      setWaypointCounts({})
      return
    }
    void (async () => {
      const results = await Promise.all(
        packs.map(async (p) => {
          try {
            const data = (await contentPackApi.getPack(p.id, true)) as { waypoints?: unknown[] }
            return [p.id, data.waypoints?.length ?? 0] as const
          } catch {
            return [p.id, null] as const
          }
        })
      )
      if (cancelled) return
      setWaypointCounts(Object.fromEntries(results) as Record<string, number | null>)
    })()
    return () => {
      cancelled = true
    }
  }, [authenticated, packs])

  useEffect(() => {
    if (!authenticated) return
    void refreshInventory()
  }, [authenticated, refreshInventory])

  async function onSubmitPin(e: FormEvent): Promise<void> {
    e.preventDefault()
    setLoginErr(null)
    setLoginBusy(true)
    try {
      const next = await loginWithPin(pin.trim())
      setPin('')
      setSession(next)
    } catch (err) {
      if (err instanceof AdminAuthHttpError) {
        let msg = err.message
        if (err.status === 503) {
          msg = 'Wing administrator is not configured on this server.'
        } else if (err.status === 429 && err.retryAfterSec != null) {
          msg = `${err.message} Retry after ${err.retryAfterSec}s.`
        }
        setLoginErr(msg)
      } else {
        setLoginErr(err instanceof Error ? err.message : 'Sign-in failed')
      }
    } finally {
      setLoginBusy(false)
    }
  }

  function onSignOut(): void {
    clearAdminSession()
    setSession(null)
    setPacks([])
    setWaypointCounts({})
    setCreateOk(null)
    setUploadOk(null)
    setUploadWarn(null)
    setDeleteErr(null)
  }

  async function onDeletePack(p: ServerContentPackSummary): Promise<void> {
    const ok = window.confirm(
      `Delete this content pack from the server?\n\n` +
        `Name: ${p.name}\n` +
        `CSV member: ${p.csv_member_path}\n` +
        `Route: ${p.primary_route_number ?? '—'}\n` +
        `Revision: ${p.current_revision}\n` +
        `Pack id: ${p.id}\n\n` +
        `This cannot be undone. Missions that pointed at this pack will need another pack for the same route.`
    )
    if (!ok) return
    setDeleteErr(null)
    setDeletingId(p.id)
    try {
      await deletePack(p.id)
      await refreshInventory()
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  async function onCreateEmpty(e: FormEvent): Promise<void> {
    e.preventDefault()
    setCreateErr(null)
    setCreateOk(null)
    const routeNumber = newRouteNumber.trim()
    if (!/^\d+$/.test(routeNumber)) {
      setCreateErr('Route number must be numeric digits only.')
      return
    }
    setCreateBusy(true)
    try {
      const { pack } = await createEmptyPack({
        routeNumber,
        displayName: newDisplayName.trim() || undefined,
        organizationName: newOrgName.trim() || undefined,
        abbreviation: newAbbrev.trim() || undefined,
      })
      setCreateOk(`Created ${pack.name} (rev ${pack.current_revision})`)
      await refreshInventory()
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setCreateBusy(false)
    }
  }

  async function onUploadZip(e: FormEvent): Promise<void> {
    e.preventDefault()
    setUploadErr(null)
    setUploadOk(null)
    setUploadWarn(null)
    if (!uploadFile) {
      setUploadErr('Choose a .zip file first.')
      return
    }
    setUploadBusy(true)
    try {
      const { pack, nonEssential } = await uploadPack(uploadFile, uploadDisplayName.trim() || undefined)
      setUploadOk(`Published “${pack.name}” (revision ${pack.current_revision}).`)
      if (nonEssential.count > 0) {
        const sample = nonEssential.samplePaths.slice(0, 3).join(', ')
        const tail = nonEssential.count > 3 ? ', …' : ''
        setUploadWarn(
          `This pack contains ${nonEssential.count} extra file(s) (${sample}${tail}). ForeFlight maintains charts/plates on a 28-day cycle — embedded copies will go stale. Consider stripping and re-uploading.`
        )
      } else {
        setUploadWarn(null)
      }
      setUploadFile(null)
      setUploadDisplayName('')
      await refreshInventory()
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadBusy(false)
    }
  }

  const hasApiKey = !!getContentPackApiKey().trim()

  if (bootstrapping) {
    return (
      <div className="app-page-shell overflow-auto">
        <div className="app-panel max-w-3xl mx-auto p-6 md:p-8 text-gray-600 text-sm">Checking administrator session…</div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="app-page-shell overflow-auto">
        <div className="app-panel max-w-md mx-auto p-6 md:p-8 mt-8 md:mt-16">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Wing Administrator Console</h1>
          <p className="text-sm text-gray-600 mb-6">Content Pack lifecycle management</p>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign in</h2>
            <p className="text-xs text-gray-600 mb-4">Enter the wing administrator PIN. Session is stored for this browser tab only.</p>

            <form onSubmit={(ev) => void onSubmitPin(ev)} className="space-y-4">
              <div>
                <label htmlFor="admin-pin" className="block text-sm font-medium text-gray-700 mb-1">
                  PIN
                </label>
                <input
                  id="admin-pin"
                  name="admin-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  disabled={loginBusy}
                />
              </div>
              {loginErr && (
                <p className="text-sm text-cap-pimento" role="alert">
                  {loginErr}
                </p>
              )}
              <button
                type="submit"
                disabled={loginBusy || !pin.trim()}
                className="w-full px-4 py-2.5 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
              >
                {loginBusy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-page-shell overflow-auto">
      <div className="app-panel max-w-4xl mx-auto p-6 md:p-8">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Wing Administrator Console</h1>
            <p className="text-gray-600 mt-1">Content Pack lifecycle management</p>
            <p className="text-sm text-gray-500 mt-2">
              Signed in as{' '}
              <span className="font-medium text-gray-800">
                {session?.name?.trim() || 'Administrator'}
                {session?.wing ? ` · ${session.wing}` : ''}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <GuidedHint
              hintId="adminContentPacks.console"
              stepNumber={1}
              title="Bookmark-only console"
              body={
                <>
                  This page is intentionally hidden from the main navigation. Bookmark{' '}
                  <span className="font-mono text-xs">/admin/content-packs</span> for wing ops. Publishing still requires
                  the Content Pack <strong>X-API-Key</strong> (same key used elsewhere in this app — set it under ForeFlight
                  Content Pack workflow or <code className="text-xs bg-gray-100 px-1 rounded">VITE_CONTENT_PACK_API_KEY</code>{' '}
                  in dev).
                </>
              }
              isSeen={isSeen('adminContentPacks.console')}
              onDismiss={markSeen}
              surface="light"
            />
            <button
              type="button"
              onClick={onSignOut}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-800 hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </header>

        {!hasApiKey && (
          <div
            className="mb-6 rounded-lg border border-cap-yellow/60 bg-cap-yellow/10 px-4 py-3 text-sm text-gray-900"
            role="status"
          >
            No Content Pack API key is configured in this browser. Add one in the ForeFlight Content Pack page (Settings)
            or set <span className="font-mono">VITE_CONTENT_PACK_API_KEY</span> for local dev — uploads and inventory
            requests will fail without it.
          </div>
        )}

        <section className="mb-10 rounded-xl border border-gray-200 bg-white p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Inventory</h2>
            <button
              type="button"
              onClick={() => void refreshInventory()}
              disabled={listBusy}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {listBusy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {listErr && (
            <p className="text-sm text-cap-pimento mb-3" role="alert">
              {listErr}
            </p>
          )}
          {deleteErr && (
            <p className="text-sm text-cap-pimento mb-3" role="alert">
              {deleteErr}
            </p>
          )}
          {packs.length === 0 && !listBusy && !listErr ? (
            <p className="text-sm text-gray-600">No content packs on the server yet. Create an empty pack for a new route or publish from a ZIP below.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <p className="text-xs text-gray-600 mb-3">
                Packs with the same <strong>display name</strong> are still different server rows. Use{' '}
                <strong>CSV member</strong> (path inside the ZIP) to match what you see under ForeFlight Content Pack →
                Settings — it reflects the folder name in the uploaded ZIP. Prefer a clean outer folder name (e.g.{' '}
                <span className="font-mono">SR213_content_pack</span>) before publishing.
              </p>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">CSV member (in ZIP)</th>
                    <th className="py-2 pr-4 font-medium">Route</th>
                    <th className="py-2 pr-4 font-medium">Rev</th>
                    <th className="py-2 pr-4 font-medium">Last updated</th>
                    <th className="py-2 pr-4 font-medium">Waypoints</th>
                    <th className="py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {packs.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4 font-medium text-gray-900 max-w-[10rem] truncate" title={`${p.name} · id ${p.id}`}>
                        {p.name}
                      </td>
                      <td
                        className="py-2 pr-4 font-mono text-xs text-gray-800 max-w-[18rem] sm:max-w-xl truncate"
                        title={p.csv_member_path}
                      >
                        {p.csv_member_path}
                      </td>
                      <td className="py-2 pr-4 text-gray-800">{p.primary_route_number ?? '—'}</td>
                      <td className="py-2 pr-4 tabular-nums">{p.current_revision}</td>
                      <td className="py-2 pr-4 text-gray-700 whitespace-nowrap">{formatDateTime(p.updated_at)}</td>
                      <td className="py-2 pr-4 text-gray-700 tabular-nums">
                        {waypointCounts[p.id] === undefined ? '…' : waypointCounts[p.id] === null ? '—' : waypointCounts[p.id]}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void onDeletePack(p)}
                          disabled={deletingId === p.id || !!deletingId}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-cap-pimento/60 text-cap-pimento hover:bg-red-50 disabled:opacity-40"
                        >
                          {deletingId === p.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-10 rounded-xl border border-gray-200 bg-white p-5 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Create empty pack for a new route</h2>
          <p className="text-xs text-gray-600 mb-4">
            Synthesizes a minimal ForeFlight pack on the server. Route number must be digits only (e.g. MTR route 355 →{' '}
            <span className="font-mono">355</span>).
          </p>
          <form onSubmit={(ev) => void onCreateEmpty(ev)} className="space-y-4 max-w-xl">
            <div>
              <label htmlFor="route-num" className="block text-sm font-medium text-gray-700 mb-1">
                Route number <span className="text-cap-pimento">*</span>
              </label>
              <input
                id="route-num"
                inputMode="numeric"
                autoComplete="off"
                value={newRouteNumber}
                onChange={(e) => setNewRouteNumber(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                placeholder="355"
                disabled={createBusy}
              />
            </div>
            <div>
              <label htmlFor="disp-name" className="block text-sm font-medium text-gray-700 mb-1">
                Display name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="disp-name"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="IR355 Reported Towers"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={createBusy}
              />
            </div>
            <div>
              <label htmlFor="org-name" className="block text-sm font-medium text-gray-700 mb-1">
                Organization name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="org-name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="NM Wing Civil Air Patrol"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={createBusy}
              />
            </div>
            <div>
              <label htmlFor="abbrev" className="block text-sm font-medium text-gray-700 mb-1">
                Abbreviation <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="abbrev"
                value={newAbbrev}
                onChange={(e) => setNewAbbrev(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={createBusy}
              />
            </div>
            {createErr && (
              <p className="text-sm text-cap-pimento" role="alert">
                {createErr}
              </p>
            )}
            {createOk && (
              <p className="text-sm text-cap-ultramarine font-medium" role="status">
                {createOk}
              </p>
            )}
            <button
              type="submit"
              disabled={createBusy || !newRouteNumber.trim()}
              className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
            >
              {createBusy ? 'Creating…' : 'Create empty pack'}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Publish from existing ZIP</h2>
          <p className="text-xs text-gray-600 mb-4">Upload a ForeFlight content-pack ZIP. The server records revision 1 (or next) and waypoint rows from <span className="font-mono">navdata/user_waypoints.csv</span>.</p>
          <form onSubmit={(ev) => void onUploadZip(ev)} className="space-y-4 max-w-xl">
            <div>
              <label htmlFor="zip-file" className="block text-sm font-medium text-gray-700 mb-1">
                ZIP file
              </label>
              <input
                id="zip-file"
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-700"
                disabled={uploadBusy}
              />
            </div>
            <div>
              <label htmlFor="upload-name" className="block text-sm font-medium text-gray-700 mb-1">
                Display name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="upload-name"
                value={uploadDisplayName}
                onChange={(e) => setUploadDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                disabled={uploadBusy}
              />
            </div>
            {uploadErr && (
              <p className="text-sm text-cap-pimento" role="alert">
                {uploadErr}
              </p>
            )}
            {uploadOk && (
              <p className="text-sm text-cap-ultramarine font-medium" role="status">
                {uploadOk}
              </p>
            )}
            {uploadWarn && (
              <p className="text-sm text-cap-yellow bg-cap-yellow/10 border border-cap-yellow/40 rounded-lg px-3 py-2" role="status">
                {uploadWarn}
              </p>
            )}
            <button
              type="submit"
              disabled={uploadBusy || !uploadFile}
              className="px-4 py-2 bg-cap-ultramarine text-white rounded-lg text-sm font-medium hover:bg-cap-ultramarine/90 disabled:opacity-50"
            >
              {uploadBusy ? 'Uploading…' : 'Publish ZIP'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
