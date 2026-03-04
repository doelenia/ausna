import Link from 'next/link'
import type { Portfolio } from '@/types/portfolio'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'
import { ActivityDateTimeBadge } from './ActivityDateTimeBadge'
import { ActivityLocationBadge } from './ActivityLocationBadge'
import { Card, UIText } from '@/components/ui'
import { getPortfolioUrl } from '@/lib/portfolio/routes'

interface ActivityUpdateCardProps {
  portfolio: Portfolio
}

export function ActivityUpdateCard({ portfolio }: ActivityUpdateCardProps) {
  const metadata = (portfolio.metadata as any) || {}
  const props = (metadata.properties || {}) as Record<string, any>
  const activity = props.activity_datetime as ActivityDateTimeValue | undefined
  const location = props.location as ActivityLocationValue | undefined
  const hasActivity = !!activity && !!activity.start
  const hasLocation = !!location

  if (!hasActivity && !hasLocation) {
    return null
  }

  const activityUrl = getPortfolioUrl('activities', portfolio.id)

  return (
    <Link
      href={activityUrl}
      className="block"
      onClick={(e) => e.stopPropagation()}
    >
      <Card variant="subtle" padding="sm">
        <div className="flex flex-col gap-2">
          <UIText className="text-gray-600">Updated activity details</UIText>
          <div className="flex flex-wrap gap-2">
            {hasActivity && (
              <ActivityDateTimeBadge value={activity} disableRootClick />
            )}
            {hasLocation && (
              <ActivityLocationBadge
                value={location}
                canSeeFullLocation
                disableRootClick
              />
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}

