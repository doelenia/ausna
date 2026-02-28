'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import {
  Portfolio,
  isProjectPortfolio,
  isCommunityPortfolio,
  isHumanPortfolio,
  PinnedItem,
  ActivityCallToJoinConfig,
  HumanAvailabilitySchedule,
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
import { revalidatePath } from 'next/cache'

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
  type: 'projects' | 'community'
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
  type: 'portfolio' | 'note'
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
  type: 'portfolio' | 'note'
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

      // Fetch owned projects using the owned_projects list (ordered by most recent activity)
      let ownedProjects: any[] = []
      if (ownedProjectsList.length > 0) {
        const { data: ownedProjectsData, error: ownedError } = await supabase
          .from('portfolios')
          .select('id, type, slug, metadata, visibility')
          .eq('type', 'projects')
          .in('id', ownedProjectsList)

        if (!ownedError && ownedProjectsData) {
          // Create a map to preserve order from owned_projects list
          const projectMap = new Map(
            ownedProjectsData.map((p: any) => [p.id, p])
          )
          
          // Reorder according to owned_projects list
          ownedProjects = ownedProjectsList
            .map((id: string) => projectMap.get(id))
            .filter((p: any) => p !== undefined)
        }
      }

      // Fetch all other projects where user is a member or manager (but not owner)
      // Note: PostgREST doesn't have great support for JSONB array contains, so we fetch and filter
      const { data: allProjects, error: projectsError } = await supabase
        .from('portfolios')
        .select('id, type, slug, metadata, user_id, visibility')
        .eq('type', 'projects')
        .order('created_at', { ascending: false })
        .limit(100)

      const { data: allCommunities, error: communitiesError } = await supabase
        .from('portfolios')
        .select('id, type, slug, metadata')
        .eq('type', 'community')
        .order('created_at', { ascending: false })
        .limit(100)

      if (projectsError || communitiesError) {
        return {
          success: false,
          error: 'Failed to fetch sub-portfolios',
        }
      }

      // Filter projects where user is a member or manager (but not owner)
      // Exclude projects that are already in ownedProjectsList
      const memberProjects = (allProjects || [])
        .filter((p: any) => {
          // Skip if user is owner (already in ownedProjects)
          if (p.user_id === userId) {
            return false
          }
          // Skip if already in owned list
          if (ownedProjectsList.includes(p.id)) {
            return false
          }
          const metadata = p.metadata as any
          const managers = metadata?.managers || []
          const members = metadata?.members || []
          return (Array.isArray(managers) && managers.includes(userId)) ||
                 (Array.isArray(members) && members.includes(userId))
        })

      // Combine owned projects (first, in order) with member projects
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
          type: 'projects' as const,
          name: basic.name,
          avatar: basic.avatar,
          slug: p.slug,
          role: userRole,
          projectType: projectTypeSpecific,
          visibility: (p as any).visibility === 'private' ? 'private' : 'public',
        }
      })

      // Filter communities where user is a manager or member, and determine role
      const communities = (allCommunities || [])
        .filter((p: any) => {
          const metadata = p.metadata as any
          const managers = metadata?.managers || []
          const members = metadata?.members || []
          return (Array.isArray(managers) && managers.includes(userId)) ||
                 (Array.isArray(members) && members.includes(userId))
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
            type: 'community' as const,
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
    } else if (isProjectPortfolio(portfolioData) || isCommunityPortfolio(portfolioData)) {
      // For project/community portfolios: no sub-portfolios (hosts concept removed)
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
    const hostProjectIdsRaw = formData.get('host_project_ids') as string | null
    const humanAutoCityLocationEnabledRaw = formData.get(
      'human_auto_city_location_enabled'
    ) as string | null
    const humanAvailabilityScheduleRaw = formData.get(
      'human_availability_schedule'
    ) as string | null

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
      .select('metadata, type, user_id, visibility')
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

    // Update project type if provided (for projects and communities)
    // Allow clearing project types by providing empty values
    if (portfolio.type === 'projects' || portfolio.type === 'community') {
      if (projectTypeGeneral !== null && projectTypeSpecific !== null) {
        // If both are provided (even if empty), update them
        updatedMetadata.project_type_general = projectTypeGeneral || undefined
        updatedMetadata.project_type_specific = projectTypeSpecific || undefined
      }
      // If not provided in formData, leave existing values unchanged
    }

    // For project portfolios, keep status/visibility but do not manage activity datetime/location
    if (portfolio.type === 'projects') {
      if (projectStatusRaw !== null) {
        const normalizedStatus =
          projectStatusRaw === 'in-progress' || projectStatusRaw === 'archived'
            ? projectStatusRaw
            : undefined
        if (normalizedStatus) {
          updatedMetadata.status = normalizedStatus
        } else if (Object.prototype.hasOwnProperty.call(updatedMetadata, 'status')) {
          delete updatedMetadata.status
        }
      }
    }

    // For activity portfolios, update activity_datetime, location, and status inside metadata
    if (portfolio.type === 'activities') {
      const properties = (currentMetadata.properties || {}) as Record<string, any>
      const hasAnyActivityField =
        (activityStartRaw && activityStartRaw.trim().length > 0) ||
        (activityEndRaw && activityEndRaw.trim().length > 0) ||
        (activityInProgressRaw && activityInProgressRaw.trim().length > 0) ||
        (activityAllDayRaw && activityAllDayRaw.trim().length > 0)

      if (hasAnyActivityField) {
        const normalized = normalizeActivityDateTime(
          {
          start: activityStartRaw || '',
          end: activityEndRaw || undefined,
          inProgress: activityInProgressRaw === 'true',
          allDay: activityAllDayRaw === 'true',
          },
          { intervalMinutes: 15 }
        )

        if (normalized) {
        const nextProperties: Record<string, any> = {
          ...properties,
          activity_datetime: normalized,
        }

        // Call-to-join: no auto-managed join_by. When no join_by is set, window closes
        // when activity end has passed or status is archived (evaluated at read/apply time).
        updatedMetadata.properties = nextProperties
        } else {
          // If normalization failed, remove the property rather than saving invalid data
          const { activity_datetime, ...rest } = properties
          updatedMetadata.properties = Object.keys(rest).length > 0 ? rest : undefined
        }
      } else if (properties && Object.prototype.hasOwnProperty.call(properties, 'activity_datetime')) {
        const { activity_datetime, ...rest } = properties
        updatedMetadata.properties = Object.keys(rest).length > 0 ? rest : undefined
      }

      const locationLine1 = activityLocationLine1Raw?.trim() || ''
      const locationCity = activityLocationCityRaw?.trim() || ''
      const locationState = activityLocationStateRaw?.trim() || ''
      const locationCountry = activityLocationCountryRaw?.trim() || ''
      const locationCountryCode = activityLocationCountryCodeRaw?.trim() || ''
      const locationStateCode = activityLocationStateCodeRaw?.trim() || ''
      const locationPrivate = activityLocationPrivateRaw === 'true'

      const hasAnyLocationField =
        (activityLocationLine1Raw !== null && activityLocationLine1Raw !== undefined) ||
        (activityLocationCityRaw !== null && activityLocationCityRaw !== undefined) ||
        (activityLocationStateRaw !== null && activityLocationStateRaw !== undefined) ||
        (activityLocationCountryRaw !== null && activityLocationCountryRaw !== undefined) ||
        (activityLocationCountryCodeRaw !== null && activityLocationCountryCodeRaw !== undefined) ||
        (activityLocationStateCodeRaw !== null && activityLocationStateCodeRaw !== undefined) ||
        (activityLocationPrivateRaw !== null && activityLocationPrivateRaw !== undefined)

      if (hasAnyLocationField) {
        const nextProperties = (updatedMetadata.properties || properties || {}) as Record<string, any>

        const hasAnyNonEmptyLocationField =
          locationLine1.length > 0 ||
          locationCity.length > 0 ||
          locationState.length > 0 ||
          locationCountry.length > 0 ||
          locationCountryCode.length > 0 ||
          locationStateCode.length > 0 ||
          locationPrivate

        if (hasAnyNonEmptyLocationField) {
          const location: Record<string, any> = {}
          if (locationLine1) location.line1 = locationLine1
          if (locationCity) location.city = locationCity
          if (locationState) location.state = locationState
          if (locationCountry) location.country = locationCountry
          if (locationCountryCode) location.countryCode = locationCountryCode
          if (locationStateCode) location.stateCode = locationStateCode
          if (locationPrivate) location.isExactLocationPrivate = true

          nextProperties.location = Object.keys(location).length > 0 ? location : undefined
          updatedMetadata.properties = nextProperties
        } else if (Object.prototype.hasOwnProperty.call(nextProperties, 'location')) {
          const { location, ...rest } = nextProperties
          updatedMetadata.properties = Object.keys(rest).length > 0 ? rest : undefined
        } else {
          updatedMetadata.properties = Object.keys(nextProperties).length > 0 ? nextProperties : undefined
        }
      }

      if (projectStatusRaw !== null) {
        const normalizedStatus =
          projectStatusRaw === 'in-progress' || projectStatusRaw === 'archived'
            ? projectStatusRaw
            : undefined
        if (normalizedStatus) {
          updatedMetadata.status = normalizedStatus
        } else if (Object.prototype.hasOwnProperty.call(updatedMetadata, 'status')) {
          delete updatedMetadata.status
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
              .eq('type', 'projects')
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
        try {
          const parsed = humanAvailabilityScheduleRaw
            ? JSON.parse(humanAvailabilityScheduleRaw)
            : null
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

    // Allow owner to update visibility for project and activity portfolios
    if (
      (portfolio.type === 'projects' || portfolio.type === 'activities') &&
      (visibilityRaw === 'public' || visibilityRaw === 'private')
    ) {
      updatePayload.visibility = visibilityRaw
    }

    // For activities, sync host_project_id from metadata.properties.host_project_ids (first)
    if (portfolio.type === 'activities') {
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
        } else if (portfolio.type === 'projects') {
          fetch(`${baseUrl}/api/index-project-description`, {
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
            console.error('Failed to trigger project description processing:', error)
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
        
        // Revalidate Next.js cache for this portfolio page
        revalidatePath(`/portfolio/${portfolio.type}/${portfolioId}`)
        revalidatePath(`/portfolio/${portfolio.type}/${portfolioId}/members`)
        revalidatePath(`/portfolio/${portfolio.type}/${portfolioId}/pinned`)
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
      .select('type, user_id')
      .eq('id', portfolioId)
      .single()

    if (!portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

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

    // If this was a project, remove it from owner's owned_projects list
    if (portfolio.type === 'projects') {
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
      .select('id, type, user_id, metadata')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return { success: false, error: 'Activity not found' }
    }

    if (portfolio.type !== 'activities') {
      return { success: false, error: 'Call-to-join is only available for activities' }
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

    revalidatePath(`/portfolio/activities/${portfolioId}`)
    revalidatePath(`/portfolio/activities/${portfolioId}/members`)

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
      .select('id, type, user_id, metadata')
      .eq('id', portfolioId)
      .single()
    if (!portfolio || portfolio.type !== 'activities') {
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
    if (!portfolio || portfolio.type !== 'activities') {
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
 * Send a message to an applicant (activity join request) and mark the request as responded.
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
      .select('id, type, user_id, metadata')
      .eq('id', activityId)
      .single()

    if (portfolioError || !portfolio || portfolio.type !== 'activities') {
      return { success: false, error: 'Activity not found for this request' }
    }

    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)

    if (!isOwner && !isManager) {
      return {
        success: false,
        error: 'Only the activity owner or managers can respond to requests',
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
    const activityName = (basic.name as string) || 'this activity'
    const text =
      message.trim().length > 0
        ? `Regarding your request to join ${activityName} (activity): ${message.trim()}`
        : `We received your request to join ${activityName} (activity). We’ll get back to you soon.`

    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: request.applicant_user_id,
      text,
    })

    revalidatePath(`/portfolio/activities/${activityId}`)
    revalidatePath(`/portfolio/activities/${activityId}/members`)

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
      return { success: false, error: 'Activity not found' }
    }

    if (portfolio.type !== 'activities') {
      return { success: false, error: 'Call-to-join is only available for activities' }
    }

    const visibility = (portfolio as any).visibility === 'private' ? 'private' : 'public'
    if (visibility === 'private') {
      return { success: false, error: 'Call-to-join is not available for private activities' }
    }

    const metadata = (portfolio.metadata as any) || {}
    const properties: Record<string, any> = (metadata.properties || {}) as Record<string, any>
    const callToJoin: ActivityCallToJoinConfig | undefined = properties.call_to_join

    if (!callToJoin) {
      return { success: false, error: 'Call-to-join is not configured for this activity' }
    }

    const activityDateTime = (properties.activity_datetime || null) as import('@/lib/datetime').ActivityDateTimeValue | null
    const status = (metadata.status as string) || null
    const { isCallToJoinWindowOpen } = await import('@/lib/callToJoin')
    if (!isCallToJoinWindowOpen(visibility, callToJoin, activityDateTime, status)) {
      return { success: false, error: 'The call-to-join window for this activity is closed' }
    }

    const members: string[] = metadata?.members || []
    const managers: string[] = metadata?.managers || []

    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)
    const isMember = Array.isArray(members) && members.includes(user.id)

    if (isOwner || isManager || isMember) {
      return { success: false, error: 'You are already part of this activity' }
    }

    // Role is configured after joining; new members join as member by default
    const activityRole = 'member'
    const memberRoleLabel = 'Member'

    const sendMessage = async (receiverId: string, text: string) => {
      await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: receiverId,
        text,
      })
    }

    const basic = metadata?.basic || {}
    const activityName = (basic.name as string) || 'this activity'

    if (callToJoin.require_approval) {
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
          error: 'You already have a pending request for this activity',
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

      // Notify activity owner; link directs to Requests & Invites tab
      const requestsUrl = `/portfolio/activities/${portfolioId}/members?tab=requests`
      await sendMessage(
        portfolio.user_id,
        `applied to join ${activityName} (activity). Review: ${requestsUrl}`
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
          error: directError.message || 'Failed to join activity',
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
          error: metadataError.message || 'Failed to update activity membership',
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

    // Notify owner about the new member
    await sendMessage(
      portfolio.user_id,
      `joined ${activityName} (activity) as ${memberRoleLabel}`
    )

    revalidatePath(`/portfolio/activities/${portfolioId}`)
    revalidatePath(`/portfolio/activities/${portfolioId}/members`)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Approve an activity join request and add the applicant as a member/manager.
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
      .select('id, type, user_id, metadata')
      .eq('id', activityId)
      .single()

    if (portfolioError || !portfolio || portfolio.type !== 'activities') {
      return { success: false, error: 'Activity not found for this request' }
    }

    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)

    if (!isOwner && !isManager) {
      return {
        success: false,
        error: 'Only the activity owner or managers can approve requests',
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
          error: metadataError.message || 'Failed to update activity membership',
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
    const activityName = (basic.name as string) || 'this activity'

    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: applicantId,
      text: `approved your request to join ${activityName} (activity) as ${memberRoleLabel}`,
    })

    revalidatePath(`/portfolio/activities/${activityId}`)
    revalidatePath(`/portfolio/activities/${activityId}/members`)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Reject an activity join request and optionally send a message to the applicant.
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
      .select('id, type, user_id, metadata')
      .eq('id', activityId)
      .single()

    if (portfolioError || !portfolio || portfolio.type !== 'activities') {
      return { success: false, error: 'Activity not found for this request' }
    }

    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)

    if (!isOwner && !isManager) {
      return {
        success: false,
        error: 'Only the activity owner or managers can reject requests',
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
    const activityName = (basic.name as string) || 'this activity'

    let text = `rejected your request to join ${activityName} (activity)`
    if (rejectionMessage && rejectionMessage.trim().length > 0) {
      text += `: ${rejectionMessage.trim()}`
    }

    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: request.applicant_user_id,
      text,
    })

    revalidatePath(`/portfolio/activities/${activityId}`)
    revalidatePath(`/portfolio/activities/${activityId}/members`)

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
      .select('id, type, user_id, metadata')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return { success: false, error: 'Community not found' }
    }
    if (portfolio.type !== 'community') {
      return { success: false, error: 'Not a community' }
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
      return { success: false, error: 'You already have a pending request for this community' }
    }

    const { error: insertError } = await supabase.from('portfolio_join_requests').insert({
      portfolio_id: portfolioId,
      applicant_user_id: user.id,
      prompt_answer: promptAnswer?.trim() || null,
      status: 'pending',
    })

    if (insertError) {
      return { success: false, error: insertError.message || 'Failed to submit join request' }
    }

    const basic = metadata?.basic || {}
    const communityName = (basic.name as string) || 'this community'
    const requestsUrl = `/portfolio/community/${portfolioId}/members?tab=requests`
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: portfolio.user_id,
      text: `applied to join ${communityName} (community). Review: ${requestsUrl}`,
    })

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
      .select('id, type, user_id, metadata')
      .eq('id', portfolioId)
      .single()
    if (!portfolio || portfolio.type !== 'community') {
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
 * Check whether the current user has a pending join request for this community.
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
    if (!portfolio || portfolio.type !== 'community') {
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
 * Respond to a community join request (message applicant, set responded_at). Owner/manager only.
 */
export async function respondToCommunityJoinRequest(
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
    const portfolioId: string = request.portfolio_id
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata')
      .eq('id', portfolioId)
      .single()
    if (portfolioError || !portfolio || portfolio.type !== 'community') {
      return { success: false, error: 'Community not found for this request' }
    }
    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)
    if (!isOwner && !isManager) {
      return { success: false, error: 'Only the community owner or managers can respond to requests' }
    }
    const { error: updateRequestError } = await supabase
      .from('portfolio_join_requests')
      .update({ responded_at: new Date().toISOString() })
      .eq('id', requestId)
    if (updateRequestError) {
      return { success: false, error: updateRequestError.message || 'Failed to update join request' }
    }
    const basic = metadata?.basic || {}
    const communityName = (basic.name as string) || 'this community'
    const text =
      message.trim().length > 0
        ? `Regarding your request to join ${communityName} (community): ${message.trim()}`
        : `We received your request to join ${communityName} (community). We'll get back to you soon.`
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: request.applicant_user_id,
      text,
    })
    revalidatePath(`/portfolio/community/${portfolioId}`)
    revalidatePath(`/portfolio/community/${portfolioId}/members`)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'An unexpected error occurred' }
  }
}

/**
 * Approve a community join request and add the applicant as a member.
 */
export async function approveCommunityJoinRequest(requestId: string): Promise<SimpleResult> {
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
    const portfolioId: string = request.portfolio_id
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata')
      .eq('id', portfolioId)
      .single()
    if (portfolioError || !portfolio || portfolio.type !== 'community') {
      return { success: false, error: 'Community not found for this request' }
    }
    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)
    if (!isOwner && !isManager) {
      return { success: false, error: 'Only the community owner or managers can approve requests' }
    }
    const applicantId: string = request.applicant_user_id
    const currentMembers: string[] = metadata?.members || []
    const nextMembers = currentMembers.includes(applicantId)
      ? currentMembers
      : [...currentMembers, applicantId]
    const updatedMetadata = { ...metadata, members: nextMembers }
    const { error: rpcError } = await supabase.rpc('update_portfolio_members', {
      portfolio_id: portfolioId,
      new_members: nextMembers,
    })
    if (rpcError) {
      const { error: directError } = await supabase
        .from('portfolios')
        .update({ metadata: updatedMetadata })
        .eq('id', portfolioId)
      if (directError) {
        return { success: false, error: directError.message || 'Failed to update members' }
      }
    } else {
      const { error: metadataError } = await supabase
        .from('portfolios')
        .update({ metadata: updatedMetadata })
        .eq('id', portfolioId)
      if (metadataError) {
        return { success: false, error: metadataError.message || 'Failed to update membership' }
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
      return { success: false, error: updateRequestError.message || 'Failed to update request' }
    }
    const basic = metadata?.basic || {}
    const communityName = (basic.name as string) || 'this community'
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: applicantId,
      text: `approved your request to join ${communityName} (community)`,
    })
    revalidatePath(`/portfolio/community/${portfolioId}`)
    revalidatePath(`/portfolio/community/${portfolioId}/members`)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'An unexpected error occurred' }
  }
}

/**
 * Reject a community join request and optionally send a message to the applicant.
 */
export async function rejectCommunityJoinRequest(
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
    const portfolioId: string = request.portfolio_id
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, metadata')
      .eq('id', portfolioId)
      .single()
    if (portfolioError || !portfolio || portfolio.type !== 'community') {
      return { success: false, error: 'Community not found for this request' }
    }
    const metadata = (portfolio.metadata as any) || {}
    const managers: string[] = metadata?.managers || []
    const isOwner = portfolio.user_id === user.id
    const isManager = Array.isArray(managers) && managers.includes(user.id)
    if (!isOwner && !isManager) {
      return { success: false, error: 'Only the community owner or managers can reject requests' }
    }
    const { error: updateRequestError } = await supabase
      .from('portfolio_join_requests')
      .update({
        status: 'rejected',
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectionMessage?.trim() || null,
      })
      .eq('id', requestId)
    if (updateRequestError) {
      return { success: false, error: updateRequestError.message || 'Failed to update join request' }
    }
    const basic = metadata?.basic || {}
    const communityName = (basic.name as string) || 'this community'
    let text = `rejected your request to join ${communityName} (community)`
    if (rejectionMessage && rejectionMessage.trim().length > 0) {
      text += `: ${rejectionMessage.trim()}`
    }
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: request.applicant_user_id,
      text,
    })
    revalidatePath(`/portfolio/community/${portfolioId}`)
    revalidatePath(`/portfolio/community/${portfolioId}/members`)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'An unexpected error occurred' }
  }
}

interface PinnedItemWithData {
  type: 'portfolio' | 'note'
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
  type: 'portfolio' | 'note'
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
      if (item.type === 'portfolio' && !isHumanPortfolio(portfolioData)) {
        const { data: pinnedPortfolio } = await supabase
          .from('portfolios')
          .select('*')
          .eq('id', item.id)
          .single()

        if (pinnedPortfolio) {
          const basic = getPortfolioBasic(pinnedPortfolio as Portfolio)
          
          // Determine role if this is a human portfolio viewing pinned projects/communities
          let role: 'manager' | 'member' | undefined = undefined
          if (userId && (pinnedPortfolio.type === 'projects' || pinnedPortfolio.type === 'community')) {
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
            type: 'portfolio',
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
  itemType: 'portfolio' | 'note',
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
  itemType: 'portfolio' | 'note',
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
            type: 'portfolio',
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
