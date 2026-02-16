/**
 * Returns a human-readable relative time string (e.g. "5 minutes ago", "2 days ago").
 * @param dateOrIso - Date instance or ISO date string
 * @param now - Optional reference time (default: current time)
 */
export function formatRelativeTime(
  dateOrIso: Date | string,
  now: Date = new Date()
): string {
  const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffMonth = Math.floor(diffDay / 30)
  const diffYear = Math.floor(diffDay / 365)

  if (diffSec < 0) return 'just now'
  if (diffSec < 60) return diffSec <= 1 ? '1 second ago' : `${diffSec} seconds ago`
  if (diffMin < 60) return diffMin <= 1 ? '1 minute ago' : `${diffMin} minutes ago`
  if (diffHour < 24) return diffHour <= 1 ? '1 hour ago' : `${diffHour} hours ago`
  if (diffDay < 30) return diffDay <= 1 ? '1 day ago' : `${diffDay} days ago`
  if (diffMonth < 12) return diffMonth <= 1 ? '1 month ago' : `${diffMonth} months ago`
  return diffYear <= 1 ? '1 year ago' : `${diffYear} years ago`
}
