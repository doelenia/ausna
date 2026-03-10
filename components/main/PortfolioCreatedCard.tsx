'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Portfolio, isActivityPortfolio, isProjectPortfolio, isCommunityPortfolio } from '@/types/portfolio'
import { Card, UIText, UIButtonText, UserAvatar, Content } from '@/components/ui'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'
import { ActivityCard } from '@/components/explore/ExploreView'
import type { ExploreActivity, DailyMatchHighlightMeta, DailyMatchAccessibilityHighlight } from '@/app/explore/actions'

export type CreatorProfile = { id: string; name: string; avatar?: string | null }

interface PortfolioCreatedCardProps {
  portfolio: Portfolio
  creator: CreatorProfile
  flatOnMobile?: boolean
  highlight?: DailyMatchHighlightMeta
}

function getPortfolioTypeLabel(portfolio: Portfolio) {
  if (portfolio.type === 'projects') return 'project'
  if (portfolio.type === 'activities') return 'activity'
  return 'community'
}

export function PortfolioCreatedCard({
  portfolio,
  creator,
  flatOnMobile = false,
  highlight,
}: PortfolioCreatedCardProps) {
  const meta = (portfolio.metadata as any) || {}
  const basic = meta.basic || {}
  const emoji: string | undefined = basic.emoji
  const name: string = basic.name || 'Untitled'
  const description: string | undefined = basic.description || undefined
  const avatar: string | undefined = basic.avatar || undefined

  const typeLabel = getPortfolioTypeLabel(portfolio)
  const relative = formatRelativeTime(portfolio.created_at)
  const props = (meta.properties as any) || {}
  const activityDateTime = (props.activity_datetime as ActivityDateTimeValue | null | undefined) ?? null
  const location = (props.location as ActivityLocationValue | null | undefined) ?? null
  const isActivity = isActivityPortfolio(portfolio)

  const activityLike: ExploreActivity = {
    id: portfolio.id,
    name,
    avatar,
    emoji,
    description,
    hostProjectId: isActivity ? (portfolio as any).host_project_id ?? undefined : undefined,
    activityDateTime: isActivity ? activityDateTime : null,
    location: isActivity ? location : null,
    external: isActivity ? props.external === true : false,
  }

  let memberLabel: string | undefined
  let memberUserIds: string[] | undefined
  if (isProjectPortfolio(portfolio) || isCommunityPortfolio(portfolio)) {
    const members: string[] = Array.isArray(meta.members) ? meta.members : []
    if (members.length > 0) {
      const count = members.length
      memberLabel = `${count} member${count === 1 ? '' : 's'}`
      memberUserIds = members
    }
  }

  const [memberUsers, setMemberUsers] = useState<
    Array<{ userId: string; name?: string | null; avatar?: string | null }>
  >([])

  const memberIdsForAvatars = useMemo(() => {
    if (!memberUserIds || memberUserIds.length === 0) return []
    return memberUserIds.slice(0, 3)
  }, [memberUserIds])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (memberIdsForAvatars.length === 0) {
        setMemberUsers([])
        return
      }
      try {
        const res = await fetch(`/api/users/by-ids?ids=${encodeURIComponent(memberIdsForAvatars.join(','))}`)
        if (!res.ok) return
        const json = (await res.json()) as {
          users?: Array<{ id: string; name: string | null; avatar: string | null }>
        }
        const users =
          (json.users || []).map((u) => ({
            userId: u.id,
            name: u.name,
            avatar: u.avatar,
          })) ?? []
        if (!cancelled) setMemberUsers(users)
      } catch {
        // Non-critical UI enhancement
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [memberIdsForAvatars])

  const mergedHighlight: DailyMatchHighlightMeta | undefined = (() => {
    if (!isActivity) return undefined
    const base = highlight
    if (!base && !location) return undefined
    if (!base) {
      return {
        host: undefined,
        accessibility: location
          ? ({
              kind: location.online ? 'online' : 'in_person',
              label: location.online ? 'Online' : 'In person',
            } as DailyMatchAccessibilityHighlight)
          : undefined,
        interestTags: [],
        friends: undefined,
      }
    }
    if (!base.accessibility && location) {
      return {
        ...base,
        accessibility: {
          kind: location.online ? 'online' : 'in_person',
          label: location.online ? 'Online' : 'In person',
        } as DailyMatchAccessibilityHighlight,
      }
    }
    return base
  })()

  const inner = (
    <div className="px-3 pt-3 pb-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <UserAvatar
            userId={creator.id}
            name={creator.name}
            avatar={creator.avatar}
            size={32}
            showLink={false}
          />
          <div className="flex items-baseline gap-2 flex-wrap">
            <UIText as="span" className="text-gray-700">
              {creator.name} created a {typeLabel}
            </UIText>
            <UIButtonText as="span" className="text-gray-500">
              {relative}
            </UIButtonText>
          </div>
        </div>
      </div>

      <ActivityCard
        activity={activityLike}
        hrefOverride={getPortfolioUrl(portfolio.type, portfolio.id)}
        hideMetaRow={!isActivity}
        memberLabel={memberLabel}
        memberUserIds={memberUserIds}
        memberUsers={memberUsers}
        avatarTypeOverride={portfolio.type}
        highlight={mergedHighlight}
      />
    </div>
  )

  if (!flatOnMobile) {
    return (
      <Card variant="subtle" padding="none" className="relative overflow-hidden">
        {inner}
      </Card>
    )
  }

  return (
    <div className="w-full">
      <div className="md:hidden bg-white">{inner}</div>
      <div className="hidden md:block">
        <Card variant="subtle" padding="none" className="relative overflow-hidden">
          {inner}
        </Card>
      </div>
    </div>
  )
}

