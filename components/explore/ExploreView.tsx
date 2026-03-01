'use client'

import Link from 'next/link'
import { Card, Title, Content } from '@/components/ui'
import { StickerAvatar } from '@/components/portfolio/StickerAvatar'
import { ActivityDateTimeBadge } from '@/components/portfolio/ActivityDateTimeBadge'
import { ActivityLocationBadge } from '@/components/portfolio/ActivityLocationBadge'
import type { ExploreActivity } from '@/app/explore/actions'

interface ExploreViewProps {
  activities: ExploreActivity[]
}

export function ExploreView({ activities }: ExploreViewProps) {
  if (activities.length === 0) {
    return (
      <div className="px-4 py-8">
        <Card variant="default" padding="md">
          <Content className="text-gray-500">
            No activities to explore right now. Check back later or create one yourself.
          </Content>
        </Card>
      </div>
    )
  }

  return (
    <div className="px-4 py-6">
      <ul className="flex flex-col gap-4">
        {activities.map((activity) => (
          <li key={activity.id}>
            <Link href={`/portfolio/activities/${activity.id}`} className="block">
              <Card variant="default" padding="md" className="hover:border-gray-300 transition-colors">
                <div className="flex gap-4">
                  <StickerAvatar
                    src={activity.avatar}
                    alt={activity.name}
                    type="activities"
                    size={64}
                    emoji={activity.emoji}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-2">
                      <Title as="h2" className="text-lg">
                        {activity.name}
                      </Title>
                    </div>
                    {activity.activityDateTime?.start && (
                      <div className="mb-2">
                        <ActivityDateTimeBadge
                          value={activity.activityDateTime}
                          disableRootClick
                        />
                      </div>
                    )}
                    {(activity.location?.online || activity.location?.city || activity.location?.line1) && (
                      <ActivityLocationBadge
                        value={activity.location}
                        canSeeFullLocation={false}
                        disableRootClick
                      />
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
