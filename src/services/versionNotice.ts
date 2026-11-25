export const VERSION_CHECK_MS = 30 * 60 * 1000

export function versionJsonUrl(baseUrl: string, cacheBust: number): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}version.json?v=${cacheBust}`
}

export function bannerRecommended(bundledId: string, publishedId: string | null): boolean {
  return Boolean(publishedId && publishedId !== bundledId)
}

export async function fetchPublishedVersionId(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const response = await fetchImpl(versionJsonUrl(baseUrl, Date.now()), { cache: 'no-store' })
    if (!response.ok) return null
    const body = (await response.json()) as { id?: unknown }
    return typeof body?.id === 'string' && body.id ? body.id : null
  } catch {
    return null
  }
}
