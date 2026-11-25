import { useEffect, useState } from 'react'
import { bannerRecommended, fetchPublishedVersionId, VERSION_CHECK_MS } from '@/services/versionNotice'

const BUNDLED_ID = typeof __HTW_BUILD_ID__ === 'string' ? __HTW_BUILD_ID__ : ''

export function VersionUpdateBanner() {
  const [publishedId, setPublishedId] = useState<string | null>(null)
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let cancelled = false
    const look = () => {
      void fetchPublishedVersionId(import.meta.env.BASE_URL).then((id) => {
        if (!cancelled) setPublishedId(id)
      })
    }
    look()
    const onFocus = () => look()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') look()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(look, VERSION_CHECK_MS)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [])

  if (!bannerRecommended(BUNDLED_ID, publishedId) || dismissedId === publishedId) return null
  return (
    <div className="shrink-0 px-4 py-2 text-sm text-gray-900 bg-cap-yellow flex flex-wrap items-center gap-3" role="status">
      <span>A new version of HighTowers-Web is available. Refresh to update.</span>
      <button type="button" className="underline font-medium" onClick={() => window.location.reload()}>
        Refresh
      </button>
      <button type="button" className="underline" onClick={() => setDismissedId(publishedId)}>
        Dismiss
      </button>
    </div>
  )
}
