import Link from 'next/link'
import type { Portfolio } from '@/types/portfolio'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'
import type { ParsedActivityUpdateMessage } from '@/lib/messages/activityUpdateMessage'
import { ActivityDateTimeBadge } from './ActivityDateTimeBadge'
import { ActivityLocationBadge } from './ActivityLocationBadge'
import { StickerAvatar } from './StickerAvatar'
import { Content, UIText } from '@/components/ui'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getPortfolioBasic } from '@/lib/portfolio/utils'

interface ActivityUpdateCardProps {
  portfolio: Portfolio
  /** "You" or the other person’s display name. */
  senderLabel: string
  parsedUpdate: ParsedActivityUpdateMessage
  /** Matches reaction / comment preview bubble styling (sent vs received). */
  isSent: boolean
}

export function ActivityUpdateCard({
  portfolio,
  senderLabel,
  parsedUpdate,
  isSent,
}: ActivityUpdateCardProps) {
  const metadata = (portfolio.metadata as any) || {}
  const props = (metadata.properties || {}) as Record<string, any>
  const activity = props.activity_datetime as ActivityDateTimeValue | undefined
  const location = props.location as ActivityLocationValue | undefined
  const hasActivity = !!activity && !!activity.start
  const hasLocation = !!location
  const basic = getPortfolioBasic(portfolio)
  const emoji = (metadata.basic?.emoji as string | undefined) || undefined
  const spaceName =
    basic.name?.trim() ||
    parsedUpdate.spaceNameFromMessage.trim() ||
    'Space'

  const activityUrl = getPortfolioUrl(portfolio)

  const topCaption =
    parsedUpdate.changeKind === 'time'
      ? `${senderLabel} updated the scheduled time:`
      : parsedUpdate.changeKind === 'location'
        ? `${senderLabel} updated the location:`
        : `${senderLabel} updated the time and location:`

  const showTime =
    parsedUpdate.changeKind === 'time' || parsedUpdate.changeKind === 'time_and_location'
  const showLocation =
    parsedUpdate.changeKind === 'location' || parsedUpdate.changeKind === 'time_and_location'

  const outerClass = `block max-w-xs lg:max-w-md border rounded-lg overflow-hidden ${
    isSent ? 'border-blue-300 bg-blue-50' : 'border-gray-300 bg-gray-50'
  } hover:opacity-90 transition-opacity cursor-pointer`

  return (
    <Link href={activityUrl} prefetch className={outerClass} onClick={(e) => e.stopPropagation()}>
      <div className="p-3">
        <UIText className="text-xs font-medium text-blue-700 mb-2 block">{topCaption}</UIText>

        <div className="flex items-center gap-3 mb-3 min-w-0">
          <div className="flex-shrink-0">
            <StickerAvatar
              type="space"
              alt={spaceName}
              src={basic.avatar}
              emoji={emoji}
              name={spaceName}
              size={44}
              variant="mini"
            />
          </div>
          <Content className="truncate min-w-0 leading-snug">{spaceName}</Content>
        </div>

        <div className="max-w-full flex flex-wrap gap-2">
          {showTime &&
            (hasActivity ? (
              <ActivityDateTimeBadge value={activity} disableRootClick />
            ) : (
              <Content as="p">No date and time set.</Content>
            ))}
          {showLocation &&
            (hasLocation ? (
              <ActivityLocationBadge
                value={location}
                canSeeFullLocation
                disableRootClick
              />
            ) : (
              <Content as="p">No location set.</Content>
            ))}
        </div>

        <div className="mt-2 pt-2 border-t border-gray-300">
          <UIText className="text-xs text-blue-600">View space →</UIText>
        </div>
      </div>
    </Link>
  )
}
