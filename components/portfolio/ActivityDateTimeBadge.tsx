'use client'

import { useEffect, useState } from 'react'
import { Card, UIText } from '@/components/ui'
import { Pencil } from 'lucide-react'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import { formatActivityRange, getActivityIconParts } from '@/lib/formatActivityDateTime'

interface ActivityDateTimeBadgeProps {
  value?: ActivityDateTimeValue | null
  status?: string | null
  onClick?: () => void
  showEditIcon?: boolean
  onEditIconClick?: () => void
  disableRootClick?: boolean
}

export function ActivityDateTimeBadge({
  value,
  onClick,
  showEditIcon,
  onEditIconClick,
  disableRootClick,
}: ActivityDateTimeBadgeProps) {
  const isSet = !!value && !!value.start
  const label = value ? formatActivityRange(value) : null
  const icon = value ? getActivityIconParts(value) : getActivityIconParts({ start: new Date().toISOString() })

  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  const Wrapper: React.ElementType = onClick && !disableRootClick ? 'button' : 'div'

  return (
    <Wrapper
      type={onClick && !disableRootClick ? 'button' : undefined}
      onClick={disableRootClick ? undefined : onClick}
      className={`${onClick || showEditIcon ? 'inline-block text-left focus:outline-none' : 'inline-block'} group relative`}
    >
      <Card variant="subtle" padding="none">
        <div className="flex items-center gap-2 max-w-full px-2 py-2">
          <div className="w-10 h-10 rounded-lg border flex flex-col items-center justify-center flex-shrink-0 border-gray-200 bg-white">
            <UIText
              as="div"
              className="uppercase text-[10px] text-gray-500 leading-none"
            >
              {icon.month}
            </UIText>
            <UIText
              as="div"
              className="text-base text-gray-900 leading-tight"
            >
              {icon.day}
            </UIText>
          </div>
          <div className="min-w-0 pr-6">
            {ready ? (
              <UIText as="div" className="whitespace-normal break-words">
                {isSet && label ? label : 'Set activity date & time'}
              </UIText>
            ) : (
              <div className="h-4 w-40 rounded-full bg-gray-200 animate-pulse" />
            )}
          </div>
          {showEditIcon && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (onEditIconClick) onEditIconClick()
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </Card>
    </Wrapper>
  )
}

