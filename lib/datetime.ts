export interface ActivityDateTimeValue {
  start: string
  end?: string | null
  inProgress?: boolean
  allDay?: boolean
}

function snapMinutesToInterval(date: Date, intervalMinutes: number): Date {
  const snapped = new Date(date)
  const minutes = snapped.getMinutes()
  const remainder = minutes % intervalMinutes
  if (remainder === 0) {
    snapped.setSeconds(0, 0)
    return snapped
  }
  const down = minutes - remainder
  snapped.setMinutes(down, 0, 0)
  return snapped
}

export function normalizeActivityDateTime(
  value: ActivityDateTimeValue | null | undefined,
  options: { intervalMinutes?: number } = {}
): ActivityDateTimeValue | null {
  if (!value || !value.start) return null

  const intervalMinutes = options.intervalMinutes ?? 15

  const startDate = new Date(value.start)
  if (Number.isNaN(startDate.getTime())) return null

  // In-progress is only allowed for all-day/date-only mode.
  const inProgressAllowed = value.allDay === true

  if (value.allDay) {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)

    let end: Date | null = null
    if (value.end) {
      const parsedEnd = new Date(value.end)
      if (!Number.isNaN(parsedEnd.getTime())) {
        end = new Date(parsedEnd)
        end.setHours(0, 0, 0, 0)
      }
    }

    if (!end) {
      end = new Date(start)
      end.setDate(end.getDate() + 1)
    }

    if (end < start) {
      end = new Date(start)
      end.setDate(end.getDate() + 1)
    }

    return {
      start: start.toISOString(),
      end: inProgressAllowed && value.inProgress ? null : end.toISOString(),
      inProgress: inProgressAllowed && value.inProgress ? true : false,
      allDay: true,
    }
  }

  const snappedStart = snapMinutesToInterval(startDate, intervalMinutes)

  // If inProgress was passed for timed mode, ignore it.

  let endDate: Date | null = null
  if (value.end) {
    const parsedEnd = new Date(value.end)
    if (!Number.isNaN(parsedEnd.getTime())) {
      endDate = snapMinutesToInterval(parsedEnd, intervalMinutes)
    }
  }

  if (endDate && endDate < snappedStart) {
    endDate = new Date(snappedStart)
  }

  return {
    start: snappedStart.toISOString(),
    end: endDate ? endDate.toISOString() : null,
    inProgress: false,
    allDay: false,
  }
}

