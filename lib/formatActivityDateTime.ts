import type { ActivityDateTimeValue } from '@/lib/datetime'

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatActivityRange(value: ActivityDateTimeValue): string {
  const start = new Date(value.start)
  if (Number.isNaN(start.getTime())) return ''

  if (value.allDay) {
    const startDay = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(start)
    if (value.inProgress) {
      return `${startDay} – Present`
    }

    const end = value.end ? new Date(value.end) : null
    if (!end || Number.isNaN(end.getTime())) {
      return startDay
    }

    const endInclusive = new Date(end)
    endInclusive.setDate(endInclusive.getDate() - 1)

    const endDay = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(endInclusive)

    if (startDay === endDay) return startDay
    return `${startDay} – ${endDay}`
  }

  if (value.inProgress) {
    return `${formatDateTime(start)} – Present`
  }

  if (!value.end) {
    return formatDateTime(start)
  }

  const end = new Date(value.end)
  if (Number.isNaN(end.getTime())) {
    return formatDateTime(start)
  }

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()

  if (sameDay) {
    const dayPart = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(start)

    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })

    return `${dayPart} · ${timeFormatter.format(start)} – ${timeFormatter.format(end)}`
  }

  return `${formatDateTime(start)} – ${formatDateTime(end)}`
}

export function getActivityIconParts(value: ActivityDateTimeValue): { month: string; day: string } {
  const start = new Date(value.start)
  if (Number.isNaN(start.getTime())) {
    return { month: '', day: '' }
  }

  const month = new Intl.DateTimeFormat(undefined, {
    month: 'short',
  }).format(start)

  const day = String(start.getDate())

  return { month, day }
}

