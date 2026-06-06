import { apiUrl } from '@/config/apiConfig'

export async function fetchMtrWidthTexts(
  routeType: 'IR' | 'VR',
  routeNumber: string
): Promise<{ effectiveDate: string; widthTexts: string[] }> {
  const params = new URLSearchParams({ routeType, routeNumber })
  const res = await fetch(apiUrl(`/api/mtr/width?${params}`))
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `MTR width API error: ${res.status}`)
  }
  return res.json() as Promise<{ effectiveDate: string; widthTexts: string[] }>
}
