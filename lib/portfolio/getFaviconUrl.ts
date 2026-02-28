/**
 * Get favicon URL for a given webpage URL.
 * Uses Google's favicon service for reliable favicon retrieval.
 * @param url - Full URL (e.g. https://www.eventbrite.com/e/event-123)
 * @param size - Favicon size in pixels (16, 32, 48, 64, 128). Default 128.
 */
export function getFaviconUrl(url: string, size: number = 128): string {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''

  try {
    const parsed = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`)
    const domain = parsed.hostname.replace(/^www\./i, '')
    if (!domain) return ''
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`
  } catch {
    return ''
  }
}
