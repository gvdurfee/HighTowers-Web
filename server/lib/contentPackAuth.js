/**
 * Optional API key for Content Pack routes. If CONTENT_PACK_API_KEY is unset, routes stay open (dev).
 */
export function contentPackAuth(req, res, next) {
  const key = process.env.CONTENT_PACK_API_KEY?.trim()
  if (!key) return next()
  const auth = req.headers.authorization
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const xk = req.headers['x-api-key']
  const headerKey = typeof xk === 'string' ? xk.trim() : Array.isArray(xk) ? xk[0]?.trim() ?? '' : ''
  if (bearer === key || headerKey === key) return next()
  res.status(401).json({ error: 'Unauthorized (Content Pack API key required)' })
}
