import type { ActivityDateTimeValue } from '@/lib/datetime'

export function isActivityLive(
  value?: ActivityDateTimeValue | null,
  status?: string | null
): boolean {
  if (value && value.start) {
    const now = new Date()
    const start = new Date(value.start)
    if (!Number.isNaN(start.getTime())) {
      if (value.allDay) {
        const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate())
        if (value.inProgress) {
          // Open-ended all-day "Present" range: live from start day onwards
          if (now >= dayStart) {
            return true
          }
        } else {
          const endExclusive = value.end ? new Date(value.end) : null
          if (!endExclusive || Number.isNaN(endExclusive.getTime())) {
            if (now >= dayStart && now < new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)) {
              return true
            }
          } else if (now >= dayStart && now < endExclusive) {
            return true
          }
        }
      } else {
        const end = value.end ? new Date(value.end) : null
        if (end && !Number.isNaN(end.getTime())) {
          if (now >= start && now <= end) {
            return true
          }
        } else if (!end && value.inProgress && now >= start) {
          return true
        }
      }
    }
  }

  if (status === 'in-progress') {
    return true
  }

  return false
}

