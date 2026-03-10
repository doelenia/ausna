import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isCallToJoinWindowOpen } from '@/lib/callToJoin'
import { isActivityLive } from '@/lib/activityLive'
import type { ActivityCallToJoinConfig } from '@/types/portfolio'
import type { ActivityDateTimeValue } from '@/lib/datetime'
import type { ActivityLocationValue } from '@/lib/location'
import type { ExploreActivity } from '@/app/explore/actions'

export const dynamic = 'force-dynamic'

interface ActivityRow {
  id: string
  user_id: string
  host_project_id?: string | null
  visibility?: string | null
  metadata: {
    basic?: { name?: string; avatar?: string; emoji?: string; description?: string }
    members?: string[]
    managers?: string[]
    status?: string | null
    properties?: {
      activity_datetime?: ActivityDateTimeValue
      location?: ActivityLocationValue
      call_to_join?: { enabled?: boolean; join_by?: string | null } | null
      external?: boolean
      host_project_ids?: string[]
      host_community_ids?: string[]
    }
  }
}

function isOpenToJoin(activity: ActivityRow): boolean {
  const visibility = activity.visibility as 'public' | 'private' | undefined | null
  const props = activity.metadata?.properties
  const status = activity.metadata?.status ?? null
  const isExternal = props?.external === true
  const activityDateTime = props?.activity_datetime

  if (status === 'archived') return false

  if (isExternal) {
    if (!activityDateTime?.start) return true
    const start = new Date(activityDateTime.start)
    if (Number.isNaN(start.getTime())) return true
    const live = isActivityLive(activityDateTime, status)
    let isBeforeStart = false
    if (activityDateTime.allDay) {
      const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      isBeforeStart = new Date() < dayStart
    } else {
      isBeforeStart = new Date() < start
    }
    return isBeforeStart || live
  }

  const raw = props?.call_to_join
  const callToJoin: ActivityCallToJoinConfig | null = raw
    ? {
        enabled: raw.enabled ?? true,
        require_approval: (raw as ActivityCallToJoinConfig).require_approval ?? false,
        join_by: raw.join_by ?? null,
      }
    : null
  return isCallToJoinWindowOpen(visibility, callToJoin, activityDateTime ?? undefined, status)
}

function activityMatchesTargetPortfolio(activity: ActivityRow, target: { id: string; type: string; user_id: string; metadata: any; host_project_id?: string | null }) {
  const props = (activity.metadata?.properties as any) || {}
  const activityMembers: string[] = Array.isArray(activity.metadata?.members) ? activity.metadata.members! : []
  const activityManagers: string[] = Array.isArray(activity.metadata?.managers) ? activity.metadata.managers! : []
  const isExternal = props?.external === true

  if (target.type === 'human') {
    const humanId = String(target.user_id)
    const hostedByHuman = !isExternal && (activity.user_id === humanId || activityManagers.includes(humanId))
    const going = activityMembers.includes(humanId) || activityManagers.includes(humanId)
    return hostedByHuman || going
  }

  if (target.type === 'projects') {
    const hostProjectIds: string[] = Array.isArray(props?.host_project_ids) ? props.host_project_ids : []
    const legacyHost = activity.host_project_id
    return hostProjectIds.includes(target.id) || (legacyHost ? legacyHost === target.id : false)
  }

  if (target.type === 'community') {
    const hostCommunityIds: string[] = Array.isArray(props?.host_community_ids) ? props.host_community_ids : []
    return hostCommunityIds.includes(target.id)
  }

  if (target.type === 'activities') {
    const targetProps = (target.metadata as any)?.properties || {}
    const targetHostProjects: string[] = Array.isArray(targetProps?.host_project_ids) ? targetProps.host_project_ids : []
    const targetHostCommunities: string[] = Array.isArray(targetProps?.host_community_ids) ? targetProps.host_community_ids : []
    const legacyHost = target.host_project_id ? [target.host_project_id] : []

    const targetHostSet = new Set<string>([...targetHostProjects, ...targetHostCommunities, ...legacyHost])
    if (targetHostSet.size === 0) return false

    const candidateHostProjects: string[] = Array.isArray(props?.host_project_ids) ? props.host_project_ids : []
    const candidateHostCommunities: string[] = Array.isArray(props?.host_community_ids) ? props.host_community_ids : []
    const candidateLegacy = activity.host_project_id ? [activity.host_project_id] : []
    const candidateHostAll = [...candidateHostProjects, ...candidateHostCommunities, ...candidateLegacy]

    return candidateHostAll.some((id) => targetHostSet.has(id))
  }

  return false
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  try {
    const portfolioId = params.portfolioId
    if (!portfolioId) {
      return NextResponse.json({ error: 'Portfolio ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ activities: [] })
    }

    const { data: target, error: targetError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, host_project_id, metadata')
      .eq('id', portfolioId)
      .single()

    if (targetError || !target) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    const { data: activitiesRaw } = await supabase
      .from('portfolios')
      .select('id, user_id, host_project_id, visibility, metadata')
      .eq('type', 'activities')
      .limit(500)

    const activities = ((activitiesRaw || []) as ActivityRow[])
      .filter((row) => row.visibility !== 'private')
      .filter((row) => isOpenToJoin(row))
      .filter((row) => activityMatchesTargetPortfolio(row, target as any))
      .slice(0, 50)
      .map((row) => {
        const basic = row.metadata?.basic || {}
        const props = row.metadata?.properties || {}
        const normalized: ExploreActivity = {
          id: row.id,
          name: (basic.name as string) || 'Activity',
          avatar: basic.avatar as string | undefined,
          emoji: basic.emoji as string | undefined,
          description: (basic.description as string) || undefined,
          hostProjectId: row.host_project_id ?? undefined,
          activityDateTime: (props.activity_datetime as ActivityDateTimeValue | null | undefined) ?? null,
          location: (props.location as ActivityLocationValue | null | undefined) ?? null,
          external: props.external === true,
        }
        return normalized
      })

    return NextResponse.json({ activities })
  } catch (error: any) {
    console.error('[API /portfolios/[portfolioId]/joinable-activities] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

