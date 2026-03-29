'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import {
  Portfolio,
  isHumanPortfolio,
  normalizePinnedItemType,
  PinnedItem,
  ActivityCallToJoinConfig,
  HumanAvailabilitySchedule,
  DB_NON_HUMAN_TYPES,
} from '@/types/portfolio'
import { normalizeActivityDateTime } from '@/lib/datetime'
import {
  getPortfolioBasic,
  canEditPortfolio,
  canDeletePortfolio,
  canManagePinned,
  canAddToPinned,
  getPinnedItemsCount,
  isNoteAssignedToPortfolio,
} from '@/lib/portfolio/helpers'
import { Note } from '@/types/note'
import { revalidatePortfolioPathsForIdAndSlug } from '@/lib/portfolio/revalidatePaths'
import { getSpaceMembersUrl, getSpaceUrl } from '@/lib/portfolio/routes'
import { deriveSpaceCapabilities } from '@/lib/portfolio/spaceCapabilities'

interface UpdatePortfolioResult {
  success: boolean
  error?: string
}

interface DeletePortfolioResult {
  success: boolean
  error?: string
}

interface SubPortfolio {
  id: string
  type: 'space'
  name: string
  avatar?: string
  slug: string
  role: string // Role of the current user in this portfolio
  projectType?: string | null // Project type specific
}

interface GetSubPortfoliosResult {
  success: boolean
  projects?: SubPortfolio[]
  communities?: SubPortfolio[]
  error?: string
}

interface PinnedItemWithData {
  type: 'space' | 'note'
  id: string
  portfolio?: {
    id: string
    type: string
    name: string
    avatar?: string
    slug: string
    role?: 'manager' | 'member' // Role of the human portfolio owner in this pinned portfolio
  }
  note?: {
    id: string
    text: string
    owner_account_id: string
    created_at: string
    references?: any[]
    assigned_portfolios?: string[]
    mentioned_note_id?: string | null
    updated_at?: string
    deleted_at?: string | null
    summary?: string | null
    compound_text?: string | null
    topics?: string[]
    intentions?: string[]
    indexing_status?: any
    visibility?: 'public' | 'private'
  }
}

interface GetPinnedItemsResult {
  success: boolean
  items?: PinnedItemWithData[]
  error?: string
}

interface AddToPinnedResult {
  success: boolean
  error?: string
}

interface RemoveFromPinnedResult {
  success: boolean
  error?: string
}

interface UpdatePinnedListResult {
  success: boolean
  error?: string
}

interface EligibleItem {
  type: 'space' | 'note'
  id: string
  name?: string
  text?: string
  avatar?: string
  slug?: string
  role?: string // Role of the current user in this portfolio (for human portfolios)
  isPinned: boolean
}

interface GetEligibleItemsResult {
  success: boolean
  notes?: EligibleItem[]
  portfolios?: EligibleItem[]
  error?: string
}

const HUMAN_AVAILABILITY_DAYS: Array<keyof HumanAvailabilitySchedule> = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

function normalizeHumanAvailabilitySchedule(
  raw: unknown
): HumanAvailabilitySchedule | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined
  }

  const source = raw as Record<string, any>
  const normalized: HumanAvailabilitySchedule = {}

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/

  for (const day of HUMAN_AVAILABILITY_DAYS) {
    const value = source[day as string]
    if (!value || typeof value !== 'object') continue

    const enabled = Boolean(value.enabled)
    let startTime: string | undefined =
      typeof value.startTime === 'string' && timeRegex.test(value.startTime)
        ? value.startTime
        : undefined
    let endTime: string | undefined =
      typeof value.endTime === 'string' && timeRegex.test(value.endTime)
        ? value.endTime
        : undefined

    // If both times are present but invalid order, drop endTime
    if (startTime && endTime && endTime <= startTime) {
      endTime = undefined
    }

    const hasAnyField = enabled || !!startTime || !!endTime
    if (!hasAnyField) continue

    normalized[day] = {
      enabled,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

/**
 * Get sub-portfolios for a given portfolio
 * For human portfolios: returns projects and communities where user is a manager or member
 * For project/community portfolios: returns empty (no sub-portfolios)
 */
export async function getSubPortfolios(portfolioId: string): Promise<GetSubPortfoliosResult> {
  try {
    const supabase = await createClient()
    
    // Get the portfolio to determine its type
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    const portfolioData = portfolio as Portfolio

    if (isHumanPortfolio(portfolioData)) {
      // For human portfolios: fetch projects and communities where user is a manager OR member
      const userId = portfolioData.user_id
      const humanMetadata = portfolioData.metadata as any
      const ownedProjectsList = humanMetadata?.owned_projects || []

      const selectInvolved =
        'id, type, slug, metadata, user_id, visibility, created_at' as const

      // 1) Owned rows ordered by human metadata list (activity order)
      let ownedOrderedFromMetadata: any[] = []
      if (ownedProjectsList.length > 0) {
        const { data: ownedProjectsData, error: ownedError } = await supabase
          .from('portfolios')
          .select(selectInvolved)
          .in('type', [...DB_NON_HUMAN_TYPES])
          .in('id', ownedProjectsList)

        if (ownedError) {
          return { success: false, error: 'Failed to fetch sub-portfolios' }
        }
        if (ownedProjectsData) {
          const projectMap = new Map(ownedProjectsData.map((p: any) => [p.id, p]))
          ownedOrderedFromMetadata = ownedProjectsList
            .map((id: string) => projectMap.get(id))
            .filter((p: any) => p !== undefined)
        }
      }

      // 2) All spaces owned by this user (not only those in owned_projects — fixes empty/stale lists)
      const { data: ownedByUserColumn, error: ownedColError } = await supabase
        .from('portfolios')
        .select(selectInvolved)
        .in('type', [...DB_NON_HUMAN_TYPES])
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (ownedColError) {
        return { success: false, error: 'Failed to fetch sub-portfolios' }
      }

      const ownedIdsFromMetadata = new Set(ownedOrderedFromMetadata.map((p: any) => p.id))
      const ownedExtraFromColumn = (ownedByUserColumn || []).filter(
        (p: any) => !ownedIdsFromMetadata.has(p.id)
      )
      const ownedProjects = [...ownedOrderedFromMetadata, ...ownedExtraFromColumn]
      const allOwnedIds = new Set((ownedByUserColumn || []).map((p: any) => p.id))

      // 3) Involvement via managers / members — do not use a global LIMIT 100 (misses older spaces)
      const [managersResult, membersResult] = await Promise.all([
        supabase
          .from('portfolios')
          .select(selectInvolved)
          .in('type', [...DB_NON_HUMAN_TYPES])
          .contains('metadata', { managers: [userId] }),
        supabase
          .from('portfolios')
          .select(selectInvolved)
          .in('type', [...DB_NON_HUMAN_TYPES])
          .contains('metadata', { members: [userId] }),
      ])

      if (managersResult.error || membersResult.error) {
        return {
          success: false,
          error: 'Failed to fetch sub-portfolios',
        }
      }

      const involvementById = new Map<string, any>()
      for (const p of managersResult.data || []) {
        involvementById.set(p.id, p)
      }
      for (const p of membersResult.data || []) {
        if (!involvementById.has(p.id)) involvementById.set(p.id, p)
      }

      // Collaborator-only spaces (not owned by this user)
      const memberProjects = [...involvementById.values()].filter((p: any) => {
        if (p.user_id === userId) return false
        if (allOwnedIds.has(p.id)) return false
        const metadata = p.metadata as any
        const managers = metadata?.managers || []
        const members = metadata?.members || []
        return (
          (Array.isArray(managers) && managers.includes(userId)) ||
          (Array.isArray(members) && members.includes(userId))
        )
      })
      memberProjects.sort((a: any, b: any) => {
        const ta = new Date(a.created_at || 0).getTime()
        const tb = new Date(b.created_at || 0).getTime()
        return tb - ta
      })

      const allUserProjects = [...ownedProjects, ...memberProjects]

      // Map to result format
      const projects = allUserProjects.map((p: any) => {
        const metadata = p.metadata as any
        const managers = metadata?.managers || []
        const members = metadata?.members || []
        const isOwner = p.user_id === userId
        const isManager = Array.isArray(managers) && managers.includes(userId)
        const memberRoles = metadata?.memberRoles || {}
        const userRole = memberRoles[userId] || (isOwner ? 'Creator' : isManager ? 'Manager' : 'Member')
        const projectTypeSpecific = metadata?.project_type_specific || null
        const basic = getPortfolioBasic(p as Portfolio)
        return {
          id: p.id,
          type: 'space' as const,
          name: basic.name,
          avatar: basic.avatar,
          slug: p.slug,
          role: userRole,
          projectType: projectTypeSpecific,
          visibility: (p as any).visibility === 'private' ? 'private' : 'public',
        }
      })

      // Communities tab: manager or member (includes co-managed spaces; not limited to latest N rows globally)
      const communities = [...involvementById.values()]
        .filter((p: any) => {
          const metadata = p.metadata as any
          const managers = metadata?.managers || []
          const members = metadata?.members || []
          return (
            (Array.isArray(managers) && managers.includes(userId)) ||
            (Array.isArray(members) && members.includes(userId))
          )
        })
        .map((p: any) => {
          const metadata = p.metadata as any
          const managers = metadata?.managers || []
          const isManager = Array.isArray(managers) && managers.includes(userId)
          const memberRoles = metadata?.memberRoles || {}
          const userRole = memberRoles[userId] || (isManager ? 'Manager' : 'Member')
          const projectTypeSpecific = metadata?.project_type_specific || null
          const basic = getPortfolioBasic(p as Portfolio)
          return {
            id: p.id,
            type: 'space' as const,
            name: basic.name,
            avatar: basic.avatar,
            slug: p.slug,
            role: userRole,
            projectType: projectTypeSpecific,
          }
        })

      return {
        success: true,
        projects,
        communities,
      }
    } else if (!isHumanPortfolio(portfolioData)) {
      // For non-human portfolios: no sub-portfolios (hosts concept removed)
      return {
        success: true,
        projects: [],
        communities: [],
      }
    }

    return {
      success: false,
      error: 'Invalid portfolio type',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

export async function updatePortfolio(
  formData: FormData
): Promise<UpdatePortfolioResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    const portfolioId = formData.get('portfolioId') as string
    const name = formData.get('name') as string
    const description = formData.get('description') as string | null
    const avatarFile = formData.get('avatar') as File | null
    const emoji = formData.get('emoji') as string | null
    const projectTypeGeneral = formData.get('project_type_general') as string | null
    const projectTypeSpecific = formData.get('project_type_specific') as string | null
    const visibilityRaw = formData.get('visibility') as string | null
    const projectStatusRaw = formData.get('project_status') as string | null
    const activityStartRaw = formData.get('activity_datetime_start') as string | null
    const activityEndRaw = formData.get('activity_datetime_end') as string | null
    const activityInProgressRaw = formData.get('activity_datetime_in_progress') as string | null
    const activityAllDayRaw = formData.get('activity_datetime_all_day') as string | null
    const activityLocationLine1Raw = formData.get('activity_location_line1') as string | null
    const activityLocationCityRaw = formData.get('activity_location_city') as string | null
    const activityLocationStateRaw = formData.get('activity_location_state') as string | null
    const activityLocationCountryRaw = formData.get('activity_location_country') as string | null
    const activityLocationCountryCodeRaw = formData.get('activity_location_country_code') as string | null
    const activityLocationStateCodeRaw = formData.get('activity_location_state_code') as string | null
    const activityLocationPrivateRaw = formData.get('activity_location_private') as string | null
    const activityLocationOnlineRaw = formData.get('activity_location_online') as string | null
    const activityLocationOnlineUrlRaw = formData.get('activity_location_online_url') as string | null
    const activityLocationOnlinePrivateRaw = formData.get(
      'activity_location_online_private'
    ) as string | null
    const hostProjectIdsRaw = formData.get('host_project_ids') as string | null
    const hostCommunityIdsRaw = formData.get('host_community_ids') as string | null
    const orgMembershipEmailSuffixesRaw = formData.get('org_membership_email_suffixes') as string | null
    const humanAutoCityLocationEnabledRaw = formData.get(
      'human_auto_city_location_enabled'
    ) as string | null
    const humanAvailabilityScheduleRaw = formData.get(
      'human_availability_schedule'
    ) as string | null
    const iAmGoingRaw = formData.get('i_am_going') as string | null

    if (!portfolioId) {
      return {
        success: false,
        error: 'Portfolio ID is required',
      }
    }

    // Check if user can edit (creator or manager)
    const canEdit = await canEditPortfolio(portfolioId, user.id)
    if (!canEdit) {
      return {
        success: false,
        error: 'You do not have permission to update this portfolio',
      }
    }

    // Get portfolio for metadata access
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('metadata, type, user_id, visibility, slug')
      .eq('id', portfolioId)
      .single()

    if (!portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    // Get current metadata
    const currentMetadata = (portfolio.metadata as any) || {}
    const basicMetadata = currentMetadata.basic || {}
    const oldDescription = (basicMetadata.description || '').trim()

    // Normalize description from formData (could be string or null)
    const incomingDescription =
      description !== null && description !== undefined ? description : (basicMetadata.description || '')

    if (incomingDescription.length > 3000) {
      return {
        success: false,
        error: 'Description must be 3000 characters or less',
      }
    }

    const normalizedDescription = description !== null && description !== undefined 
      ? description.trim() 
      : (basicMetadata.description || '').trim()

    // Update basic metadata
    const updatedMetadata: any = {
      ...currentMetadata,
      basic: {
        ...basicMetadata,
        name: name || basicMetadata.name,
        description: normalizedDescription,
        avatar: basicMetadata.avatar, // Will be updated separately if avatar file is provided
        // Update emoji if provided, or clear it if empty string is sent
        emoji: emoji !== null ? (emoji || '') : basicMetadata.emoji,
      },
    }

    // Update portfolio subtype metadata if provided for non-human portfolios
    // Allow clearing project types by providing empty values
    if (portfolio.type !== 'human') {
      if (projectTypeGeneral !== null && projectTypeSpecific !== null) {
        // If both are provided (even if empty), update them
        updatedMetadata.project_type_general = projectTypeGeneral || undefined
        updatedMetadata.project_type_specific = projectTypeSpecific || undefined
      }
      // If not provided in formData, leave existing values unchanged
    }

    // Persist time/location for any non-human portfolio.
    // For activities, we also track changes for member notifications.
    let activityTimeChanged = false
    let activityLocationChanged = false

    if (portfolio.type !== 'human') {
      const properties = (currentMetadata.properties || {}) as Record<string, any>
      const hasAnyActivityField =
        (activityStartRaw && activityStartRaw.trim().length > 0) ||
        (activityEndRaw && activityEndRaw.trim().length > 0) ||
        (activityInProgressRaw && activityInProgressRaw.trim().length > 0) ||
        (activityAllDayRaw && activityAllDayRaw.trim().length > 0)

      const previousActivityDateTime = (properties.activity_datetime || null) as
        | import('@/lib/datetime').ActivityDateTimeValue
        | null

      if (hasAnyActivityField) {
        const normalized = normalizeActivityDateTime(
          {
          start: activityStartRaw || '',
          end: activityEndRaw || undefined,
          inProgress: activityInProgressRaw === 'true',
          allDay: activityAllDayRaw === 'true',
          },
          { intervalMinutes: 1 }
        )

        if (normalized) {
          const nextProperties: Record<string, any> = {
            ...properties,
            activity_datetime: normalized,
          }

          // Call-to-join: no auto-managed join_by. When no join_by is set, window closes
          // when activity end has passed or status is archived (evaluated at read/apply time).
          updatedMetadata.properties = nextProperties

          const nextActivityDateTime = (nextProperties.activity_datetime ||
            null) as import('@/lib/datetime').ActivityDateTimeValue | null
          if (portfolio.type !== 'human') {
            activityTimeChanged =
              JSON.stringify(previousActivityDateTime || null) !==
              JSON.stringify(nextActivityDateTime || null)
          }
        } else {
          // If normalization failed, remove the property rather than saving invalid data
          const { activity_datetime, ...rest } = properties
          updatedMetadata.properties = Object.keys(rest).length > 0 ? rest : undefined

          const hadPrevious = previousActivityDateTime != null
          const hasNext =
            (updatedMetadata.properties as Record<string, any> | undefined)
              ?.activity_datetime != null
          if (portfolio.type !== 'human') {
            activityTimeChanged = hadPrevious !== hasNext
          }
        }
      } else if (properties && Object.prototype.hasOwnProperty.call(properties, 'activity_datetime')) {
        const { activity_datetime, ...rest } = properties
        updatedMetadata.properties = Object.keys(rest).length > 0 ? rest : undefined

        const hadPrevious = previousActivityDateTime != null
        const hasNext =
          (updatedMetadata.properties as Record<string, any> | undefined)
            ?.activity_datetime != null
        if (portfolio.type !== 'human') {
          activityTimeChanged = hadPrevious !== hasNext
        }
      }

      const locationLine1 = activityLocationLine1Raw?.trim() || ''
      const locationCity = activityLocationCityRaw?.trim() || ''
      const locationState = activityLocationStateRaw?.trim() || ''
      const locationCountry = activityLocationCountryRaw?.trim() || ''
      const locationCountryCode = activityLocationCountryCodeRaw?.trim() || ''
      const locationStateCode = activityLocationStateCodeRaw?.trim() || ''
      const locationPrivate = activityLocationPrivateRaw === 'true'

      const isLocationOnline = activityLocationOnlineRaw === 'true'
      const locationOnlineUrl = (activityLocationOnlineUrlRaw || '').trim() || undefined
      const locationOnlinePrivate = activityLocationOnlinePrivateRaw === 'true'

      const hasAnyLocationField =
        (activityLocationLine1Raw !== null && activityLocationLine1Raw !== undefined) ||
        (activityLocationCityRaw !== null && activityLocationCityRaw !== undefined) ||
        (activityLocationStateRaw !== null && activityLocationStateRaw !== undefined) ||
        (activityLocationCountryRaw !== null && activityLocationCountryRaw !== undefined) ||
        (activityLocationCountryCodeRaw !== null && activityLocationCountryCodeRaw !== undefined) ||
        (activityLocationStateCodeRaw !== null && activityLocationStateCodeRaw !== undefined) ||
        (activityLocationPrivateRaw !== null && activityLocationPrivateRaw !== undefined) ||
        (activityLocationOnlineRaw !== null && activityLocationOnlineRaw !== undefined)

      const previousLocation = (properties.location || null) as
        | import('@/lib/location').ActivityLocationValue
        | null

      if (hasAnyLocationField) {
        const nextProperties = (updatedMetadata.properties || properties || {}) as Record<string, any>

        const hasAnyNonEmptyLocationField =
          locationLine1.length > 0 ||
          locationCity.length > 0 ||
          locationState.length > 0 ||
          locationCountry.length > 0 ||
          locationCountryCode.length > 0 ||
          locationStateCode.length > 0 ||
          locationPrivate ||
          isLocationOnline ||
          locationOnlinePrivate

        if (hasAnyNonEmptyLocationField) {
          const location: Record<string, any> = {}
          if (isLocationOnline) {
            location.online = true
            if (locationOnlineUrl) location.onlineUrl = locationOnlineUrl
            if (locationOnlinePrivate) location.isOnlineLocationPrivate = true
          } else {
            if (locationLine1) location.line1 = locationLine1
            if (locationCity) location.city = locationCity
            if (locationState) location.state = locationState
            if (locationCountry) location.country = locationCountry
            if (locationCountryCode) location.countryCode = locationCountryCode
            if (locationStateCode) location.stateCode = locationStateCode
            if (locationPrivate) location.isExactLocationPrivate = true
          }

          nextProperties.location = Object.keys(location).length > 0 ? location : undefined
          updatedMetadata.properties = nextProperties

          const nextLocation = (nextProperties.location ||
            null) as import('@/lib/location').ActivityLocationValue | null
          if (portfolio.type !== 'human') {
            activityLocationChanged =
              JSON.stringify(previousLocation || null) !==
              JSON.stringify(nextLocation || null)
          }
        } else if (Object.prototype.hasOwnProperty.call(nextProperties, 'location')) {
          const { location, ...rest } = nextProperties
          updatedMetadata.properties = Object.keys(rest).length > 0 ? rest : undefined

          const hadPrevious = previousLocation != null
          const hasNext =
            (updatedMetadata.properties as Record<string, any> | undefined)
              ?.location != null
          if (portfolio.type !== 'human') {
            activityLocationChanged = hadPrevious !== hasNext
          }
        } else {
          updatedMetadata.properties = Object.keys(nextProperties).length > 0 ? nextProperties : undefined
        }
      }

      if (portfolio.type !== 'human') {
        if (projectStatusRaw !== null) {
          // Map legacy 'in-progress' to 'live' and only persist 'live' or 'archived'
          const normalizedStatus =
            projectStatusRaw === 'archived'
              ? 'archived'
              : projectStatusRaw === 'live' || projectStatusRaw === 'in-progress'
                ? 'live'
                : undefined
          if (normalizedStatus) {
            updatedMetadata.status = normalizedStatus
          } else if (Object.prototype.hasOwnProperty.call(updatedMetadata, 'status')) {
            delete updatedMetadata.status
          }
        }
      }

      // Host projects (multiple): owner/managers can add their projects
      if (hostProjectIdsRaw !== null && hostProjectIdsRaw !== undefined) {
        let resolvedHostProjectIds: string[] = []
        try {
          const parsed = typeof hostProjectIdsRaw === 'string' ? JSON.parse(hostProjectIdsRaw) : hostProjectIdsRaw
          const ids = Array.isArray(parsed) ? parsed.filter((id: unknown) => typeof id === 'string') : []
          if (ids.length > 0) {
            const { data: projects } = await supabase
              .from('portfolios')
              .select('id, user_id, metadata, type')
              .in('type', [...DB_NON_HUMAN_TYPES])
              .in('id', ids)
            if (projects?.length) {
              for (const proj of projects) {
                const hostMeta = (proj.metadata as any) || {}
                const managers: string[] = hostMeta?.managers || []
                const isOwner = proj.user_id === user.id
                const isManager = Array.isArray(managers) && managers.includes(user.id)
                if (isOwner || isManager) {
                  resolvedHostProjectIds.push(proj.id)
                }
              }
              resolvedHostProjectIds = [...new Set(resolvedHostProjectIds)]
            }
          }
        } catch {
          // ignore invalid JSON
        }
        const nextProperties = (updatedMetadata.properties || {}) as Record<string, any>
        updatedMetadata.properties = {
          ...nextProperties,
          host_project_ids: resolvedHostProjectIds.length > 0 ? resolvedHostProjectIds : undefined,
        }
      }

      // Host communities (multiple): owner/managers can add their communities
      if (hostCommunityIdsRaw !== null && hostCommunityIdsRaw !== undefined) {
        let resolvedHostCommunityIds: string[] = []
        try {
          const parsed = typeof hostCommunityIdsRaw === 'string' ? JSON.parse(hostCommunityIdsRaw) : hostCommunityIdsRaw
          const ids = Array.isArray(parsed) ? parsed.filter((id: unknown) => typeof id === 'string') : []
          if (ids.length > 0) {
            const { data: communities } = await supabase
              .from('portfolios')
              .select('id, user_id, metadata, type')
              .in('type', [...DB_NON_HUMAN_TYPES])
              .in('id', ids)
            if (communities?.length) {
              for (const comm of communities) {
                const hostMeta = (comm.metadata as any) || {}
                const managers: string[] = hostMeta?.managers || []
                const isOwner = comm.user_id === user.id
                const isManager = Array.isArray(managers) && managers.includes(user.id)
                if (isOwner || isManager) {
                  resolvedHostCommunityIds.push(comm.id)
                }
              }
              resolvedHostCommunityIds = [...new Set(resolvedHostCommunityIds)]
            }
          }
        } catch {
          // ignore invalid JSON
        }
        const nextProperties = (updatedMetadata.properties || {}) as Record<string, any>
        updatedMetadata.properties = {
          ...nextProperties,
          host_community_ids: resolvedHostCommunityIds.length > 0 ? resolvedHostCommunityIds : undefined,
        }
      }

      // External activity: creator can toggle "I'm going" (add/remove self from members)
      const isExternalActivity = (currentMetadata.properties as any)?.external === true
      if (isExternalActivity && iAmGoingRaw !== null) {
        const currentMembers: string[] = currentMetadata.members || []
        const currentMemberRoles: Record<string, string> = currentMetadata.memberRoles || {}
        const creatorId = portfolio.user_id
        const iAmGoing = iAmGoingRaw === 'true'
        let nextMembers: string[]
        let nextMemberRoles: Record<string, string>
        if (iAmGoing) {
          nextMembers = currentMembers.includes(creatorId) ? currentMembers : [...currentMembers, creatorId]
          nextMemberRoles = { ...currentMemberRoles, [creatorId]: currentMemberRoles[creatorId] || 'Uploader' }
        } else {
          nextMembers = currentMembers.filter((id) => id !== creatorId)
          nextMemberRoles = { ...currentMemberRoles }
          delete nextMemberRoles[creatorId]
        }
        updatedMetadata.members = nextMembers
        updatedMetadata.memberRoles = nextMemberRoles
        const { error: rpcError } = await supabase.rpc('update_portfolio_members', {
          portfolio_id: portfolioId,
          new_members: nextMembers,
        })
        if (rpcError) {
          return { success: false, error: rpcError.message || 'Failed to update membership' }
        }
      }

      // Optional: organizational membership rule (domain-based auto-join).
      // Accepts comma/space separated suffixes; empty clears the config.
      if (orgMembershipEmailSuffixesRaw !== null) {
        const { normalizeEmailSuffixes } = await import('@/lib/portfolio/orgMembership')
        const suffixes = normalizeEmailSuffixes(orgMembershipEmailSuffixesRaw || '')
        const nextProps = (updatedMetadata.properties || properties || {}) as Record<string, any>
        if (suffixes.length > 0) {
          updatedMetadata.properties = {
            ...nextProps,
            org_membership: { enabled: true, email_suffixes: suffixes },
          }
        } else {
          // Clear
          const { org_membership, ...rest } = nextProps
          updatedMetadata.properties = Object.keys(rest).length > 0 ? rest : undefined
        }
      }
    }

    // For human portfolios, persist availability-related settings inside metadata.properties
    if (portfolio.type === 'human') {
      const baseProperties = (updatedMetadata.properties ||
        currentMetadata.properties ||
        {}) as Record<string, any>
      let nextProperties: Record<string, any> = { ...baseProperties }

      if (humanAutoCityLocationEnabledRaw !== null) {
        const enabled = humanAutoCityLocationEnabledRaw === 'true'
        nextProperties.auto_city_location_enabled = enabled
      }

      if (humanAvailabilityScheduleRaw !== null) {
        const trimmed = humanAvailabilityScheduleRaw.trim()
        // When the client sends an empty string, treat it as "no change" so we
        // don't accidentally wipe out an existing schedule from stale editors.
        if (trimmed.length > 0) {
          try {
            const parsed = JSON.parse(trimmed)
            const normalized = normalizeHumanAvailabilitySchedule(parsed)

            if (normalized) {
              nextProperties.availability_schedule = normalized
            } else if (
              Object.prototype.hasOwnProperty.call(nextProperties, 'availability_schedule')
            ) {
              const { availability_schedule, ...rest } = nextProperties
              nextProperties = rest
            }
          } catch {
            // Ignore invalid JSON and keep existing schedule, if any
          }
        }
      }

      updatedMetadata.properties =
        Object.keys(nextProperties).length > 0 ? nextProperties : undefined
    }

    // Check if description changed (compare trimmed versions)
    const descriptionChanged = oldDescription !== normalizedDescription
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Portfolio description update check:', {
        portfolioId,
        oldDescription,
        newDescription: normalizedDescription,
        descriptionChanged,
        portfolioType: portfolio.type,
        isPersonal: portfolio.type === 'human' && portfolio.user_id === user.id,
      })
    }

    // Build update payload
    const updatePayload: any = {
      metadata: updatedMetadata,
    }

    // Allow owner to update visibility for non-human portfolios
    if (
      portfolio.type !== 'human' &&
      (visibilityRaw === 'public' || visibilityRaw === 'private')
    ) {
      updatePayload.visibility = visibilityRaw
    }

    // For non-human portfolios, sync host_project_id from metadata.properties.host_project_ids (first)
    if (portfolio.type !== 'human') {
      const props = (updatedMetadata.properties || {}) as Record<string, any>
      const ids = props.host_project_ids as string[] | undefined
      updatePayload.host_project_id = Array.isArray(ids) && ids.length > 0 ? ids[0] : null
    }

    // Update portfolio
    const { error: updateError } = await supabase
      .from('portfolios')
      .update(updatePayload)
      .eq('id', portfolioId)

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to update portfolio',
      }
    }

    revalidatePortfolioPathsForIdAndSlug(portfolioId, (portfolio as { slug?: string }).slug)

    // For non-human portfolios, notify members when time and/or location changes.
    if (portfolio.type !== 'human' && (activityTimeChanged || activityLocationChanged)) {
      try {
        const metadataAfter = updatedMetadata as any
        const members: string[] = metadataAfter?.members || []
        const managers: string[] = metadataAfter?.managers || []
        const basicAfter = metadataAfter?.basic || {}
        const activityName: string = (basicAfter.name as string) || 'this portfolio'

        const participantIds = new Set<string>()
        participantIds.add(portfolio.user_id as string)
        for (const id of managers) participantIds.add(id)
        for (const id of members) participantIds.add(id)
        participantIds.delete(user.id)

        if (participantIds.size > 0) {
          const changes: string[] = []
          if (activityTimeChanged) changes.push('time')
          if (activityLocationChanged) changes.push('location')

          const changeLabel =
            changes.length === 2
              ? 'time and location'
              : changes[0]

          const baseUrl =
            process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
          const activityPath = getSpaceUrl(portfolioId)
          const activityUrl = `${baseUrl}${activityPath}`

          const text = `updated the ${changeLabel} for ${activityName} (portfolio). View details: ${activityPath}`

          const inserts = Array.from(participantIds).map((receiverId) => ({
            sender_id: user.id,
            receiver_id: receiverId,
            text,
          }))

          if (inserts.length > 0) {
            await supabase.from('messages').insert(inserts)

            // Reset conversation activation barrier for all participants and the editor
            for (const receiverId of participantIds) {
              await supabase
                .from('conversation_completions')
                .delete()
                .or(
                  `and(user_id.eq.${receiverId},partner_id.eq.${user.id}),and(user_id.eq.${user.id},partner_id.eq.${receiverId})`
                )
            }
          }
        }
      } catch (notifyError) {
        console.error('Failed to send activity update notifications:', notifyError)
      }
    }

    // Trigger background property processing if description changed (fire-and-forget)
    if (descriptionChanged) {
      try {
        // Use absolute URL - in server actions, we need the full URL
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        // Use fetch without await - fire and forget
        if (portfolio.type === 'human') {
          fetch(`${baseUrl}/api/index-human-description`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              portfolioId,
              userId: user.id,
              description: normalizedDescription,
            }),
          }).catch((error) => {
            // Log error but don't fail portfolio update
            console.error('Failed to trigger human description processing:', error)
          })
        } else if (portfolio.type !== 'human') {
          const activityProps = (updatedMetadata?.properties as { external?: boolean; external_link?: string } | undefined) || {}
          const externalLink =
            activityProps.external === true ? activityProps.external_link ?? undefined : undefined
          fetch(`${baseUrl}/api/index-activity-description`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              portfolioId,
              userId: user.id,
              description: normalizedDescription,
              externalLink,
            }),
          }).catch((error) => {
            console.error('Failed to trigger portfolio description processing:', error)
          })
        }
      } catch (error) {
        // Don't fail portfolio update if property processing trigger fails
        console.error('Error triggering background property processing:', error)
      }
    }

    // Handle avatar upload if provided
    if (avatarFile && avatarFile.size > 0) {
      try {
        const { uploadAvatar, deleteAvatar } = await import('@/lib/storage/avatars-server')
        
        // Delete old avatar if it exists (to clear cache)
        const oldAvatarUrl = basicMetadata.avatar
        if (oldAvatarUrl && typeof oldAvatarUrl === 'string' && oldAvatarUrl.trim().length > 0) {
          try {
            await deleteAvatar(oldAvatarUrl)
          } catch (deleteError) {
            // Log but don't fail - old avatar might not exist or already deleted
            console.warn('Failed to delete old avatar (non-critical):', deleteError)
          }
        }
        
        const avatarResult = await uploadAvatar(portfolioId, avatarFile)
        
        // Add cache-busting query parameter to force browser/CDN to fetch new image
        const cacheBustUrl = `${avatarResult.url}?t=${Date.now()}`

        // Update portfolio with avatar URL and clear emoji when image is uploaded
        await supabase
          .from('portfolios')
          .update({
            metadata: {
              ...updatedMetadata,
              basic: {
                ...updatedMetadata.basic,
                avatar: cacheBustUrl,
                emoji: '', // Clear emoji when image is uploaded
              },
            },
          })
          .eq('id', portfolioId)
        
        revalidatePortfolioPathsForIdAndSlug(portfolioId, (portfolio as { slug?: string }).slug)
      } catch (avatarError: any) {
        // Avatar upload failed, but portfolio was updated
        console.error('Failed to upload avatar:', avatarError)
      }
    } else if (emoji !== null) {
      // If emoji is being set (and no new avatar file), clear avatar URL
      await supabase
        .from('portfolios')
        .update({
          metadata: {
            ...updatedMetadata,
            basic: {
              ...updatedMetadata.basic,
              avatar: emoji ? '' : updatedMetadata.basic.avatar, // Clear avatar when emoji is set
            },
          },
        })
        .eq('id', portfolioId)
    }

    return {
      success: true,
    }
  } catch (error: any) {
    // Re-throw redirect errors so Next.js can handle them
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/** Update only `basic.description` (owner or manager). Revalidates and re-runs description indexing when text changes. */
export async function updatePortfolioDescription(
  portfolioId: string,
  description: string
): Promise<UpdatePortfolioResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    if (!portfolioId?.trim()) {
      return { success: false, error: 'Portfolio ID is required' }
    }

    const normalizedDescription = description.trim()
    if (normalizedDescription.length > 3000) {
      return { success: false, error: 'Description must be 3000 characters or less' }
    }

    const canEdit = await canEditPortfolio(portfolioId, user.id)
    if (!canEdit) {
      return { success: false, error: 'You do not have permission to update this portfolio' }
    }

    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('metadata, type, user_id, slug')
      .eq('id', portfolioId)
      .single()

    if (!portfolio) {
      return { success: false, error: 'Portfolio not found' }
    }

    const currentMetadata = (portfolio.metadata as any) || {}
    const basicMetadata = currentMetadata.basic || {}
    const oldDescription = (basicMetadata.description || '').trim()

    const updatedMetadata = {
      ...currentMetadata,
      basic: {
        ...basicMetadata,
        description: normalizedDescription,
      },
    }

    const { error: updateError } = await supabase
      .from('portfolios')
      .update({ metadata: updatedMetadata })
      .eq('id', portfolioId)

    if (updateError) {
      return { success: false, error: updateError.message || 'Failed to update description' }
    }

    revalidatePortfolioPathsForIdAndSlug(portfolioId, (portfolio as { slug?: string }).slug)

    const descriptionChanged = oldDescription !== normalizedDescription
    if (descriptionChanged) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        if (portfolio.type === 'human') {
          fetch(`${baseUrl}/api/index-human-description`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              portfolioId,
              userId: user.id,
              description: normalizedDescription,
            }),
          }).catch((error) => {
            console.error('Failed to trigger human description processing:', error)
          })
        } else if (portfolio.type !== 'human') {
          const activityProps =
            (updatedMetadata?.properties as { external?: boolean; external_link?: string } | undefined) || {}
          const externalLink =
            activityProps.external === true ? activityProps.external_link ?? undefined : undefined
          fetch(`${baseUrl}/api/index-activity-description`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              portfolioId,
              userId: user.id,
              description: normalizedDescription,
              externalLink,
            }),
          }).catch((error) => {
            console.error('Failed to trigger portfolio description processing:', error)
          })
        }
      } catch (error) {
        console.error('Error triggering background property processing:', error)
      }
    }

    return { success: true }
  } catch (error: any) {
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

export async function deletePortfolio(portfolioId: string): Promise<DeletePortfolioResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Check if user can delete (only creator)
    const canDelete = await canDeletePortfolio(portfolioId, user.id)
    if (!canDelete) {
      return {
        success: false,
        error: 'You do not have permission to delete this portfolio. Only the creator can delete it.',
      }
    }

    // Check portfolio type and get user_id
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('type, user_id, slug')
      .eq('id', portfolioId)
      .single()

    if (!portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    const slugForRevalidate = (portfolio as { slug?: string }).slug

    // Prevent deletion of human portfolios
    if (portfolio.type === 'human') {
      return {
        success: false,
        error: 'Human portfolios cannot be deleted',
      }
    }

    // Delete portfolio
    const { error: deleteError } = await supabase
      .from('portfolios')
      .delete()
      .eq('id', portfolioId)

    if (deleteError) {
      return {
        success: false,
        error: deleteError.message || 'Failed to delete portfolio',
      }
    }

    revalidatePortfolioPathsForIdAndSlug(portfolioId, slugForRevalidate)

    // If this was a non-human portfolio, remove it from owner's owned list
    if (portfolio.type !== 'human') {
      try {
        const { removeProjectFromOwnedList } = await import('@/lib/portfolio/human')
        await removeProjectFromOwnedList(portfolio.user_id, portfolioId)
      } catch (error) {
        // Log error but don't fail deletion (portfolio is already deleted)
        console.error('Failed to remove project from owned list:', error)
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    // Re-throw redirect errors so Next.js can handle them
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

// ------------------------------------------------------------
// Activity call-to-join and join request actions
// ------------------------------------------------------------

interface SimpleResult {
  success: boolean
  error?: string
}

interface ApplyActivityCallToJoinInput {
  portfolioId: string
  roleOptionId?: string
  promptAnswer?: string
}

/**
 * Update call-to-join configuration for an activity portfolio.
 * Only the activity owner or managers can update this configuration.
 */
export async function updateActivityCallToJoin(
  portfolioId: string,
  config: {
    enabled: boolean
    description?: string
    joinBy?: string | null
    requireApproval: boolean
    prompt?: string | null
    roles?: { id: string; label: string; activityRole: string }[]
  }
): Promise<SimpleResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata, slug')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return { success: false, error: 'Portfolio not found' }
    }

    if (portfolio.type === 'human') {
      return { success: false, error: 'Call-to-join is not available for human portfolios' }
    }

    const metadata = (portfolio.metadata as any) || {}
    const properties: Record<string, any> = (metadata.properties || {}) as Record<string, any>
    const existingCallToJoin: ActivityCallToJoinConfig = (properties.call_to_join ||
      {}) as ActivityCallToJoinConfig

    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)

    if (!isOwner && !isManager) {
      return {
        success: false,
        error: 'Only the activity owner or managers can update call-to-join settings',
      }
    }

    // Validate joinBy relative to activity end datetime if present
    const activityDateTime = properties.activity_datetime as
      | { start?: string; end?: string | null }
      | undefined

    if (config.joinBy) {
      const joinByDate = new Date(config.joinBy)
      if (Number.isNaN(joinByDate.getTime())) {
        return { success: false, error: 'Invalid join-by datetime' }
      }

      const now = new Date()
      if (joinByDate.getTime() <= now.getTime()) {
        return { success: false, error: 'Join-by datetime must be in the future' }
      }

      if (activityDateTime?.end) {
        const endDate = new Date(activityDateTime.end)
        if (!Number.isNaN(endDate.getTime()) && joinByDate.getTime() > endDate.getTime()) {
          return {
            success: false,
            error: 'Join-by datetime must be before or equal to the activity end time',
          }
        }
      }
    }

    const normalizedConfig: ActivityCallToJoinConfig = {
      enabled: config.enabled,
      description: config.description || undefined,
      join_by:
        config.joinBy !== undefined
          ? config.joinBy
          : existingCallToJoin.join_by ?? null,
      require_approval: config.requireApproval,
      prompt: config.requireApproval ? config.prompt ?? null : null,
      roles:
        (config.roles && config.roles.length > 0
          ? config.roles
          : existingCallToJoin.roles) || [],
      join_by_auto_managed:
        config.joinBy !== undefined
          ? false
          : existingCallToJoin.join_by_auto_managed ?? true,
    }

    const nextProperties: Record<string, any> = {
      ...properties,
      call_to_join: normalizedConfig,
    }

    const updatedMetadata = {
      ...metadata,
      properties: Object.keys(nextProperties).length > 0 ? nextProperties : undefined,
    }

    const { error: updateError } = await supabase
      .from('portfolios')
      .update({ metadata: updatedMetadata })
      .eq('id', portfolioId)

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to update call-to-join configuration',
      }
    }

    revalidatePortfolioPathsForIdAndSlug(portfolioId, (portfolio as { slug?: string }).slug)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Get count of unprocessed join requests (pending and not yet responded to).
 * Owner/manager only. Used for the blue-dot badge on the call-to-join card.
 */
export async function getPendingJoinRequestsCount(
  portfolioId: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata, slug')
      .eq('id', portfolioId)
      .single()
    if (!portfolio || portfolio.type === 'human') {
      return { success: false, error: 'Not found' }
    }
    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)
    if (!isOwner && !isManager) {
      return { success: false, error: 'Forbidden' }
    }
    let query = supabase
      .from('portfolio_join_requests')
      .select('id', { count: 'exact', head: true })
      .eq('portfolio_id', portfolioId)
      .eq('status', 'pending')
    const { count, error } = await query.is('responded_at', null)
    if (error) return { success: false, error: error.message }
    return { success: true, count: count ?? 0 }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to get count' }
  }
}

/**
 * Check whether the current user has a pending (not yet approved/rejected) join request for this activity.
 */
export async function getCurrentUserPendingActivityRequest(
  portfolioId: string
): Promise<{ success: boolean; hasPending?: boolean; error?: string }> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id, type')
      .eq('id', portfolioId)
      .single()
    if (!portfolio || portfolio.type === 'human') {
      return { success: false, error: 'Not found' }
    }
    const { data: request, error } = await supabase
      .from('portfolio_join_requests')
      .select('id')
      .eq('portfolio_id', portfolioId)
      .eq('applicant_user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (error) return { success: false, error: error.message }
    return { success: true, hasPending: !!request }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to check request' }
  }
}

/**
 * Whether the current user has a pending portfolio invitation (member or manager) for this portfolio.
 */
export async function getCurrentUserPendingPortfolioInvitation(
  portfolioId: string
): Promise<{
  success: boolean
  hasPending?: boolean
  invitationType?: 'member' | 'manager'
  error?: string
}> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id, type')
      .eq('id', portfolioId)
      .single()
    if (!portfolio || portfolio.type === 'human') {
      return { success: false, error: 'Not found' }
    }
    const { data: inv, error } = await supabase
      .from('portfolio_invitations')
      .select('id, invitation_type')
      .eq('portfolio_id', portfolioId)
      .eq('invitee_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (error) return { success: false, error: error.message }
    if (!inv) {
      return { success: true, hasPending: false }
    }
    const invitationType = inv.invitation_type === 'manager' ? 'manager' : 'member'
    return { success: true, hasPending: true, invitationType }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to check invitation' }
  }
}

/** Noun used in DM copy for unified join flows (scheduled spaces → “activity”, else “space”). */
function portfolioJoinRequestMessageLabel(portfolio: Pick<Portfolio, 'type' | 'metadata'>): string {
  const caps = deriveSpaceCapabilities(portfolio)
  if (caps?.hasActivitySchedule) return 'activity'
  return 'space'
}

/** Owner plus `metadata.managers`, deduped — for join / application alerts. */
function getPortfolioLeadershipUserIds(portfolio: { user_id: string; metadata?: unknown }): string[] {
  const managers = (portfolio.metadata as { managers?: unknown } | null | undefined)?.managers
  const ids = new Set<string>()
  ids.add(portfolio.user_id)
  if (Array.isArray(managers)) {
    for (const id of managers) {
      if (typeof id === 'string' && id.length > 0) ids.add(id)
    }
  }
  return [...ids]
}

async function notifyPortfolioLeadershipFromApplicant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  applicantUserId: string,
  portfolio: { user_id: string; metadata?: unknown },
  text: string
) {
  const clearCompletion = async (receiverId: string) => {
    await supabase
      .from('conversation_completions')
      .delete()
      .or(
        `and(user_id.eq.${receiverId},partner_id.eq.${applicantUserId}),and(user_id.eq.${applicantUserId},partner_id.eq.${receiverId})`
      )
  }
  for (const receiverId of getPortfolioLeadershipUserIds(portfolio)) {
    await supabase.from('messages').insert({
      sender_id: applicantUserId,
      receiver_id: receiverId,
      text,
    })
    await clearCompletion(receiverId)
  }
}

/**
 * Send a message to an applicant for any non-human portfolio join request and set `responded_at`.
 * Does not approve or reject; applicant remains pending. Owner/manager only.
 */
export async function respondToActivityJoinRequest(
  requestId: string,
  message: string
): Promise<SimpleResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    const { data: request, error: requestError } = await supabase
      .from('portfolio_join_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (requestError || !request) {
      return { success: false, error: 'Join request not found' }
    }

    if (request.status !== 'pending') {
      return { success: false, error: 'Join request is not pending' }
    }

    const activityId: string = request.portfolio_id

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata, slug')
      .eq('id', activityId)
      .single()

    if (portfolioError || !portfolio || portfolio.type === 'human') {
      return { success: false, error: 'Portfolio not found for this request' }
    }

    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)

    if (!isOwner && !isManager) {
      return {
        success: false,
        error: 'Only the owner or managers can respond to requests',
      }
    }

    const { error: updateRequestError } = await supabase
      .from('portfolio_join_requests')
      .update({
        responded_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (updateRequestError) {
      return {
        success: false,
        error: updateRequestError.message || 'Failed to update join request',
      }
    }

    const basic = metadata?.basic || {}
    const portfolioName = (basic.name as string) || 'this portfolio'
    const label = portfolioJoinRequestMessageLabel(portfolio)
    const text =
      message.trim().length > 0
        ? `Regarding your request to join ${portfolioName} (${label}): ${message.trim()}`
        : `We received your request to join ${portfolioName} (${label}). We’ll get back to you soon.`

    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: request.applicant_user_id,
      text,
    })
    await supabase
      .from('conversation_completions')
      .delete()
      .eq('user_id', request.applicant_user_id)
      .eq('partner_id', user.id)

    revalidatePortfolioPathsForIdAndSlug(activityId, (portfolio as { slug?: string }).slug)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Apply to join an activity via its call-to-join configuration.
 * - When approval is required: creates a pending activity_join_requests record.
 * - When approval is not required: immediately adds the user as a member/manager.
 */
export async function applyToActivityCallToJoin(
  input: ApplyActivityCallToJoinInput
): Promise<SimpleResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    const { portfolioId, promptAnswer } = input

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata, visibility')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return { success: false, error: 'Portfolio not found' }
    }

    if (portfolio.type === 'human') {
      return { success: false, error: 'Call-to-join is not available for human portfolios' }
    }

    const visibility = (portfolio as any).visibility === 'private' ? 'private' : 'public'
    if (visibility === 'private') {
      return { success: false, error: 'Call-to-join is not available for private portfolios' }
    }

    const metadata = (portfolio.metadata as any) || {}
    const properties: Record<string, any> = (metadata.properties || {}) as Record<string, any>
    const callToJoin: ActivityCallToJoinConfig | undefined = properties.call_to_join
    const isExternal = properties.external === true
    const orgMembership = (properties.org_membership || null) as
      | { enabled?: boolean; email_suffixes?: unknown }
      | null

    // External portfolios: always publicly joinable, no call-to-join config needed
    if (!isExternal && !callToJoin) {
      return { success: false, error: 'Call-to-join is not configured for this portfolio' }
    }

    if (!isExternal) {
      const activityDateTime = (properties.activity_datetime || null) as import('@/lib/datetime').ActivityDateTimeValue | null
      const status = (metadata.status as string) || null
      const { isCallToJoinWindowOpen } = await import('@/lib/callToJoin')
      if (!isCallToJoinWindowOpen(visibility, callToJoin!, activityDateTime, status)) {
        return { success: false, error: 'The call-to-join window for this portfolio is closed' }
      }
    }

    const members: string[] = metadata?.members || []
    const managers: string[] = metadata?.managers || []

    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)
    const isMember = Array.isArray(members) && members.includes(user.id)

    if (isOwner || isManager || isMember) {
      return { success: false, error: 'You are already part of this portfolio' }
    }

    // Role is configured after joining; new members join as member by default
    const activityRole = 'member'
    const memberRoleLabel = 'Member'

    const basic = metadata?.basic || {}
    const portfolioName = (basic.name as string) || 'this portfolio'
    const label = portfolioJoinRequestMessageLabel(portfolio)

    // External activities: always auto-join.
    // Non-external with approval: create pending request unless org-membership rule allows bypass.
    let bypassApproval = false
    if (!isExternal && callToJoin?.require_approval) {
      if (orgMembership?.enabled === true) {
        const { isEmailEligibleForOrgMembership } = await import('@/lib/portfolio/orgMembership')
        bypassApproval = isEmailEligibleForOrgMembership((user as any)?.email ?? null, orgMembership.email_suffixes)
      }
    }

    if (!isExternal && callToJoin?.require_approval && !bypassApproval) {
      // Create or reuse a pending join request
      const { data: existingRequest } = await supabase
        .from('portfolio_join_requests')
        .select('id, status')
        .eq('portfolio_id', portfolioId)
        .eq('applicant_user_id', user.id)
        .eq('status', 'pending')
        .maybeSingle()

      if (existingRequest) {
        return {
          success: false,
          error: 'You already have a pending request for this portfolio',
        }
      }

      const { data: pendingInvite } = await supabase
        .from('portfolio_invitations')
        .select('id')
        .eq('portfolio_id', portfolioId)
        .eq('invitee_id', user.id)
        .eq('status', 'pending')
        .maybeSingle()

      if (pendingInvite) {
        return {
          success: false,
          error:
            'You already have a pending invitation for this space. Accept it below, or decline it from your messages.',
        }
      }

      const { error: insertError } = await supabase.from('portfolio_join_requests').insert({
        portfolio_id: portfolioId,
        applicant_user_id: user.id,
        prompt_answer: callToJoin.prompt ? promptAnswer || null : null,
        role_option_id: null,
        activity_role: activityRole,
        status: 'pending',
      })

      if (insertError) {
        return {
          success: false,
          error: insertError.message || 'Failed to submit join request',
        }
      }

      // Notify owner and all managers; link directs to Requests tab
      const requestsUrl = getSpaceMembersUrl((portfolio as { slug?: string }).slug || portfolioId, 'tab=requests')
      await notifyPortfolioLeadershipFromApplicant(
        supabase,
        user.id,
        portfolio,
        `applied to join ${portfolioName} (${label}). Review: ${requestsUrl}`
      )

      return {
        success: true,
      }
    }

    // Auto-join flow (no approval required)
    const currentMembers: string[] = metadata?.members || []
    const currentManagers: string[] = metadata?.managers || []
    const currentMemberRoles = metadata?.memberRoles || {}

    const nextMembers = currentMembers.includes(user.id)
      ? currentMembers
      : [...currentMembers, user.id]

    const nextManagers =
      (activityRole as string) === 'manager'
        ? currentManagers.includes(user.id)
          ? currentManagers
          : [...currentManagers, user.id]
        : currentManagers

    const nextMemberRoles = {
      ...currentMemberRoles,
      [user.id]: memberRoleLabel,
    }

    const updatedMetadata = {
      ...metadata,
      members: nextMembers,
      managers: nextManagers,
      memberRoles: nextMemberRoles,
    }

    // Keep RLS-consistent by using existing RPC for members, then update metadata
    const { error: rpcError } = await supabase.rpc('update_portfolio_members', {
      portfolio_id: portfolioId,
      new_members: nextMembers,
    })

    if (rpcError) {
      // Try direct update as fallback
      const { error: directError } = await supabase
        .from('portfolios')
        .update({ metadata: updatedMetadata })
        .eq('id', portfolioId)

      if (directError) {
        return {
          success: false,
          error: directError.message || 'Failed to join portfolio',
        }
      }
    } else {
      const { error: metadataError } = await supabase
        .from('portfolios')
        .update({ metadata: updatedMetadata })
        .eq('id', portfolioId)

      if (metadataError) {
        return {
          success: false,
          error: metadataError.message || 'Failed to update membership',
        }
      }
    }

    // Optionally record the auto-accepted request for history
    await supabase.from('portfolio_join_requests').insert({
      portfolio_id: portfolioId,
      applicant_user_id: user.id,
      prompt_answer: null,
      role_option_id: null,
      activity_role: activityRole,
      status: 'auto_accepted',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })

    // Notify owner and all managers about the new member
    await notifyPortfolioLeadershipFromApplicant(
      supabase,
      user.id,
      portfolio,
      `joined ${portfolioName} (${label}) as ${memberRoleLabel}`
    )

    try {
      const { addPortfolioTopicsToUserInterests } = await import('@/lib/indexing/interest-tracking')
      await addPortfolioTopicsToUserInterests(portfolioId, user.id)
    } catch (interestError) {
      console.error('Failed to add portfolio topics to user interests:', interestError)
    }

    revalidatePortfolioPathsForIdAndSlug(portfolioId, (portfolio as { slug?: string }).slug)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Approve a join request for any non-human portfolio and add the applicant as a member (and manager when applicable).
 */
export async function approveActivityJoinRequest(
  requestId: string
): Promise<SimpleResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    const { data: request, error: requestError } = await supabase
      .from('portfolio_join_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (requestError || !request) {
      return { success: false, error: 'Join request not found' }
    }

    if (request.status !== 'pending') {
      return { success: false, error: 'Join request is not pending' }
    }

    const activityId: string = request.portfolio_id

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata, slug')
      .eq('id', activityId)
      .single()

    if (portfolioError || !portfolio || portfolio.type === 'human') {
      return { success: false, error: 'Portfolio not found for this request' }
    }

    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)

    if (!isOwner && !isManager) {
      return {
        success: false,
        error: 'Only the owner or managers can approve requests',
      }
    }

    const applicantId: string = request.applicant_user_id
    const activityRole: string = request.activity_role || 'member'

    const currentMembers: string[] = metadata?.members || []
    const currentManagers: string[] = metadata?.managers || []
    const currentMemberRoles = metadata?.memberRoles || {}

    const nextMembers = currentMembers.includes(applicantId)
      ? currentMembers
      : [...currentMembers, applicantId]

    const nextManagers =
      activityRole === 'manager'
        ? currentManagers.includes(applicantId)
          ? currentManagers
          : [...currentManagers, applicantId]
        : currentManagers

    const memberRoleLabel =
      (request.role_option_id && request.activity_role === 'manager'
        ? 'Manager'
        : currentMemberRoles[applicantId]) || 'Member'

    const nextMemberRoles = {
      ...currentMemberRoles,
      [applicantId]: memberRoleLabel,
    }

    const updatedMetadata = {
      ...metadata,
      members: nextMembers,
      managers: nextManagers,
      memberRoles: nextMemberRoles,
    }

    const { error: rpcError } = await supabase.rpc('update_portfolio_members', {
      portfolio_id: activityId,
      new_members: nextMembers,
    })

    if (rpcError) {
      const { error: directError } = await supabase
        .from('portfolios')
        .update({ metadata: updatedMetadata })
        .eq('id', activityId)

      if (directError) {
        return {
          success: false,
          error: directError.message || 'Failed to approve join request',
        }
      }
    } else {
      const { error: metadataError } = await supabase
        .from('portfolios')
        .update({ metadata: updatedMetadata })
        .eq('id', activityId)

      if (metadataError) {
        return {
          success: false,
          error: metadataError.message || 'Failed to update membership',
        }
      }
    }

    const { error: updateRequestError } = await supabase
      .from('portfolio_join_requests')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (updateRequestError) {
      return {
        success: false,
        error: updateRequestError.message || 'Failed to update join request',
      }
    }

    const basic = metadata?.basic || {}
    const portfolioName = (basic.name as string) || 'this portfolio'
    const label = portfolioJoinRequestMessageLabel(portfolio)

    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: applicantId,
      text: `approved your request to join ${portfolioName} (${label}) as ${memberRoleLabel}`,
    })
    await supabase
      .from('conversation_completions')
      .delete()
      .or(
        `and(user_id.eq.${applicantId},partner_id.eq.${user.id}),and(user_id.eq.${user.id},partner_id.eq.${applicantId})`
      )

    try {
      const { addPortfolioTopicsToUserInterests } = await import('@/lib/indexing/interest-tracking')
      await addPortfolioTopicsToUserInterests(activityId, applicantId)
    } catch (interestError) {
      console.error('Failed to add portfolio topics to user interests:', interestError)
    }

    revalidatePortfolioPathsForIdAndSlug(activityId, (portfolio as { slug?: string }).slug)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Reject a join request for any non-human portfolio and optionally send a message to the applicant.
 */
export async function rejectActivityJoinRequest(
  requestId: string,
  rejectionMessage?: string
): Promise<SimpleResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    const { data: request, error: requestError } = await supabase
      .from('portfolio_join_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (requestError || !request) {
      return { success: false, error: 'Join request not found' }
    }

    if (request.status !== 'pending') {
      return { success: false, error: 'Join request is not pending' }
    }

    const activityId: string = request.portfolio_id

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata, slug')
      .eq('id', activityId)
      .single()

    if (portfolioError || !portfolio || portfolio.type === 'human') {
      return { success: false, error: 'Portfolio not found for this request' }
    }

    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)

    if (!isOwner && !isManager) {
      return {
        success: false,
        error: 'Only the owner or managers can reject requests',
      }
    }

    const { error: updateRequestError } = await supabase
      .from('portfolio_join_requests')
      .update({
        status: 'rejected',
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectionMessage || null,
      })
      .eq('id', requestId)

    if (updateRequestError) {
      return {
        success: false,
        error: updateRequestError.message || 'Failed to update join request',
      }
    }

    const basic = metadata?.basic || {}
    const portfolioName = (basic.name as string) || 'this portfolio'
    const label = portfolioJoinRequestMessageLabel(portfolio)

    let text = `rejected your request to join ${portfolioName} (${label})`
    if (rejectionMessage && rejectionMessage.trim().length > 0) {
      text += `: ${rejectionMessage.trim()}`
    }

    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: request.applicant_user_id,
      text,
    })
    await supabase
      .from('conversation_completions')
      .delete()
      .or(
        `and(user_id.eq.${request.applicant_user_id},partner_id.eq.${user.id}),and(user_id.eq.${user.id},partner_id.eq.${request.applicant_user_id})`
      )

    revalidatePortfolioPathsForIdAndSlug(activityId, (portfolio as { slug?: string }).slug)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

// --- Community join requests (same table portfolio_join_requests, type = community) ---

export interface ApplyCommunityJoinInput {
  portfolioId: string
  promptAnswer: string
}

/**
 * Apply to join a community. Always requires approval; fixed prompt "proofs of membership".
 */
export async function applyToCommunityJoin(
  input: ApplyCommunityJoinInput
): Promise<SimpleResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const { portfolioId, promptAnswer } = input

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata, slug')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return { success: false, error: 'Portfolio not found' }
    }
    if (portfolio.type === 'human') {
      return { success: false, error: 'Not available for human portfolios' }
    }

    const metadata = (portfolio.metadata as any) || {}
    const members: string[] = metadata?.members || []
    if (members.includes(user.id)) {
      return { success: false, error: 'You are already a member' }
    }

    const { data: existingRequest } = await supabase
      .from('portfolio_join_requests')
      .select('id, status')
      .eq('portfolio_id', portfolioId)
      .eq('applicant_user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingRequest) {
      return { success: false, error: 'You already have a pending request for this portfolio' }
    }

    const { data: pendingInvite } = await supabase
      .from('portfolio_invitations')
      .select('id')
      .eq('portfolio_id', portfolioId)
      .eq('invitee_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingInvite) {
      return {
        success: false,
        error:
          'You already have a pending invitation for this space. Accept it on the space page, or decline it from your messages.',
      }
    }

    const { error: insertError } = await supabase.from('portfolio_join_requests').insert({
      portfolio_id: portfolioId,
      applicant_user_id: user.id,
      prompt_answer: promptAnswer?.trim() || null,
      activity_role: 'member',
      status: 'pending',
    })

    if (insertError) {
      return { success: false, error: insertError.message || 'Failed to submit join request' }
    }

    const basic = metadata?.basic || {}
    const communityName = (basic.name as string) || 'this portfolio'
    const label = portfolioJoinRequestMessageLabel(portfolio)
    const requestsUrl = getSpaceMembersUrl((portfolio as { slug?: string }).slug || portfolioId, 'tab=requests')
    await notifyPortfolioLeadershipFromApplicant(
      supabase,
      user.id,
      portfolio,
      `applied to join ${communityName} (${label}). Review: ${requestsUrl}`
    )

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to apply' }
  }
}

/**
 * Get count of pending join requests for a community. Owner/manager only.
 */
export async function getPendingCommunityJoinRequestsCount(
  portfolioId: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata, slug')
      .eq('id', portfolioId)
      .single()
    if (!portfolio || portfolio.type === 'human') {
      return { success: false, error: 'Not found' }
    }
    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)
    if (!isOwner && !isManager) {
      return { success: false, error: 'Forbidden' }
    }
    const { count, error } = await supabase
      .from('portfolio_join_requests')
      .select('id', { count: 'exact', head: true })
      .eq('portfolio_id', portfolioId)
      .eq('status', 'pending')
    if (error) return { success: false, error: error.message }
    return { success: true, count: count ?? 0 }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to get count' }
  }
}

/**
 * Check whether the current user has a pending join request for this portfolio.
 */
export async function getCurrentUserPendingCommunityRequest(
  portfolioId: string
): Promise<{ success: boolean; hasPending?: boolean; error?: string }> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id, type')
      .eq('id', portfolioId)
      .single()
    if (!portfolio || portfolio.type === 'human') {
      return { success: false, error: 'Not found' }
    }
    const { data: request, error } = await supabase
      .from('portfolio_join_requests')
      .select('id')
      .eq('portfolio_id', portfolioId)
      .eq('applicant_user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (error) return { success: false, error: error.message }
    return { success: true, hasPending: !!request }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to check request' }
  }
}

/** Same implementation as respondToActivityJoinRequest; kept for existing imports. */
export async function respondToCommunityJoinRequest(
  requestId: string,
  message: string
): Promise<SimpleResult> {
  return respondToActivityJoinRequest(requestId, message)
}

/** Same implementation as approveActivityJoinRequest; kept for existing imports. */
export async function approveCommunityJoinRequest(requestId: string): Promise<SimpleResult> {
  return approveActivityJoinRequest(requestId)
}

/** Same implementation as rejectActivityJoinRequest; kept for existing imports. */
export async function rejectCommunityJoinRequest(
  requestId: string,
  rejectionMessage?: string
): Promise<SimpleResult> {
  return rejectActivityJoinRequest(requestId, rejectionMessage)
}

interface PinnedItemWithData {
  type: 'space' | 'note'
  id: string
  portfolio?: {
    id: string
    type: string
    name: string
    avatar?: string
    slug: string
    role?: 'manager' | 'member' // Role of the human portfolio owner in this pinned portfolio
  }
  note?: {
    id: string
    text: string
    owner_account_id: string
    created_at: string
    references?: any[]
    assigned_portfolios?: string[]
    mentioned_note_id?: string | null
    updated_at?: string
    deleted_at?: string | null
    summary?: string | null
    compound_text?: string | null
    topics?: string[]
    intentions?: string[]
    indexing_status?: any
    visibility?: 'public' | 'private'
  }
}

interface GetPinnedItemsResult {
  success: boolean
  items?: PinnedItemWithData[]
  error?: string
}

interface AddToPinnedResult {
  success: boolean
  error?: string
}

interface RemoveFromPinnedResult {
  success: boolean
  error?: string
}

interface UpdatePinnedListResult {
  success: boolean
  error?: string
}

interface EligibleItem {
  type: 'space' | 'note'
  id: string
  name?: string
  text?: string
  avatar?: string
  slug?: string
  role?: string // Role of the current user in this portfolio (for human portfolios)
  isPinned: boolean
}

interface GetEligibleItemsResult {
  success: boolean
  notes?: EligibleItem[]
  portfolios?: EligibleItem[]
  error?: string
}

/**
 * Get pinned items for a portfolio with full data
 */
export async function getPinnedItems(portfolioId: string): Promise<GetPinnedItemsResult> {
  try {
    const supabase = await createClient()
    
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    const portfolioData = portfolio as Portfolio
    const metadata = portfolioData.metadata as any
    const pinned = metadata?.pinned || []
    
    if (!Array.isArray(pinned) || pinned.length === 0) {
      return {
        success: true,
        items: [],
      }
    }

    // For human portfolios, we'll determine the role of the portfolio owner in pinned portfolios
    const userId = isHumanPortfolio(portfolioData) ? portfolioData.user_id : null

    // Fetch full data for pinned items
    const items: PinnedItemWithData[] = []
    
    for (const item of pinned as PinnedItem[]) {
      // For human portfolios, only return notes (not portfolios)
      if (normalizePinnedItemType(item.type) === 'space' && !isHumanPortfolio(portfolioData)) {
        const { data: pinnedPortfolio } = await supabase
          .from('portfolios')
          .select('*')
          .eq('id', item.id)
          .single()

        if (pinnedPortfolio) {
          const basic = getPortfolioBasic(pinnedPortfolio as Portfolio)
          
          // Determine role if this is a human portfolio viewing pinned projects/communities
          let role: 'manager' | 'member' | undefined = undefined
          if (userId && !isHumanPortfolio(pinnedPortfolio as Portfolio)) {
            const pinnedMetadata = pinnedPortfolio.metadata as any
            const managers = pinnedMetadata?.managers || []
            const members = pinnedMetadata?.members || []
            
            if (Array.isArray(managers) && managers.includes(userId)) {
              role = 'manager'
            } else if (Array.isArray(members) && members.includes(userId)) {
              role = 'member'
            }
          }
          
          items.push({
            type: 'space',
            id: item.id,
            portfolio: {
              id: pinnedPortfolio.id,
              type: pinnedPortfolio.type,
              name: basic.name,
              avatar: basic.avatar,
              slug: pinnedPortfolio.slug,
              role,
            },
          })
        }
      } else if (item.type === 'note') {
        const { data: pinnedNote } = await supabase
          .from('notes')
          .select('*') // Select all columns including references
          .eq('id', item.id)
          .is('deleted_at', null)
          .single()

        if (pinnedNote) {
          items.push({
            type: 'note',
            id: item.id,
            note: {
              id: pinnedNote.id,
              text: pinnedNote.text,
              owner_account_id: pinnedNote.owner_account_id,
              created_at: pinnedNote.created_at,
              references: Array.isArray(pinnedNote.references) ? pinnedNote.references : [],
              assigned_portfolios: pinnedNote.assigned_portfolios || [],
              mentioned_note_id: pinnedNote.mentioned_note_id,
              updated_at: pinnedNote.updated_at,
              deleted_at: pinnedNote.deleted_at,
              summary: pinnedNote.summary,
              compound_text: pinnedNote.compound_text,
              topics: pinnedNote.topics || [],
              intentions: pinnedNote.intentions || [],
              indexing_status: pinnedNote.indexing_status,
              visibility: (pinnedNote as any).visibility === 'private' ? 'private' : 'public',
            },
          })
        }
      }
    }

    return {
      success: true,
      items,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Add an item to the pinned list
 */
export async function addToPinned(
  portfolioId: string,
  itemType: 'space' | 'note',
  itemId: string
): Promise<AddToPinnedResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Check if user can manage pinned (creator or manager)
    const canManage = await canManagePinned(portfolioId, user.id)
    if (!canManage) {
      return {
        success: false,
        error: 'Only the creator or managers can edit pinned items',
      }
    }

    // Get portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    const portfolioData = portfolio as Portfolio

    // Validate if item can be added
    const validation = await canAddToPinned(portfolioData, itemType, itemId)
    if (!validation.canAdd) {
      return {
        success: false,
        error: validation.error || 'Cannot add item to pinned list',
      }
    }

    // Get current pinned list
    const metadata = portfolioData.metadata as any
    const pinned = metadata?.pinned || []
    const pinnedArray = Array.isArray(pinned) ? [...pinned] : []

    // Add new item
    pinnedArray.push({ type: itemType, id: itemId })

    // Update portfolio
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({
        metadata: {
          ...metadata,
          pinned: pinnedArray,
        },
      })
      .eq('id', portfolioId)

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to update pinned list',
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Remove an item from the pinned list
 */
export async function removeFromPinned(
  portfolioId: string,
  itemType: 'space' | 'note',
  itemId: string
): Promise<RemoveFromPinnedResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Check if user can manage pinned (creator or manager)
    const canManage = await canManagePinned(portfolioId, user.id)
    if (!canManage) {
      return {
        success: false,
        error: 'Only the creator or managers can edit pinned items',
      }
    }

    // Get portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    const portfolioData = portfolio as Portfolio
    const metadata = portfolioData.metadata as any
    const pinned = metadata?.pinned || []
    const pinnedArray = Array.isArray(pinned) ? [...pinned] : []

    // Remove item
    const updatedPinned = pinnedArray.filter(
      (item: PinnedItem) => !(item.type === itemType && item.id === itemId)
    )

    // Update portfolio
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({
        metadata: {
          ...metadata,
          pinned: updatedPinned,
        },
      })
      .eq('id', portfolioId)

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to update pinned list',
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Update the entire pinned list (for edit page)
 */
export async function updatePinnedList(
  portfolioId: string,
  items: PinnedItem[]
): Promise<UpdatePinnedListResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Check if user can manage pinned (creator or manager)
    const canManage = await canManagePinned(portfolioId, user.id)
    if (!canManage) {
      return {
        success: false,
        error: 'Only the creator or managers can edit pinned items',
      }
    }

    // Validate max length
    if (items.length > 9) {
      return {
        success: false,
        error: 'Pinned list cannot exceed 9 items',
      }
    }

    // Get portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    const portfolioData = portfolio as Portfolio
    const metadata = portfolioData.metadata as any

    // Update portfolio
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({
        metadata: {
          ...metadata,
          pinned: items,
        },
      })
      .eq('id', portfolioId)

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to update pinned list',
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Get eligible items for pinning (notes and sub-portfolios)
 */
export async function getEligibleItemsForPinning(portfolioId: string): Promise<GetEligibleItemsResult> {
  try {
    const supabase = await createClient()
    
    // Get portfolio and pinned items
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    const portfolioData = portfolio as Portfolio
    const metadata = portfolioData.metadata as any
    const pinned = metadata?.pinned || []
    const pinnedArray = Array.isArray(pinned) ? pinned : []
    const pinnedIds = new Set<string>()
    pinnedArray.forEach((item: PinnedItem) => {
      pinnedIds.add(`${item.type}:${item.id}`)
    })

    // Get eligible notes (assigned to this portfolio)
    // For projects/communities: managers can select notes assigned to portfolio
    // For human portfolios: can select notes assigned to portfolio
    const { data: notes, error: notesError } = await supabase
      .from('notes')
      .select('id, text, owner_account_id, created_at')
      .contains('assigned_portfolios', [portfolioId])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    const eligibleNotes: EligibleItem[] = []
    if (notes && !notesError) {
      for (const note of notes) {
        const isPinned = pinnedIds.has(`note:${note.id}`)
        eligibleNotes.push({
          type: 'note',
          id: note.id,
          text: note.text,
          isPinned,
        })
      }
    }

    // Get eligible sub-portfolios
    // For human portfolios: fetch portfolios where user is manager OR member
    // For projects/communities: no portfolios can be pinned (hosts concept removed)
    const eligiblePortfolios: EligibleItem[] = []
    
    if (isHumanPortfolio(portfolioData)) {
      // For human portfolios: use getSubPortfolios which returns portfolios where user is manager/member
      const subPortfoliosResult = await getSubPortfolios(portfolioId)
      
      if (subPortfoliosResult.success) {
        const allSubPortfolios = [
          ...(subPortfoliosResult.projects || []),
          ...(subPortfoliosResult.communities || []),
        ]
        
        for (const subPortfolio of allSubPortfolios) {
          const isPinned = pinnedIds.has(`portfolio:${subPortfolio.id}`)
          eligiblePortfolios.push({
            type: 'space',
            id: subPortfolio.id,
            name: subPortfolio.name,
            avatar: subPortfolio.avatar,
            slug: subPortfolio.slug,
            role: subPortfolio.role,
            isPinned,
          })
        }
      }
    }
    // For projects/communities: no portfolios can be pinned, so eligiblePortfolios stays empty

    return {
      success: true,
      notes: eligibleNotes,
      portfolios: eligiblePortfolios,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}
