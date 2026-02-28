/**
 * Normalize external activity URL for duplicate detection.
 * Ensures URLs that refer to the same resource compare as equal.
 */
export function normalizeExternalLink(url: string): string {
  if (!url || typeof url !== 'string') return ''
  let u = url.trim()
  if (!u) return ''

  // Add protocol if missing
  if (!u.match(/^https?:\/\//i)) {
    u = u.startsWith('//') ? `https:${u}` : `https://${u}`
  }

  try {
    const parsed = new URL(u)
    const host = parsed.hostname.replace(/^www\./i, '')
    let path = parsed.pathname
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1)
    }
    const normalized = `https://${host}${path}${parsed.search || ''}`
    return normalized
  } catch {
    return u
  }
}
