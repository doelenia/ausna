'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { Portfolio, isProjectPortfolio, isCommunityPortfolio, isHumanPortfolio, PinnedItem } from '@/types/portfolio'
import { getPortfolioBasic, canEditPortfolio, canDeletePortfolio, canManagePinned, canAddToPinned, getPinnedItemsCount, isNoteAssignedToPortfolio } from '@/lib/portfolio/helpers'
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

      // Fetch all projects and communities, then filter by manager/member status
      // Note: PostgREST doesn't have great support for JSONB array contains, so we fetch and filter
      const { data: allProjects, error: projectsError } = await supabase
        .from('portfolios')
        .select('id, type, slug, metadata')
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

      // Filter projects where user is a manager or member, and determine role
      const projects = (allProjects || [])
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
          const members = metadata?.members || []
          const isManager = Array.isArray(managers) && managers.includes(userId)
          const memberRoles = metadata?.memberRoles || {}
          const userRole = memberRoles[userId] || (isManager ? 'Manager' : 'Member')
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
      .select('metadata, type, user_id')
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
    if ((portfolio.type === 'projects' || portfolio.type === 'community') && projectTypeGeneral && projectTypeSpecific) {
      updatedMetadata.project_type_general = projectTypeGeneral
      updatedMetadata.project_type_specific = projectTypeSpecific
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

    // Update portfolio
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({
        metadata: updatedMetadata,
      })
      .eq('id', portfolioId)

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to update portfolio',
      }
    }

    // Trigger background interest processing if description changed (fire-and-forget)
    if (descriptionChanged) {
      try {
        // Use absolute URL - in server actions, we need the full URL
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const isPersonalPortfolio =
          portfolio.type === 'human' && portfolio.user_id === user.id

        // Use fetch without await - fire and forget
        fetch(`${baseUrl}/api/process-portfolio-interests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            portfolioId,
            userId: user.id,
            isPersonalPortfolio,
            description: normalizedDescription,
          }),
        }).catch((error) => {
          // Log error but don't fail portfolio update
          console.error('Failed to trigger background interest processing:', error)
        })
      } catch (error) {
        // Don't fail portfolio update if interest processing trigger fails
        console.error('Error triggering background interest processing:', error)
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
        revalidatePath(`/portfolio/${portfolio.type}/${portfolioId}/all`)
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

    // Revalidate Next.js cache for portfolio pages after any update
    revalidatePath(`/portfolio/${portfolio.type}/${portfolioId}`)
    revalidatePath(`/portfolio/${portfolio.type}/${portfolioId}/all`)
    revalidatePath(`/portfolio/${portfolio.type}/${portfolioId}/members`)
    revalidatePath(`/portfolio/${portfolio.type}/${portfolioId}/pinned`)

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

    // Check portfolio type
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('type')
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
