'use client'

import { useEffect, useState } from 'react'
import { Card, UIText } from '@/components/ui'
import { MapPin, Pencil } from 'lucide-react'
import type { ActivityLocationValue } from '@/lib/location'
import { formatActivityLocation } from '@/lib/formatActivityLocation'

interface ActivityLocationBadgeProps {
  value?: ActivityLocationValue | null
  canSeeFullLocation?: boolean
  onClick?: () => void
  onUnauthorizedClick?: () => void
  showEditIcon?: boolean
  onEditIconClick?: () => void
  disableRootClick?: boolean
}

export function ActivityLocationBadge({
  value,
  canSeeFullLocation,
  onClick,
  onUnauthorizedClick,
  showEditIcon,
  onEditIconClick,
  disableRootClick,
}: ActivityLocationBadgeProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  const hasLocation = !!value
  const { line1, line2, googleMapsQuery } = formatActivityLocation(value || null)
  const isExactPrivate = !!value?.isExactLocationPrivate

  const showFirstLine = hasLocation && !!line1 && (canSeeFullLocation || !isExactPrivate)
  const showSecondLine = hasLocation && !!line2

  const displayFirstLine = showFirstLine ? line1 : null
  const displaySecondLine = showSecondLine ? line2 : null

  const Wrapper: React.ElementType =
    (onClick && !disableRootClick) || onUnauthorizedClick ? 'button' : 'div'

  const handleClick = () => {
    if (disableRootClick) return
    // In create/edit flows we still want the badge to open the picker
    // even before a location is set.
    if (!hasLocation) {
      if (onClick) onClick()
      return
    }

    if (canSeeFullLocation && googleMapsQuery && onClick) {
      onClick()
      return
    }
    if (!canSeeFullLocation && isExactPrivate && onUnauthorizedClick) {
      onUnauthorizedClick()
    }
  }

  return (
    <Wrapper
      type={(onClick && !disableRootClick) || onUnauthorizedClick ? 'button' : undefined}
      onClick={handleClick}
      className={`${onClick || onUnauthorizedClick || showEditIcon ? 'inline-block text-left focus:outline-none' : 'inline-block'} group relative`}
    >
      <Card variant="subtle" padding="none">
        <div className="flex items-center gap-2 max-w-full px-2 py-2">
          <div className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 border-gray-200 bg-white">
            <MapPin className="w-5 h-5 text-gray-700" />
          </div>
          <div className="min-w-0 pr-6">
            {ready ? (
              !hasLocation ? (
                <UIText as="div" className="whitespace-normal break-words">
                  Set location
                </UIText>
              ) : (
                <div className={`flex flex-col ${!displayFirstLine && displaySecondLine ? 'items-start justify-center' : ''}`}>
                  {displayFirstLine && (
                    <UIText as="div" className="whitespace-normal break-words">
                      {displayFirstLine}
                    </UIText>
                  )}
                  {displaySecondLine && (
                    <UIText as="div" className="whitespace-normal break-words text-gray-600">
                      {displaySecondLine}
                    </UIText>
                  )}
                </div>
              )
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

