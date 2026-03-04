'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { checkAdmin } from '@/lib/auth/requireAdmin'
import { uploadAvatar } from '@/lib/storage/avatars-server'
import { generateSlug } from '@/lib/portfolio/helpers'
import { addProjectToOwnedList } from '@/lib/portfolio/human'
import { normalizeActivityDateTime } from '@/lib/datetime'
import { normalizeExternalLink } from '@/lib/portfolio/normalizeExternalLink'
import { getFaviconUrl } from '@/lib/portfolio/getFaviconUrl'

interface CreatePortfolioResult {
  success: boolean
  portfolioId?: string
  error?: string
}

export async function createPortfolio(
  formData: FormData
): Promise<CreatePortfolioResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Extract form data
    const type = formData.get('type') as string
    const name = formData.get('name') as string
    const avatarFile = formData.get('avatar') as File | null
    const emoji = formData.get('emoji') as string | null
    const projectTypeGeneral = formData.get('project_type_general') as string
    const projectTypeSpecific = formData.get('project_type_specific') as string
    const creatorRole = (formData.get('creator_role') as string) || 'Creator'
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
    const activityCallToJoinDescriptionRaw = formData.get('activity_call_to_join_description') as string | null
    const activityCallToJoinJoinByRaw = formData.get('activity_call_to_join_join_by') as string | null
    const activityCallToJoinRequireApprovalRaw = formData.get('activity_call_to_join_require_approval') as string | null
    const activityCallToJoinPromptRaw = formData.get('activity_call_to_join_prompt') as string | null
    const activityCallToJoinRolesRaw = formData.get('activity_call_to_join_roles') as string | null
    const isExternalRaw = formData.get('is_external') as string | null
    const isExternal = isExternalRaw === 'true'
    const externalLinkRaw = formData.get('external_link') as string | null
    const externalLink = externalLinkRaw?.trim() || ''
    const avatarUrlRaw = formData.get('avatar_url') as string | null
    const avatarUrl = avatarUrlRaw?.trim() || ''
    const iAmGoingRaw = formData.get('i_am_going') as string | null
    const iAmGoing = iAmGoingRaw !== 'false'
    const descriptionRaw = formData.get('description') as string | null
    const activityDescription = descriptionRaw?.trim() || ''
    const hostProjectIdsRaw = formData.get('host_project_ids') as string | null
    const hostProjectIds: string[] =
      hostProjectIdsRaw && typeof hostProjectIdsRaw === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(hostProjectIdsRaw)
              return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
            } catch {
              return []
            }
          })()
        : []
    const hostCommunityIdsRaw = formData.get('host_community_ids') as string | null
    const hostCommunityIds: string[] =
      hostCommunityIdsRaw && typeof hostCommunityIdsRaw === 'string'
        ? (() => {
            try {
              const parsed = JSON.parse(hostCommunityIdsRaw)
              return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
            } catch {
              return []
            }
          })()
        : []

    // Validate type
    if (type !== 'projects' && type !== 'community' && type !== 'activities') {
      return {
        success: false,
        error: 'Invalid portfolio type. Only projects, activities, and communities can be created.',
      }
    }

    // Check if user is admin for community creation
    if (type === 'community') {
      const adminUser = await checkAdmin()
      if (!adminUser) {
        return {
          success: false,
          error: 'Only administrators can create communities.',
        }
      }
    }

    // Validate name
    if (!name || !name.trim()) {
      return {
        success: false,
        error: 'Portfolio name is required',
      }
    }

    // External activities require a link
    if (type === 'activities' && isExternal && !externalLink) {
      return {
        success: false,
        error: 'Event link is required for external activities',
      }
    }

    // External activities: check for duplicate link
    if (type === 'activities' && isExternal && externalLink) {
      const normalizedLink = normalizeExternalLink(externalLink)
      const { data: activities } = await supabase
        .from('portfolios')
        .select('id, metadata')
        .eq('type', 'activities')

      const duplicate = (activities || []).find((p: any) => {
        const props = p.metadata?.properties || {}
        if (props.external !== true) return false
        const stored = (props.external_link as string) || ''
        return stored && normalizeExternalLink(stored) === normalizedLink
      })

      if (duplicate) {
        return {
          success: false,
          error: 'An activity with this event link already exists',
        }
      }
    }

    // Project types are optional - no validation needed

    // Validate creator role (max 2 words)
    if (creatorRole.trim()) {
      const words = creatorRole.trim().split(/\s+/)
      if (words.length > 2) {
        return {
          success: false,
          error: 'Creator role must be 2 words or less',
        }
      }
    }

    // Require either avatar, emoji, or (for external) favicon from link
    if (!avatarFile && !emoji && !(isExternal && (avatarUrl || externalLink))) {
      return {
        success: false,
        error: 'Please upload an image or select an emoji',
      }
    }

    // Generate slug from name
    const baseSlug = generateSlug(name)
    let slug = baseSlug
    let slugCounter = 1

    // Ensure slug is unique for this type
    while (true) {
      const { data: existing } = await supabase
        .from('portfolios')
        .select('id')
        .eq('type', type)
        .eq('slug', slug)
        .single()

      if (!existing) {
        break
      }

      slug = `${baseSlug}-${slugCounter}`
      slugCounter++
    }

    // Compute visibility for projects/activities (public/private). Communities remain public for now.
    // External activities are always public.
    const visibility: 'public' | 'private' =
      type === 'activities' && isExternal
        ? 'public'
        : visibilityRaw === 'private' && (type === 'projects' || type === 'activities')
          ? 'private'
          : 'public'

    // For external activities, use favicon as avatar when no file/emoji provided
    const externalAvatarUrl =
      type === 'activities' && isExternal && !avatarFile && !emoji
        ? avatarUrl || getFaviconUrl(externalLink)
        : ''

    // For external activities, creator is only in members if they chose "I'm going"
    const initialMembers =
      type === 'activities' && isExternal ? (iAmGoing ? [user.id] : []) : [user.id]
    const initialMemberRoles: Record<string, string> =
      type === 'activities' && isExternal
        ? iAmGoing
          ? { [user.id]: creatorRole.trim() || 'Uploader' }
          : {}
        : { [user.id]: creatorRole.trim() || 'Creator' }

    // Create portfolio metadata structure
    const metadata: any = {
      basic: {
        name: name.trim(),
        description: type === 'activities' && activityDescription ? activityDescription : '',
        avatar: externalAvatarUrl || '',
        emoji: emoji || '',
      },
      pinned: [],
      settings: {},
      members: initialMembers,
      managers: [user.id], // Creator is always a manager (can edit)
      ...(projectTypeGeneral && projectTypeSpecific
        ? {
            project_type_general: projectTypeGeneral,
            project_type_specific: projectTypeSpecific,
          }
        : {}),
      memberRoles: initialMemberRoles,
    }

    // Attach initial activity_datetime, location, and call-to-join for activities when provided
    if (type === 'activities') {
      let activityNormalized: any = null

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
          activityNormalized = normalized
          metadata.properties = {
            ...(metadata.properties || {}),
            activity_datetime: normalized,
          }
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
        locationLine1.length > 0 ||
        locationCity.length > 0 ||
        locationState.length > 0 ||
        locationCountry.length > 0 ||
        locationPrivate ||
        isLocationOnline ||
        locationOnlinePrivate

      if (hasAnyLocationField) {
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

        if (Object.keys(location).length > 0) {
          metadata.properties = {
            ...(metadata.properties || {}),
            location,
          }
        }
      }

      // External activities: set external flag and link; no call-to-join
      if (isExternal && externalLink) {
        metadata.properties = {
          ...(metadata.properties || {}),
          external: true,
          external_link: externalLink,
        }
      }

      // Call-to-join: on when activity is not private and not external.
      // No default join_by; window closes when activity end has passed or status is archived.
      if (!isExternal && visibility !== 'private') {
        const existingProperties: Record<string, any> = metadata.properties || {}

        let callToJoinRoles: Array<{ id: string; label: string; activityRole: string }> = [
          { id: 'default-member', label: 'Member', activityRole: 'member' },
        ]
        if (activityCallToJoinRolesRaw && typeof activityCallToJoinRolesRaw === 'string') {
          try {
            const parsed = JSON.parse(activityCallToJoinRolesRaw)
            if (Array.isArray(parsed) && parsed.length > 0) {
              callToJoinRoles = parsed
            }
          } catch {
            // Ignore parse errors and keep default roles
          }
        }

        const descriptionOverride =
          activityCallToJoinDescriptionRaw && activityCallToJoinDescriptionRaw.trim().length > 0
            ? activityCallToJoinDescriptionRaw.trim()
            : 'Join us!'

        const requireApproval =
          activityCallToJoinRequireApprovalRaw == null
            ? true
            : activityCallToJoinRequireApprovalRaw === 'true'

        let joinBy: string | null = null
        if (activityCallToJoinJoinByRaw && activityCallToJoinJoinByRaw.trim().length > 0) {
          const explicit = new Date(activityCallToJoinJoinByRaw)
          if (!Number.isNaN(explicit.getTime())) {
            joinBy = explicit.toISOString()
          }
        }

        const defaultPrompt = 'Why do you want to join this activity?'
        let prompt: string | null = requireApproval ? defaultPrompt : null
        if (requireApproval && activityCallToJoinPromptRaw && activityCallToJoinPromptRaw.trim().length > 0) {
          prompt = activityCallToJoinPromptRaw.trim()
        }

        metadata.properties = {
          ...existingProperties,
          call_to_join: {
            enabled: true,
            description: descriptionOverride,
            join_by: joinBy,
            require_approval: requireApproval,
            prompt,
            roles: callToJoinRoles,
          },
        }
      }
    }

    // Normalize project/activity status
    if (type === 'projects' || type === 'activities') {
      if (projectStatusRaw) {
        // Map legacy 'in-progress' to 'live' and only persist 'live' or 'archived'
        const normalizedStatus =
          projectStatusRaw === 'archived'
            ? 'archived'
            : projectStatusRaw === 'live' || projectStatusRaw === 'in-progress'
              ? 'live'
              : undefined
        if (normalizedStatus) {
          metadata.status = normalizedStatus
        }
      } else if (type === 'activities') {
        // Activities without datetime: default to live when no status set (create form has no Status field)
        if (metadata.status == null || metadata.status === '') {
          metadata.status = 'live'
        }
      }
    }

    // For activities, optionally validate and resolve host projects (multiple)
    let resolvedHostProjectIds: string[] = []
    if (type === 'activities' && hostProjectIds.length > 0) {
      const { data: projects, error: hostError } = await supabase
        .from('portfolios')
        .select('id, user_id, metadata, type')
        .eq('type', 'projects')
        .in('id', hostProjectIds)

      if (hostError || !projects?.length) {
        return {
          success: false,
          error: 'One or more host projects not found',
        }
      }

      for (const proj of projects) {
        const hostMeta = (proj.metadata as any) || {}
        const managers: string[] = hostMeta?.managers || []
        const isOwner = proj.user_id === user.id
        const isManager = Array.isArray(managers) && managers.includes(user.id)
        if (!isOwner && !isManager) {
          return {
            success: false,
            error: 'You must be owner or manager of each host project',
          }
        }
        resolvedHostProjectIds.push(proj.id)
      }
      // Dedupe and preserve order
      resolvedHostProjectIds = [...new Set(resolvedHostProjectIds)]
      const activityProps = (metadata.properties || {}) as Record<string, any>
      metadata.properties = { ...activityProps, host_project_ids: resolvedHostProjectIds }
    }

    // For activities, optionally validate and resolve host communities (multiple)
    let resolvedHostCommunityIds: string[] = []
    if (type === 'activities' && hostCommunityIds.length > 0) {
      const { data: communities, error: hostError } = await supabase
        .from('portfolios')
        .select('id, user_id, metadata, type')
        .eq('type', 'community')
        .in('id', hostCommunityIds)

      if (hostError || !communities?.length) {
        return {
          success: false,
          error: 'One or more host communities not found',
        }
      }

      for (const comm of communities) {
        const hostMeta = (comm.metadata as any) || {}
        const managers: string[] = hostMeta?.managers || []
        const isOwner = comm.user_id === user.id
        const isManager = Array.isArray(managers) && managers.includes(user.id)
        if (!isOwner && !isManager) {
          return {
            success: false,
            error: 'You must be owner or manager of each host community',
          }
        }
        resolvedHostCommunityIds.push(comm.id)
      }
      resolvedHostCommunityIds = [...new Set(resolvedHostCommunityIds)]
      const activityProps = (metadata.properties || {}) as Record<string, any>
      metadata.properties = { ...activityProps, host_community_ids: resolvedHostCommunityIds }
    }

    const firstHostId = type === 'activities' && resolvedHostProjectIds.length > 0 ? resolvedHostProjectIds[0] : null

    // Create portfolio
    const { data: portfolio, error: createError } = await supabase
      .from('portfolios')
      .insert({
        type: type as 'projects' | 'community' | 'activities',
        slug,
        user_id: user.id,
        metadata,
        visibility,
        host_project_id: firstHostId,
      })
      .select()
      .single()

    if (createError || !portfolio) {
      // Log error for debugging
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to create portfolio:', {
          error: createError,
          type,
          slug,
          userId: user.id,
        })
      }
      return {
        success: false,
        error: createError?.message || 'Failed to create portfolio',
      }
    }

    // Ensure portfolio has an ID
    if (!portfolio.id) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Portfolio created but missing ID:', portfolio)
      }
      return {
        success: false,
        error: 'Portfolio created but missing ID',
      }
    }

    // Upload avatar after portfolio creation if provided
    if (avatarFile && avatarFile.size > 0) {
      try {
        const avatarResult = await uploadAvatar(portfolio.id, avatarFile)
        
        // Update portfolio with avatar URL
        await supabase
          .from('portfolios')
          .update({
            metadata: {
              ...metadata,
              basic: {
                ...metadata.basic,
                avatar: avatarResult.url,
              },
            },
          })
          .eq('id', portfolio.id)
      } catch (avatarError: any) {
        // Avatar upload failed, but portfolio was created
        // Log error but don't fail the creation
        console.error('Failed to upload avatar:', avatarError)
      }
    }

    // Trigger background interest processing if description exists (fire-and-forget)
    // Note: Currently description starts empty, but this handles future cases
    const description = metadata.basic.description || ''
    if (description.trim().length > 0) {
      try {
        // Use absolute URL - in server actions, we need the full URL
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        // Use fetch without await - fire and forget
        fetch(`${baseUrl}/api/process-portfolio-interests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            portfolioId: portfolio.id,
            userId: user.id,
            isPersonalPortfolio: false, // New portfolios are not personal
            description,
          }),
        }).catch((error) => {
          // Log error but don't fail portfolio creation
          console.error('Failed to trigger background interest processing:', error)
        })
      } catch (error) {
        // Don't fail portfolio creation if interest processing trigger fails
        console.error('Error triggering background interest processing:', error)
      }
    }

    // If this is a project (not community), add it to user's owned_projects list
    if (type === 'projects') {
      try {
        await addProjectToOwnedList(user.id, portfolio.id)
      } catch (error) {
        // Log error but don't fail portfolio creation
        console.error('Failed to add project to owned list:', error)
      }
    }

    // Log success for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Portfolio created successfully:', {
        id: portfolio.id,
        type,
        slug,
        name: metadata.basic.name,
      })
    }

    return {
      success: true,
      portfolioId: portfolio.id,
    }
  } catch (error: any) {
    // Re-throw redirect errors so Next.js can handle them
    // Next.js redirect() throws an error with digest starting with 'NEXT_REDIRECT'
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

