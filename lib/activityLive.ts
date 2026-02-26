import type { ActivityDateTimeValue } from '@/lib/datetime'

export function isActivityLive(
  value?: ActivityDateTimeValue | null,
  status?: string | null
): boolean {
  if (!value || !value.start) {
    return false
  }

  const now = new Date()
  const startRaw = new Date(value.start)
  if (Number.isNaN(startRaw.getTime())) {
    return false
  }

  if (value.allDay) {
    const dayStart = new Date(startRaw.getFullYear(), startRaw.getMonth(), startRaw.getDate())
    const endExclusive = value.end ? new Date(value.end) : null
    const hasEnd = endExclusive && !Number.isNaN(endExclusive.getTime())
    if (hasEnd) {
      return now >= dayStart && now < endExclusive
    }
    // No end datetime: active from start day onwards
    return now >= dayStart
  }

  const end = value.end ? new Date(value.end) : null
  const hasEnd = end && !Number.isNaN(end.getTime())
  if (hasEnd) {
    return now >= startRaw && now <= end
  }
  // No end datetime: active once start has passed
  return now >= startRaw
}

