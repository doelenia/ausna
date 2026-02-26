'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { dateFnsLocalizer, View, Views } from 'react-big-calendar'
import { Calendar as BaseCalendar } from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Card, UIText } from '@/components/ui'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import { activityToCalendarEvent } from '@/lib/calendar/activityEvents'

const locales = {
  'en-US': enUS,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
})

const DnDCalendar = withDragAndDrop(BaseCalendar)

interface ActivityDateTimePickerProps {
  portfolioTitle: string
  initialValue?: ActivityDateTimeValue | null
  onChange: (value: ActivityDateTimeValue | null) => void
}

export function ActivityDateTimePicker({
  portfolioTitle,
  initialValue,
  onChange,
}: ActivityDateTimePickerProps) {
  const hasInitializedDefault = useRef(false)
  const [value, setValue] = useState<ActivityDateTimeValue | null>(initialValue || null)
  const [calendarDate, setCalendarDate] = useState<Date>(() => {
    if (initialValue?.start) {
      const d = new Date(initialValue.start)
      if (!Number.isNaN(d.getTime())) return d
    }
    return new Date()
  })
  const [scrollToTime] = useState<Date>(() => {
    if (initialValue?.start) {
      const d = new Date(initialValue.start)
      if (!Number.isNaN(d.getTime())) return d
    }
    const now = new Date()
    now.setHours(9, 0, 0, 0)
    return now
  })

  useEffect(() => {
    // When there is no existing datetime configured, auto-fill today (all-day)
    // the first time the picker is opened.
    if (!initialValue && !hasInitializedDefault.current) {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const endExclusive = new Date(start)
      endExclusive.setDate(endExclusive.getDate() + 1)

      const defaultValue: ActivityDateTimeValue = {
        start: start.toISOString(),
        end: endExclusive.toISOString(),
        inProgress: false,
        allDay: true,
      }

      hasInitializedDefault.current = true
      setValue(defaultValue)
      onChange(defaultValue)
      return
    }

    setValue(initialValue || null)
  }, [initialValue, onChange])

  const events = useMemo(() => {
    return activityToCalendarEvent(value, portfolioTitle)
  }, [value, portfolioTitle])

  const handleInternalChange = useCallback(
    (next: ActivityDateTimeValue | null) => {
      setValue(next)
      onChange(next)
      if (next?.start) {
        const d = new Date(next.start)
        if (!Number.isNaN(d.getTime())) {
          setCalendarDate(d)
        }
      }
    },
    [onChange]
  )

  const handleSelectSlot = useCallback(
    (slotInfo: any) => {
      const start = slotInfo?.start as Date
      const end = slotInfo?.end as Date

      if (!start || !end) return

      const isAllDaySelection =
        (slotInfo?.action === 'select' || slotInfo?.action === 'click') &&
        start.getHours() === 0 &&
        start.getMinutes() === 0 &&
        end.getHours() === 0 &&
        end.getMinutes() === 0

      handleInternalChange({
        start: start.toISOString(),
        end: end.toISOString(),
        inProgress: false,
        allDay: isAllDaySelection,
      })
    },
    [handleInternalChange]
  )

  const handleEventResize = useCallback(
    ({ start, end }: { start: Date; end: Date }) => {
      handleInternalChange({
        start: start.toISOString(),
        end: end.toISOString(),
        inProgress: value?.inProgress ?? false,
        allDay: value?.allDay ?? false,
      })
    },
    [handleInternalChange, value?.inProgress]
  )

  const handleEventDrop = useCallback(
    ({ start, end }: { start: Date; end: Date }) => {
      handleInternalChange({
        start: start.toISOString(),
        end: end.toISOString(),
        inProgress: value?.inProgress ?? false,
        allDay: value?.allDay ?? false,
      })
    },
    [handleInternalChange, value?.inProgress]
  )

  const isAllDay = value?.allDay ?? true

  const startString = value?.start
    ? isAllDay
      ? format(new Date(value.start), 'yyyy-MM-dd')
      : format(new Date(value.start), "yyyy-MM-dd'T'HH:mm")
    : ''

  const endString = (() => {
    if (!value?.end) return ''
    const end = new Date(value.end)
    if (Number.isNaN(end.getTime())) return ''

    if (!isAllDay) {
      return format(end, "yyyy-MM-dd'T'HH:mm")
    }

    // all-day ranges are stored as end-exclusive; show end-inclusive date
    const endInclusive = new Date(end)
    endInclusive.setDate(endInclusive.getDate() - 1)
    return format(endInclusive, 'yyyy-MM-dd')
  })()

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <UIText as="label" className="block mb-1">
            Start
          </UIText>
          <input
            type={isAllDay ? 'date' : 'datetime-local'}
            value={startString}
            onChange={(e) => {
              const nextStart = e.target.value
              if (!nextStart) {
                handleInternalChange(
                  value?.end || value?.inProgress
                    ? { start: '', end: value?.end, inProgress: value?.inProgress }
                    : null
                )
                return
              }

              if (isAllDay) {
                const start = new Date(`${nextStart}T00:00:00`)
                const endExclusive = value?.end ? new Date(value.end) : null
                const nextEndExclusive = endExclusive && !Number.isNaN(endExclusive.getTime())
                  ? endExclusive
                  : new Date(start.getTime() + 24 * 60 * 60 * 1000)

                handleInternalChange({
                  start: start.toISOString(),
                  end: nextEndExclusive.toISOString(),
                  inProgress: false,
                  allDay: true,
                })
                return
              }

              handleInternalChange({
                start: nextStart,
                end: value?.end,
                inProgress: value?.inProgress,
                allDay: false,
              })
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <UIText as="label">End</UIText>
            {isAllDay && (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!value?.inProgress}
                  onChange={(e) => {
                    const inProgress = e.target.checked
                    const current: ActivityDateTimeValue | null =
                      value ?? { start: '', end: null, inProgress: false, allDay: true }

                    handleInternalChange(
                      current
                        ? {
                            start: current.start,
                            end: inProgress ? null : current.end,
                            inProgress,
                            allDay: true,
                          }
                        : null
                    )
                  }}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <UIText as="span">In progress</UIText>
              </label>
            )}
          </div>
          <div className="flex items-center justify-between mb-1">
            <UIText as="span">All day</UIText>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!value?.allDay}
                onChange={(e) => {
                  const allDay = e.target.checked
                  if (!value?.start) return
                  const start = new Date(value.start)
                  if (Number.isNaN(start.getTime())) return
                  const nextStart = new Date(start)
                  if (allDay) nextStart.setHours(0, 0, 0, 0)
                  const nextEnd = allDay
                    ? new Date(nextStart.getTime() + 24 * 60 * 60 * 1000).toISOString()
                    : value.end

                  handleInternalChange({
                    start: nextStart.toISOString(),
                    end: nextEnd,
                    inProgress: false,
                    allDay,
                  })
                }}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <UIText as="span">Date only</UIText>
            </label>
          </div>
          <input
            type={isAllDay ? 'date' : 'datetime-local'}
            value={endString}
            disabled={!!value?.inProgress}
            onChange={(e) => {
              const nextEnd = e.target.value
              if (!value?.start && !nextEnd) {
                handleInternalChange(null)
                return
              }

              if (isAllDay) {
                const start = value?.start ? new Date(value.start) : new Date(`${nextEnd}T00:00:00`)
                if (Number.isNaN(start.getTime())) return
                const endInclusive = new Date(`${nextEnd}T00:00:00`)
                if (Number.isNaN(endInclusive.getTime())) return
                const endExclusive = new Date(endInclusive)
                endExclusive.setDate(endExclusive.getDate() + 1)

                handleInternalChange({
                  start: new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString(),
                  end: endExclusive.toISOString(),
                  inProgress: false,
                  allDay: true,
                })
                return
              }

              handleInternalChange({
                start: value?.start || nextEnd,
                end: nextEnd || null,
                inProgress: false,
                allDay: false,
              })
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
          />
        </div>
      </div>
      {!isAllDay && (
        <Card variant="subtle">
          <div className="h-[360px]">
            <DnDCalendar
              localizer={localizer}
              events={events}
              defaultView={Views.WEEK as View}
              view={Views.WEEK as View}
              date={calendarDate}
              onNavigate={(date) => setCalendarDate(date)}
              step={15}
              timeslots={1}
              scrollToTime={scrollToTime}
              selectable
              resizable
              onSelectSlot={handleSelectSlot as any}
              onEventDrop={handleEventDrop as any}
              onEventResize={handleEventResize as any}
              draggableAccessor={() => true}
              startAccessor={(event) => (event as any).start as Date}
              endAccessor={(event) => (event as any).end as Date}
              titleAccessor={(event) => (event as any).title as string}
              allDayAccessor={(event) => (event as any).allDay as boolean}
              style={{ height: '100%' }}
            />
          </div>
        </Card>
      )}
    </div>
  )
}

