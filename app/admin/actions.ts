'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createServiceClient } from '@/lib/supabase/service'
import {
  findUserByEmail,
  findHumanPortfolioByEmail,
  findOrCreateHumanPortfolioForEmail,
  updateHumanPortfolioMetadataById,
  findOrCreateUserByEmail,
  createPlaceholderHumanPortfolio,
  addProjectToOwnedListById,
} from '@/lib/portfolio/admin-helpers'
import { generateSlug } from '@/lib/portfolio/helpers'
import { HumanPortfolioMetadata, ProjectPortfolioMetadata } from '@/types/portfolio'
import {
  getDemoDisplayName,
  maskDescription,
} from '@/lib/admin/demoAnonymization'

// Waitlist actions
interface ApproveWaitlistResult {
  success: boolean
  error?: string
  warning?: string
}

interface DeleteWaitlistResult {
  success: boolean
  error?: string
}

interface GetWaitlistResult {
  success: boolean
  waitlist?: Array<{
    id: string
    email: string
    username: string | null
    status: string
    created_at: string
    approved_at: string | null
    approved_by: string | null
  }>
  error?: string
}

// User actions
interface GetUsersResult {
  success: boolean
  users?: Array<{
    id: string
    email: string
    username: string | null
    name: string | null
    created_at: string
    is_blocked: boolean
    human_portfolio_id: string | null
    // Derived approval status: true if user has at least one non-pseudo human portfolio
    is_approved?: boolean
  }>
  error?: string
}

interface BlockUserResult {
  success: boolean
  error?: string
}

interface ApproveUserResult {
  success: boolean
  error?: string
}

interface DeleteUserResult {
  success: boolean
  error?: string
}

// Search actions
interface SearchUsersResult {
  success: boolean
  users?: Array<{
    id: string
    email: string
    username: string | null
    name: string | null
    created_at: string
    is_blocked: boolean
    human_portfolio_id: string | null
    // Derived approval/verification status from human portfolio is_pseudo
    is_approved?: boolean
  }>
  error?: string
}

interface SearchNotesResult {
  success: boolean
  notes?: Array<{
    id: string
    text: string
    owner_account_id: string
    owner_name: string | null
    created_at: string
    assigned_portfolios: string[]
  }>
  total?: number
  page?: number
  totalPages?: number
  error?: string
}

interface SearchPortfoliosResult {
  success: boolean
  portfolios?: Array<{
    id: string
    type: string
    name: string
    description: string | null
    user_id: string
    creator_name: string | null
    created_at: string
    members_count: number
  }>
  total?: number
  page?: number
  totalPages?: number
  error?: string
}

// Delete actions
interface DeleteNoteResult {
  success: boolean
  error?: string
}

interface DeletePortfolioResult {
  success: boolean
  error?: string
}

// Create human portfolio actions
export interface CreateHumanPortfolioInput {
  name: string
  email: string
  description?: string
  joined_community?: string // community portfolio ID
  is_pseudo?: boolean // defaults to true
  properties?: {
    current_location?: string
    availability?: string
    social_preferences?: string
    preferred_contact_method?: string
    [key: string]: string | undefined // Allow additional properties from form config
  }
  projects?: Array<{
    name: string
    description?: string
    project_type_general?: string
    project_type_specific?: string
    is_pseudo?: boolean // defaults to true
    members?: Array<{
      name: string
      email?: string
      role?: string // max 2 words
      is_pseudo?: boolean // defaults to true
    }>
    properties?: {
      goals?: string
      timelines?: string
      asks?: Array<{ title: string; description: string }>
    }
  }>
}

interface CreateHumanPortfolioResult {
  success: boolean
  portfolioId?: string
  error?: string
}

/**
 * Approve a waitlist entry
 */
export async function approveWaitlist(waitlistId: string): Promise<ApproveWaitlistResult> {
  try {
    const { user, supabase } = await requireAdmin()
    const { createServiceClient } = await import('@/lib/supabase/service')
    const serviceClient = createServiceClient()

    // Get waitlist entry to get email and username
    const { data: waitlistEntry, error: fetchError } = await supabase
      .from('waitlist')
      .select('email, username')
      .eq('id', waitlistId)
      .single()

    if (fetchError || !waitlistEntry) {
      return {
        success: false,
        error: 'Waitlist entry not found',
      }
    }

    // Update waitlist status
    const { error: updateError } = await supabase
      .from('waitlist')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user.id,
      })
      .eq('id', waitlistId)

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to approve waitlist entry',
      }
    }

    // Send invite email using Supabase Auth Admin API
    try {
      // Get the site URL from environment or use a sensible default
      // In production, set NEXT_PUBLIC_SITE_URL to your domain (e.g., https://yourdomain.com)
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                     (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      
      const { data: inviteData, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
        waitlistEntry.email,
        {
          data: waitlistEntry.username ? { username: waitlistEntry.username } : undefined,
          // Redirect to main page - InviteHandler will process the hash fragment
          redirectTo: `${siteUrl}/main`,
        }
      )

      if (inviteError) {
        console.error('Error sending invite email:', inviteError)
        // Don't fail the approval if email fails, but log it
        return {
          success: true,
          warning: 'Waitlist approved, but invite email failed to send. User can still sign up manually.',
        }
      }

      console.log('Invite email sent successfully:', inviteData)
    } catch (inviteErr: any) {
      console.error('Exception sending invite email:', inviteErr)
      // Don't fail the approval if email fails
      return {
        success: true,
        warning: 'Waitlist approved, but invite email failed to send. User can still sign up manually.',
      }
    }

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}


/**
 * Delete a waitlist entry (removes it completely, allows them to sign up again)
 */
export async function deleteWaitlist(waitlistId: string): Promise<DeleteWaitlistResult> {
  try {
    const { supabase } = await requireAdmin()

    const { data, error } = await supabase
      .from('waitlist')
      .delete()
      .eq('id', waitlistId)
      .select()

    if (error) {
      console.error('Delete waitlist error:', error)
      return {
        success: false,
        error: error.message || 'Failed to delete waitlist entry',
      }
    }

    // Check if any rows were deleted
    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'Waitlist entry not found or already deleted',
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Delete waitlist exception:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Get all waitlist entries
 */
export async function getWaitlist(): Promise<GetWaitlistResult> {
  try {
    const { supabase } = await requireAdmin()

    const { data, error } = await supabase
      .from('waitlist')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to fetch waitlist',
      }
    }

    return {
      success: true,
      waitlist: data || [],
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Get all users with their human portfolio info
 */
export async function getUsers(): Promise<GetUsersResult> {
  try {
    const { supabase } = await requireAdmin()
    const serviceClient = createServiceClient()

    // Get all users from auth (requires service role)
    const { data: authUsers, error: authError } = await serviceClient.auth.admin.listUsers()

    if (authError) {
      return {
        success: false,
        error: authError.message || 'Failed to fetch users',
      }
    }

    // Get all human portfolios to match with users
    const { data: humanPortfolios, error: portfolioError } = await supabase
      .from('portfolios')
      .select('user_id, metadata, id, is_pseudo')
      .eq('type', 'human')

    if (portfolioError) {
      return {
        success: false,
        error: portfolioError.message || 'Failed to fetch portfolios',
      }
    }

    // Create a map of user_id to portfolio, including is_pseudo for approval status
    const portfolioMap = new Map(
      (humanPortfolios || []).map((p) => [
        p.user_id,
        {
          id: p.id,
          metadata: p.metadata as any,
          is_pseudo: (p as any).is_pseudo as boolean | null | undefined,
        },
      ])
    )

    // Combine user data with portfolio info
    const users = (authUsers.users || []).map((authUser) => {
      const portfolio = portfolioMap.get(authUser.id) as
        | { id: string; metadata: any; is_pseudo?: boolean }
        | undefined
      const metadata = portfolio?.metadata || {}
      const userMetadata = authUser.user_metadata || {}

      // A user is considered approved if they have at least one non-pseudo human portfolio.
      // Admins can see pseudo portfolios, but for display we treat pseudo = not approved.
      const isApproved = portfolio ? portfolio.is_pseudo === false : false

      return {
        id: authUser.id,
        email: authUser.email || '',
        username: metadata.username || userMetadata.username || null,
        name: metadata.basic?.name || metadata.full_name || userMetadata.full_name || null,
        created_at: authUser.created_at,
        is_blocked: userMetadata.is_blocked === true,
        human_portfolio_id: portfolio?.id || null,
        is_approved: isApproved,
      }
    })

    return {
      success: true,
      users,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Delete a user and all their associated data
 * This performs comprehensive cleanup:
 * - Deletes owned projects (and removes them from member portfolios)
 * - Removes user from joined communities
 * - Deletes owned notes (cascade)
 * - Deletes user from auth
 * - Other data (subscriptions, friends, messages, etc.) cascade delete
 */
export async function deleteUser(userId: string): Promise<DeleteUserResult> {
  try {
    await requireAdmin()
    const serviceClient = createServiceClient()

    // Prevent deleting yourself
    const { user: adminUser } = await requireAdmin()
    if (adminUser.id === userId) {
      return {
        success: false,
        error: 'You cannot delete yourself',
      }
    }

    // Step 1: Get all projects owned by the user
    const { data: ownedProjects, error: projectsError } = await serviceClient
      .from('portfolios')
      .select('id, metadata')
      .eq('type', 'projects')
      .eq('user_id', userId)

    if (projectsError) {
      console.error('Error fetching owned projects:', projectsError)
      return {
        success: false,
        error: `Failed to fetch owned projects: ${projectsError.message}`,
      }
    }

    // Step 2: For each owned project, remove it from all member portfolios' owned_projects lists
    if (ownedProjects && ownedProjects.length > 0) {
      for (const project of ownedProjects) {
        const projectMetadata = project.metadata as any
        const members = projectMetadata?.members || []
        const allMembers = Array.isArray(members) ? members : []

        // Remove project from each member's owned_projects list
        for (const memberId of allMembers) {
          try {
            const { removeProjectFromOwnedListById } = await import('@/lib/portfolio/admin-helpers')
            // Pass user_id to find the portfolio
            await removeProjectFromOwnedListById(memberId, project.id)
          } catch (error) {
            // Log but continue - member might not have a portfolio or project might already be removed
            console.error(`Failed to remove project ${project.id} from member ${memberId}'s owned_projects:`, error)
          }
        }
      }

      // Delete all owned projects
      const projectIds = ownedProjects.map((p) => p.id)
      const { error: deleteProjectsError } = await serviceClient
        .from('portfolios')
        .delete()
        .in('id', projectIds)

      if (deleteProjectsError) {
        console.error('Error deleting owned projects:', deleteProjectsError)
        return {
          success: false,
          error: `Failed to delete owned projects: ${deleteProjectsError.message}`,
        }
      }
    }

    // Step 3: Remove user from projects where they are a member (but not owner)
    const { data: allProjects, error: allProjectsError } = await serviceClient
      .from('portfolios')
      .select('id, user_id, metadata')
      .eq('type', 'projects')

    if (allProjectsError) {
      console.error('Error fetching all projects:', allProjectsError)
      // Continue anyway - this is not critical
    } else if (allProjects) {
      for (const project of allProjects) {
        // Skip if user is owner (already handled above)
        if (project.user_id === userId) {
          continue
        }

        const metadata = project.metadata as any
        const members = metadata?.members || []
        const managers = metadata?.managers || []
        const isMember = Array.isArray(members) && members.includes(userId)
        const isManager = Array.isArray(managers) && managers.includes(userId)

        if (isMember || isManager) {
          // Remove user from members and/or managers
          const updatedMembers = Array.isArray(members)
            ? members.filter((id: string) => id !== userId)
            : []
          const updatedManagers = Array.isArray(managers)
            ? managers.filter((id: string) => id !== userId)
            : []

          const { error: updateError } = await serviceClient
            .from('portfolios')
            .update({
              metadata: {
                ...metadata,
                members: updatedMembers,
                managers: updatedManagers,
              },
            })
            .eq('id', project.id)

          if (updateError) {
            console.error(`Error removing user from project ${project.id}:`, updateError)
            // Continue with other projects even if this fails
          }
        }
      }
    }

    // Step 4: Get all communities where user is a member or manager
    const { data: allCommunities, error: communitiesError } = await serviceClient
      .from('portfolios')
      .select('id, user_id, metadata')
      .eq('type', 'community')

    if (communitiesError) {
      console.error('Error fetching communities:', communitiesError)
      return {
        success: false,
        error: `Failed to fetch communities: ${communitiesError.message}`,
      }
    }

    // Step 5: Remove user from communities where they are a member or manager
    if (allCommunities) {
      for (const community of allCommunities) {
        const metadata = community.metadata as any
        const members = metadata?.members || []
        const managers = metadata?.managers || []
        const isCreator = community.user_id === userId
        const isMember = Array.isArray(members) && members.includes(userId)
        const isManager = Array.isArray(managers) && managers.includes(userId)

        if (isCreator) {
          // If user is creator, we need to transfer ownership or delete the community
          // For now, we'll transfer to the first manager, or delete if no managers
          const remainingManagers = Array.isArray(managers)
            ? managers.filter((id: string) => id !== userId)
            : []

          if (remainingManagers.length > 0) {
            // Transfer ownership to first manager
            const newCreatorId = remainingManagers[0]
            const updatedManagers = remainingManagers.filter((id: string) => id !== newCreatorId)
            const updatedMembers = Array.isArray(members)
              ? [...members.filter((id: string) => id !== userId), newCreatorId]
              : [newCreatorId]

            const { error: transferError } = await serviceClient
              .from('portfolios')
              .update({
                user_id: newCreatorId,
                metadata: {
                  ...metadata,
                  members: updatedMembers,
                  managers: updatedManagers,
                },
              })
              .eq('id', community.id)

            if (transferError) {
              console.error(`Error transferring community ${community.id} ownership:`, transferError)
              // Continue with other communities even if this fails
            }
          } else {
            // No managers, delete the community
            const { error: deleteCommunityError } = await serviceClient
              .from('portfolios')
              .delete()
              .eq('id', community.id)

            if (deleteCommunityError) {
              console.error(`Error deleting community ${community.id}:`, deleteCommunityError)
              // Continue with other communities even if this fails
            }
          }
        } else if (isMember || isManager) {
          // Remove user from members and/or managers
          const updatedMembers = Array.isArray(members)
            ? members.filter((id: string) => id !== userId)
            : []
          const updatedManagers = Array.isArray(managers)
            ? managers.filter((id: string) => id !== userId)
            : []

          const { error: updateError } = await serviceClient
            .from('portfolios')
            .update({
              metadata: {
                ...metadata,
                members: updatedMembers,
                managers: updatedManagers,
              },
            })
            .eq('id', community.id)

          if (updateError) {
            console.error(`Error removing user from community ${community.id}:`, updateError)
            // Continue with other communities even if this fails
          }
        }
      }
    }

    // Step 6: Delete user from auth (this will cascade delete notes, subscriptions, friends, messages, etc.)
    const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(userId)

    if (deleteUserError) {
      console.error('Error deleting user from auth:', deleteUserError)
      return {
        success: false,
        error: `Failed to delete user from auth: ${deleteUserError.message}`,
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Exception deleting user:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Block or unblock a user
 */
export async function blockUser(userId: string, block: boolean): Promise<BlockUserResult> {
  try {
    const { user: adminUser } = await requireAdmin()
    const serviceClient = createServiceClient()

    // Get current user metadata
    const { data: currentUser, error: getUserError } = await serviceClient.auth.admin.getUserById(userId)

    if (getUserError || !currentUser) {
      return {
        success: false,
        error: 'User not found',
      }
    }

    // Update user metadata
    const currentUserMetadata = currentUser.user.user_metadata || {}
    
    const updatedUserMetadata = {
      ...currentUserMetadata,
      is_blocked: block,
    }

    const { error: updateError } = await serviceClient.auth.admin.updateUserById(userId, {
      user_metadata: updatedUserMetadata,
      app_metadata: {
        ...(currentUser.user.app_metadata || {}),
      },
    })

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to update user',
      }
    }

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Approve or unapprove a user for posting.
 * This now controls approval via the human portfolio is_pseudo flag:
 * - approved   => at least one non-pseudo human portfolio (is_pseudo = false)
 * - unapproved => all human portfolios are pseudo (is_pseudo = true)
 */
export async function approveUser(userId: string, approve: boolean): Promise<ApproveUserResult> {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const serviceClient = createServiceClient()

    // Find the user's human portfolio (admin context, so pseudo portfolios are visible)
    const { data: humanPortfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, user_id, is_pseudo, metadata')
      .eq('type', 'human')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    if (portfolioError) {
      console.error('Error fetching human portfolio for approval:', portfolioError)
      return {
        success: false,
        error: portfolioError.message || 'Failed to load human portfolio for user',
      }
    }

    if (!humanPortfolio) {
      return {
        success: false,
        error:
          'No human portfolio found for this user. Create a human portfolio before changing approval status.',
      }
    }

    // Update is_pseudo based on approval:
    // - approve   => is_pseudo = false (real / verified)
    // - unapprove => is_pseudo = true  (pseudo / unverified)
    const nextIsPseudo = !approve

    // Use service client for admin operations to bypass RLS
    const { error: updatePortfolioError } = await serviceClient
      .from('portfolios')
      .update({ is_pseudo: nextIsPseudo })
      .eq('id', humanPortfolio.id)

    if (updatePortfolioError) {
      console.error('Error updating portfolio is_pseudo for approval:', updatePortfolioError)
      return {
        success: false,
        error: updatePortfolioError.message || 'Failed to update approval status on portfolio',
      }
    }

    // Optionally mirror approval status into portfolio metadata for client-side display
    try {
      const currentMetadata = (humanPortfolio.metadata || {}) as HumanPortfolioMetadata
      const metadataUpdates: Partial<HumanPortfolioMetadata> = {
        ...currentMetadata,
        // Keep is_approved in metadata for badges/search display; derived from is_pseudo.
        is_approved: approve,
      }

      await updateHumanPortfolioMetadataById(humanPortfolio.id, metadataUpdates)
    } catch (error) {
      console.error('Error updating human portfolio approval metadata:', error)
      // Non-fatal for core approval behavior
    }

    // Optionally keep auth.users metadata is_approved in sync for backward compatibility.
    try {
      const { data } = await serviceClient.auth.admin.getUserById(userId)
      const authUser = data?.user

      if (authUser) {
        const currentUserMetadata = authUser.user_metadata || {}
        const updatedUserMetadata = {
          ...currentUserMetadata,
          is_approved: approve,
        }

        const { error: updateAuthError } = await serviceClient.auth.admin.updateUserById(userId, {
          user_metadata: updatedUserMetadata,
          app_metadata: {
            ...(authUser.app_metadata || {}),
          },
        })

        if (updateAuthError) {
          console.error('Error updating auth user approval metadata:', updateAuthError)
        }
      }
    } catch (error) {
      console.error('Error syncing auth user approval metadata:', error)
    }

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Search users by name, email, or id
 */
export async function searchUsers(query: string): Promise<SearchUsersResult> {
  try {
    const { supabase } = await requireAdmin()
    const serviceClient = createServiceClient()

    if (!query || query.trim().length === 0) {
      return { success: true, users: [] }
    }

    const searchTerm = query.trim().toLowerCase()

    // Get all users
    const { data: authUsers } = await serviceClient.auth.admin.listUsers()

    // Get all human portfolios, including is_pseudo for verification status
    const { data: humanPortfolios } = await supabase
      .from('portfolios')
      .select('user_id, metadata, id, is_pseudo')
      .eq('type', 'human')

    const portfolioMap = new Map(
      (humanPortfolios || []).map((p) => [
        p.user_id,
        {
          id: p.id,
          metadata: p.metadata as any,
          is_pseudo: (p as any).is_pseudo as boolean | null | undefined,
        },
      ])
    )

    // Filter users by search term
    const matchingUsers = (authUsers.users || [])
      .filter((authUser) => {
        const email = authUser.email?.toLowerCase() || ''
        const userId = authUser.id.toLowerCase()
        const portfolio = portfolioMap.get(authUser.id)
        const metadata = portfolio?.metadata || {}
        const userMetadata = authUser.user_metadata || {}
        const name = (metadata.basic?.name || metadata.full_name || userMetadata.full_name || '').toLowerCase()
        const username = (metadata.username || userMetadata.username || '').toLowerCase()

        return (
          email.includes(searchTerm) ||
          userId.includes(searchTerm) ||
          name.includes(searchTerm) ||
          username.includes(searchTerm)
        )
      })
      .map((authUser) => {
        const portfolio = portfolioMap.get(authUser.id) as
          | { id: string; metadata: any; is_pseudo?: boolean | null }
          | undefined
        const metadata = portfolio?.metadata || {}
        const userMetadata = authUser.user_metadata || {}

        // A user is considered verified/approved if they have at least one non-pseudo human portfolio.
        const isApproved = portfolio ? portfolio.is_pseudo === false : false

        return {
          id: authUser.id,
          email: authUser.email || '',
          username: metadata.username || userMetadata.username || null,
          name: metadata.basic?.name || metadata.full_name || userMetadata.full_name || null,
          created_at: authUser.created_at,
          is_blocked: userMetadata.is_blocked === true,
          human_portfolio_id: portfolio?.id || null,
          is_approved: isApproved,
        }
      })

    return {
      success: true,
      users: matchingUsers,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Search notes by creator name, content, or id
 * If no query, fetch all notes paginated
 */
export async function searchNotes(
  query: string,
  page: number = 1,
  pageSize: number = 10
): Promise<SearchNotesResult> {
  try {
    const { supabase } = await requireAdmin()

    // Get all human portfolios to get creator names
    const { data: humanPortfolios } = await supabase
      .from('portfolios')
      .select('user_id, metadata')
      .eq('type', 'human')

    const userMap = new Map(
      (humanPortfolios || []).map((p) => [
        p.user_id,
        {
          name: (p.metadata as any)?.basic?.name || (p.metadata as any)?.full_name || null,
        },
      ])
    )

    // If no query, fetch all notes with pagination
    if (!query || query.trim().length === 0) {
      const { data: notes, error: notesError, count } = await supabase
        .from('notes')
        .select('id, text, owner_account_id, created_at, assigned_portfolios', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (notesError) {
        return {
          success: false,
          error: notesError.message || 'Failed to fetch notes',
        }
      }

      const formattedNotes = (notes || []).map((note) => ({
        id: note.id,
        text: note.text,
        owner_account_id: note.owner_account_id,
        owner_name: userMap.get(note.owner_account_id)?.name || null,
        created_at: note.created_at,
        assigned_portfolios: note.assigned_portfolios || [],
      }))

      const total = count || 0
      const totalPages = Math.ceil(total / pageSize)

      return {
        success: true,
        notes: formattedNotes,
        total,
        page,
        totalPages,
      }
    }

    // If query provided, search and then paginate
    const searchTerm = query.trim().toLowerCase()

    // Get all notes for filtering
    const { data: allNotes, error: notesError } = await supabase
      .from('notes')
      .select('id, text, owner_account_id, created_at, assigned_portfolios')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (notesError) {
      return {
        success: false,
        error: notesError.message || 'Failed to fetch notes',
      }
    }

    // Filter notes by search term
    const matchingNotes = (allNotes || [])
      .filter((note) => {
        const noteId = note.id.toLowerCase()
        const text = note.text.toLowerCase()
        const ownerName = userMap.get(note.owner_account_id)?.name?.toLowerCase() || ''

        return noteId.includes(searchTerm) || text.includes(searchTerm) || ownerName.includes(searchTerm)
      })
      .map((note) => ({
        id: note.id,
        text: note.text,
        owner_account_id: note.owner_account_id,
        owner_name: userMap.get(note.owner_account_id)?.name || null,
        created_at: note.created_at,
        assigned_portfolios: note.assigned_portfolios || [],
      }))

    // Paginate results
    const total = matchingNotes.length
    const totalPages = Math.ceil(total / pageSize)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const paginatedNotes = matchingNotes.slice(startIndex, endIndex)

    return {
      success: true,
      notes: paginatedNotes,
      total,
      page,
      totalPages,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Search portfolios (projects or communities) by creator name, name, or id
 * If no query, fetch all portfolios of the type paginated
 */
/**
 * Search portfolios in admin portal
 * Note: This function includes pseudo portfolios (is_pseudo = true) because:
 * - requireAdmin() ensures the user is authenticated as an admin
 * - RLS policies allow admins to see all portfolios including pseudo ones
 * - The is_current_user_admin() function in RLS checks the admin flag
 */
export async function searchPortfolios(
  type: 'projects' | 'community',
  query: string,
  page: number = 1,
  pageSize: number = 10
): Promise<SearchPortfoliosResult> {
  try {
    const { supabase } = await requireAdmin()

    // Get all human portfolios to get creator names
    const { data: humanPortfolios } = await supabase
      .from('portfolios')
      .select('user_id, metadata')
      .eq('type', 'human')

    const userMap = new Map(
      (humanPortfolios || []).map((p) => [
        p.user_id,
        {
          name: (p.metadata as any)?.basic?.name || (p.metadata as any)?.full_name || null,
        },
      ])
    )

    // If no query, fetch all portfolios with pagination
    if (!query || query.trim().length === 0) {
      const { data: portfolios, error: portfoliosError, count } = await supabase
        .from('portfolios')
        .select('id, type, user_id, created_at, metadata', { count: 'exact' })
        .eq('type', type)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (portfoliosError) {
        return {
          success: false,
          error: portfoliosError.message || 'Failed to fetch portfolios',
        }
      }

      const formattedPortfolios = (portfolios || []).map((portfolio) => {
        const metadata = portfolio.metadata as any
        const members = metadata?.members || []
        const membersCount = Array.isArray(members) ? members.length : 0

        return {
          id: portfolio.id,
          type: portfolio.type,
          name: metadata?.basic?.name || 'Unnamed',
          description: metadata?.basic?.description || null,
          user_id: portfolio.user_id,
          creator_name: userMap.get(portfolio.user_id)?.name || null,
          created_at: portfolio.created_at,
          members_count: membersCount,
        }
      })

      const total = count || 0
      const totalPages = Math.ceil(total / pageSize)

      return {
        success: true,
        portfolios: formattedPortfolios,
        total,
        page,
        totalPages,
      }
    }

    // If query provided, search and then paginate
    const searchTerm = query.trim().toLowerCase()

    // Get all portfolios of the specified type for filtering
    const { data: allPortfolios, error: portfoliosError } = await supabase
      .from('portfolios')
      .select('id, type, user_id, created_at, metadata')
      .eq('type', type)
      .order('created_at', { ascending: false })

    if (portfoliosError) {
      return {
        success: false,
        error: portfoliosError.message || 'Failed to fetch portfolios',
      }
    }

    // Filter portfolios by search term
    const matchingPortfolios = (allPortfolios || [])
      .filter((portfolio) => {
        const portfolioId = portfolio.id.toLowerCase()
        const metadata = portfolio.metadata as any
        const name = (metadata?.basic?.name || '').toLowerCase()
        const description = (metadata?.basic?.description || '').toLowerCase()
        const creatorName = userMap.get(portfolio.user_id)?.name?.toLowerCase() || ''

        return (
          portfolioId.includes(searchTerm) ||
          name.includes(searchTerm) ||
          description.includes(searchTerm) ||
          creatorName.includes(searchTerm)
        )
      })
      .map((portfolio) => {
        const metadata = portfolio.metadata as any
        const members = metadata?.members || []
        const membersCount = Array.isArray(members) ? members.length : 0

        return {
          id: portfolio.id,
          type: portfolio.type,
          name: metadata?.basic?.name || 'Unnamed',
          description: metadata?.basic?.description || null,
          user_id: portfolio.user_id,
          creator_name: userMap.get(portfolio.user_id)?.name || null,
          created_at: portfolio.created_at,
          members_count: membersCount,
        }
      })

    // Paginate results
    const total = matchingPortfolios.length
    const totalPages = Math.ceil(total / pageSize)
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    const paginatedPortfolios = matchingPortfolios.slice(startIndex, endIndex)

    return {
      success: true,
      portfolios: paginatedPortfolios,
      total,
      page,
      totalPages,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Delete a note (soft delete)
 */
export async function deleteNote(noteId: string): Promise<DeleteNoteResult> {
  try {
    await requireAdmin()
    const serviceClient = createServiceClient()

    // Use service client to bypass RLS for admin operations
    const { error } = await serviceClient
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', noteId)

    if (error) {
      console.error('Error deleting note:', error)
      return {
        success: false,
        error: error.message || 'Failed to delete note',
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Exception deleting note:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Delete a portfolio
 */
export async function deletePortfolio(portfolioId: string): Promise<DeletePortfolioResult> {
  try {
    await requireAdmin()
    const serviceClient = createServiceClient()

    // Check portfolio type and get user_id - don't allow deleting human portfolios
    const { data: portfolio, error: fetchError } = await serviceClient
      .from('portfolios')
      .select('type, user_id')
      .eq('id', portfolioId)
      .single()

    if (fetchError || !portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    if (portfolio.type === 'human') {
      return {
        success: false,
        error: 'Human portfolios cannot be deleted',
      }
    }

    // Delete portfolio (cascade will handle related data)
    // Use service client to bypass RLS for admin operations
    const { error: deleteError } = await serviceClient
      .from('portfolios')
      .delete()
      .eq('id', portfolioId)

    if (deleteError) {
      console.error('Error deleting portfolio:', deleteError)
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

    return { success: true }
  } catch (error: any) {
    console.error('Exception deleting portfolio:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Create or update human portfolio with associated projects
 * If human portfolio exists for email, updates it; otherwise creates new one
 */
export async function createHumanPortfolioWithProjects(
  data: CreateHumanPortfolioInput
): Promise<CreateHumanPortfolioResult> {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const serviceClient = createServiceClient()

    // Validate input
    if (!data.name || !data.name.trim()) {
      return {
        success: false,
        error: 'Name is required',
      }
    }

    if (!data.email || !data.email.trim()) {
      return {
        success: false,
        error: 'Email is required',
      }
    }

    const email = data.email.toLowerCase().trim()
    const name = data.name.trim()
    const isPseudoFromInput = data.is_pseudo !== false // Default to true for new records
    const joinedCommunity = data.joined_community?.trim()

    // Find or create human portfolio
    let humanPortfolio: Awaited<ReturnType<typeof findOrCreateHumanPortfolioForEmail>>['portfolio']
    let isNewPortfolio: boolean

    try {
      const result = await findOrCreateHumanPortfolioForEmail(email, name)
      humanPortfolio = result.portfolio
      isNewPortfolio = result.isNew
    } catch (error: any) {
      // Error should not occur now since we create users automatically
      return {
        success: false,
        error: error.message || 'Failed to find or create human portfolio',
      }
    }

    // Prepare metadata updates
    const metadataUpdates: Partial<HumanPortfolioMetadata> = {}

    // Update basic metadata (name and description)
    metadataUpdates.basic = {
      ...humanPortfolio.metadata.basic,
      name,
    }
    if (data.description !== undefined) {
      metadataUpdates.basic.description = data.description
    }

    // Update joined_community if provided
    if (joinedCommunity) {
      metadataUpdates.joined_community = joinedCommunity
    }

    // Update properties if provided and not empty
    if (data.properties && Object.keys(data.properties).length > 0) {
      metadataUpdates.properties = {
        ...(humanPortfolio.metadata.properties || {}),
        ...data.properties,
      }
    }

    // Determine target pseudo status:
    // - For NEW human portfolios: use the input (typically pseudo = true for form submissions).
    // - For EXISTING human portfolios: NEVER override existing is_pseudo here.
    const currentIsPseudo =
      (humanPortfolio as any).is_pseudo !== undefined ? (humanPortfolio as any).is_pseudo : false
    const targetIsPseudo = isNewPortfolio ? isPseudoFromInput : currentIsPseudo

    // Mirror approval status in portfolio metadata for client-side display
    ;(metadataUpdates as any).is_approved = !targetIsPseudo

    // Only set is_pseudo when we're creating a brand-new human portfolio.
    if (isNewPortfolio) {
      // Use service client for admin operations to bypass RLS
      const { error: updatePseudoError } = await serviceClient
        .from('portfolios')
        .update({ is_pseudo: targetIsPseudo })
        .eq('id', humanPortfolio.id)

      if (updatePseudoError) {
        console.error('Error updating is_pseudo for new human portfolio:', updatePseudoError)
      }

      // For new portfolios, keep auth.users metadata roughly in sync so existing
      // UI that reads user_metadata.is_approved still behaves as expected.
      try {
        const shouldBeApproved = !targetIsPseudo
        const { data } = await serviceClient.auth.admin.getUserById(
          humanPortfolio.user_id
        )
        const authUser = data?.user

        if (authUser) {
          const currentMetadata = authUser.user_metadata || {}
          await serviceClient.auth.admin.updateUserById(humanPortfolio.user_id, {
            user_metadata: {
              ...currentMetadata,
              is_approved: shouldBeApproved,
            },
          })
        }
      } catch (error) {
        console.error('Error updating user approval status for new portfolio:', error)
      }
    }

    // Update metadata if there are changes
    const descriptionChanged = data.description !== undefined
    if (Object.keys(metadataUpdates).length > 0) {
      await updateHumanPortfolioMetadataById(humanPortfolio.id, metadataUpdates)
      // Refresh portfolio data
      const { data: updated } = await supabase
        .from('portfolios')
        .select('*')
        .eq('id', humanPortfolio.id)
        .single()
      if (updated) {
        humanPortfolio = updated as typeof humanPortfolio
      }
    }

    // Trigger background human description processing if description was provided (fire-and-forget)
    if (descriptionChanged && data.description) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        fetch(`${baseUrl}/api/index-human-description`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            portfolioId: humanPortfolio.id,
            userId: humanPortfolio.user_id,
            description: data.description,
          }),
        }).catch((error) => {
          console.error('Failed to trigger human description processing:', error)
        })
      } catch (error) {
        console.error('Error triggering human description processing:', error)
      }
    }

    // Get existing owned_projects to preserve them
    const existingMetadata = humanPortfolio.metadata as HumanPortfolioMetadata
    const existingOwnedProjects = existingMetadata.owned_projects || []
    const newProjectIds: string[] = []

    // Process each project (if any)
    const projectsToProcess = data.projects || []
    for (const projectData of projectsToProcess) {
      // Validate project data
      if (!projectData.name || !projectData.name.trim()) {
        continue // Skip invalid projects
      }

      // Project types are optional - allow projects without types

      // Process members if provided
      const membersToProcess = projectData.members || []

      // Validate member roles (max 2 words)
      const invalidRole = membersToProcess.find((m) => {
        if (!m.role) return false
        const words = m.role.trim().split(/\s+/)
        return words.length > 2
      })

      if (invalidRole) {
        continue // Skip project with invalid role
      }

      // Generate slug for project
      const baseSlug = generateSlug(projectData.name)
      let slug = baseSlug
      let slugCounter = 1

      // Ensure slug is unique for projects type
      while (true) {
        const { data: existing } = await supabase
          .from('portfolios')
          .select('id')
          .eq('type', 'projects')
          .eq('slug', slug)
          .maybeSingle()

        if (!existing) {
          break
        }

        slug = `${baseSlug}-${slugCounter}`
        slugCounter++
      }

      // Process members - resolve user IDs
      const memberUserIds: string[] = []
      const memberRoles: { [userId: string]: string } = {}

      // Add the human portfolio owner as creator/manager
      memberUserIds.push(humanPortfolio.user_id)
      memberRoles[humanPortfolio.user_id] = 'Creator'

      // Process each member
      for (const member of membersToProcess) {
        if (!member.name || !member.name.trim()) {
          continue // Skip invalid members
        }

        if (member.email) {
          // Try to find user by email
          let memberUserId = await findUserByEmail(member.email.toLowerCase().trim())

          if (memberUserId) {
            // User exists - add to members
            if (!memberUserIds.includes(memberUserId)) {
              memberUserIds.push(memberUserId)
            }
            // Set role if provided
            if (member.role) {
              memberRoles[memberUserId] = member.role.trim()
            }
          } else {
            // User doesn't exist - create user account and placeholder human portfolio
            try {
              // Use findOrCreateHumanPortfolioForEmail to avoid duplicate key errors
              // This handles the case where a user is created and a trigger automatically creates a portfolio
              const { portfolio: memberPortfolio } = await findOrCreateHumanPortfolioForEmail(
                member.email.toLowerCase().trim(),
                member.name.trim()
              )
              
              memberUserId = memberPortfolio.user_id
              
              // Update pseudo status if needed
              const memberIsPseudo = member.is_pseudo !== false
              const currentIsPseudo = memberPortfolio.is_pseudo ?? false
              if (currentIsPseudo !== memberIsPseudo) {
                // Use service client for admin operations to bypass RLS
                await serviceClient
                  .from('portfolios')
                  .update({ is_pseudo: memberIsPseudo })
                  .eq('id', memberPortfolio.id)
              }
              
              // Add to members
              if (!memberUserIds.includes(memberUserId)) {
                memberUserIds.push(memberUserId)
              }
              if (member.role) {
                memberRoles[memberUserId] = member.role.trim()
              }
            } catch (error: any) {
              console.error(`Error creating placeholder for ${member.email}:`, error)
              // Continue with other members even if one fails
            }
          }
        } else {
          // No email - store as information holder in metadata
          // We'll store this in a separate field in project metadata
          // For now, skip members without emails (they can't be added to members array)
          console.warn(`Skipping member ${member.name} - no email provided`)
        }
      }

      // Create project portfolio
      const projectMetadata: ProjectPortfolioMetadata = {
        basic: {
          name: projectData.name.trim(),
          description: projectData.description || '',
          avatar: '',
        },
        pinned: [],
        settings: {},
        members: memberUserIds,
        managers: [humanPortfolio.user_id], // Creator is manager
        ...(projectData.project_type_general && projectData.project_type_specific ? {
          project_type_general: projectData.project_type_general,
          project_type_specific: projectData.project_type_specific,
        } : {}),
        memberRoles,
      }

      // Add properties if provided
      if (projectData.properties) {
        projectMetadata.properties = {
          goals: projectData.properties.goals,
          timelines: projectData.properties.timelines,
          asks: projectData.properties.asks && projectData.properties.asks.length > 0
            ? projectData.properties.asks
            : undefined,
        }
      }

      const projectIsPseudo = projectData.is_pseudo !== false // Default to true

      const { data: projectPortfolio, error: projectError } = await supabase
        .from('portfolios')
        .insert({
          type: 'projects',
          slug,
          user_id: humanPortfolio.user_id,
          is_pseudo: projectIsPseudo,
          metadata: projectMetadata,
        })
        .select()
        .single()

      if (projectError || !projectPortfolio) {
        console.error('Error creating project:', projectError)
        continue // Skip this project and continue with next
      }

      // Trigger background property processing for project (fire-and-forget)
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        
        // Process project description if it exists
        if (projectData.description) {
          fetch(`${baseUrl}/api/index-project-description`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              portfolioId: projectPortfolio.id,
              userId: humanPortfolio.user_id,
              description: projectData.description,
            }),
          }).catch((error) => {
            console.error('Failed to trigger project description processing:', error)
          })
        }

        // Process project properties
        // For goals and asks, process even if empty to allow AI inference based on project context
        if (projectData.properties) {
          // Process goals (process even if empty to allow inference)
          fetch(`${baseUrl}/api/index-project-property`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              portfolioId: projectPortfolio.id,
              userId: humanPortfolio.user_id,
              propertyName: 'goals',
              propertyValue: projectData.properties.goals || '',
            }),
          }).catch((error) => {
            console.error('Failed to trigger goals processing:', error)
          })

          // Process timelines (only if exists)
          if (projectData.properties.timelines) {
            fetch(`${baseUrl}/api/index-project-property`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                portfolioId: projectPortfolio.id,
                userId: humanPortfolio.user_id,
                propertyName: 'timelines',
                propertyValue: projectData.properties.timelines,
              }),
            }).catch((error) => {
              console.error('Failed to trigger timelines processing:', error)
            })
          }

          // Process asks (process even if empty to allow inference)
          const asksText = projectData.properties.asks && projectData.properties.asks.length > 0
            ? projectData.properties.asks
                .map((ask) => `${ask.title}: ${ask.description}`)
                .join('\n\n')
            : ''
          fetch(`${baseUrl}/api/index-project-property`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              portfolioId: projectPortfolio.id,
              userId: humanPortfolio.user_id,
              propertyName: 'asks',
              propertyValue: asksText,
            }),
          }).catch((error) => {
            console.error('Failed to trigger asks processing:', error)
          })
        } else {
          // Even if no properties object exists, process empty goals and asks for inference
          // Process empty goals
          fetch(`${baseUrl}/api/index-project-property`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              portfolioId: projectPortfolio.id,
              userId: humanPortfolio.user_id,
              propertyName: 'goals',
              propertyValue: '',
            }),
          }).catch((error) => {
            console.error('Failed to trigger goals processing:', error)
          })

          // Process empty asks
          fetch(`${baseUrl}/api/index-project-property`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              portfolioId: projectPortfolio.id,
              userId: humanPortfolio.user_id,
              propertyName: 'asks',
              propertyValue: '',
            }),
          }).catch((error) => {
            console.error('Failed to trigger asks processing:', error)
          })
        }
      } catch (error) {
        console.error('Error triggering project property processing:', error)
      }

      // Add project to main human portfolio's owned_projects list (append, preserve existing)
      newProjectIds.push(projectPortfolio.id)

      // Add project to each member's human portfolio's owned_projects list
      for (const memberUserId of memberUserIds) {
        try {
          // Get member's human portfolio
          const { data: memberPortfolio } = await supabase
            .from('portfolios')
            .select('id')
            .eq('type', 'human')
            .eq('user_id', memberUserId)
            .maybeSingle()

          if (memberPortfolio) {
            // Add project to member's owned_projects
            await addProjectToOwnedListById(memberPortfolio.id, projectPortfolio.id)
          }
        } catch (error: any) {
          // Log error but continue with other members
          console.error(`Error adding project to member ${memberUserId}'s owned_projects:`, error)
        }
      }
    }

    // Update owned_projects array - append new projects, preserve existing
    if (newProjectIds.length > 0) {
      const updatedOwnedProjects = [...newProjectIds, ...existingOwnedProjects.filter((id) => !newProjectIds.includes(id))]
      
      await updateHumanPortfolioMetadataById(humanPortfolio.id, {
        owned_projects: updatedOwnedProjects,
      })
    }

    return {
      success: true,
      portfolioId: humanPortfolio.id,
    }
  } catch (error: any) {
    console.error('Exception creating human portfolio with projects:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Reprocess an approved form submission
 * This will:
 * 1. Clean up the account (delete pseudo projects and human portfolio)
 * 2. Remove from communities
 * 3. Clean up all relevant atomic knowledge
 * 4. Reduce topic counts
 * 5. Reset form status to pending
 */
export interface ReprocessFormResult {
  success: boolean
  error?: string
}

export async function reprocessApprovedForm(
  formId: string
): Promise<ReprocessFormResult> {
  try {
    await requireAdmin()
    const serviceClient = createServiceClient()
    const supabase = await createClient()

    // Step 1: Get the form submission
    const { data: submission, error: fetchError } = await serviceClient
      .from('public_upload_forms')
      .select('*')
      .eq('id', formId)
      .single()

    if (fetchError || !submission) {
      return {
        success: false,
        error: 'Form submission not found',
      }
    }

    if (submission.status !== 'approved') {
      return {
        success: false,
        error: 'Can only reprocess approved forms',
      }
    }

    const email = submission.submission_data.email?.toLowerCase().trim()
    if (!email) {
      return {
        success: false,
        error: 'Email not found in submission data',
      }
    }

    // Step 2: Find the user and human portfolio by email
    const humanPortfolio = await findHumanPortfolioByEmail(email)
    if (!humanPortfolio) {
      // No portfolio exists, just reset the form status
      const { error: updateError } = await serviceClient
        .from('public_upload_forms')
        .update({
          status: 'pending',
          approved_at: null,
          approved_by: null,
          processed_at: null,
        })
        .eq('id', formId)

      if (updateError) {
        return {
          success: false,
          error: `Failed to reset form status: ${updateError.message}`,
        }
      }

      return { success: true }
    }

    const userId = humanPortfolio.user_id

    // Step 3: Get all pseudo projects owned by this user
    const { data: pseudoProjects, error: projectsError } = await serviceClient
      .from('portfolios')
      .select('id, metadata')
      .eq('type', 'projects')
      .eq('user_id', userId)
      .eq('is_pseudo', true)

    if (projectsError) {
      console.error('Error fetching pseudo projects:', projectsError)
    }

    const projectIds: string[] = []
    if (pseudoProjects && pseudoProjects.length > 0) {
      projectIds.push(...pseudoProjects.map((p) => p.id))

      // Remove projects from member portfolios' owned_projects lists
      for (const project of pseudoProjects) {
        const projectMetadata = project.metadata as any
        const members = projectMetadata?.members || []
        const allMembers = Array.isArray(members) ? members : []

        for (const memberId of allMembers) {
          try {
            const { removeProjectFromOwnedListById } = await import('@/lib/portfolio/admin-helpers')
            await removeProjectFromOwnedListById(memberId, project.id)
          } catch (error) {
            console.error(`Failed to remove project ${project.id} from member ${memberId}:`, error)
          }
        }
      }

      // Delete all pseudo projects
      if (projectIds.length > 0) {
        const { error: deleteProjectsError } = await serviceClient
          .from('portfolios')
          .delete()
          .in('id', projectIds)

        if (deleteProjectsError) {
          console.error('Error deleting pseudo projects:', deleteProjectsError)
        }
      }
    }

    // Step 4: Collect all portfolio IDs (human + projects) for cleanup
    const allPortfolioIds = [humanPortfolio.id, ...projectIds]

    // Step 5: Get all atomic knowledge entries for these portfolios
    // We'll query for each portfolio ID separately and combine results
    let atomicKnowledgeEntries: any[] = []
    for (const portfolioId of allPortfolioIds) {
      const { data: entries, error: fetchError } = await serviceClient
        .from('atomic_knowledge')
        .select('id, topics, source_info')
        .eq('source_info->>source_id', portfolioId)

      if (fetchError) {
        console.error(`Error fetching atomic knowledge for portfolio ${portfolioId}:`, fetchError)
      } else if (entries) {
        atomicKnowledgeEntries.push(...entries)
      }
    }

    // Step 6: Collect all unique topic IDs from atomic knowledge entries
    const topicIdsSet = new Set<string>()
    if (atomicKnowledgeEntries) {
      for (const entry of atomicKnowledgeEntries) {
        if (entry.topics && Array.isArray(entry.topics)) {
          entry.topics.forEach((topicId: string) => topicIdsSet.add(topicId))
        }
      }
    }

    // Step 7: Delete atomic knowledge entries for these portfolios
    if (allPortfolioIds.length > 0) {
      // Delete by source_id matching any of our portfolio IDs
      for (const portfolioId of allPortfolioIds) {
        const { error: deleteAkError } = await serviceClient
          .from('atomic_knowledge')
          .delete()
          .eq('source_info->>source_id', portfolioId)

        if (deleteAkError) {
          console.error(`Error deleting atomic knowledge for portfolio ${portfolioId}:`, deleteAkError)
        }
      }
    }

    // Step 8: Decrement topic mention counts
    const topicIds = Array.from(topicIdsSet)
    if (topicIds.length > 0) {
      try {
        const { error: decrementError } = await serviceClient.rpc('decrement_topic_mention_counts', {
          topic_ids: topicIds,
        })

        if (decrementError) {
          console.error('Error decrementing topic counts:', decrementError)
        }
      } catch (error) {
        console.error('Error calling decrement_topic_mention_counts:', error)
      }
    }

    // Step 9: Remove user from communities (if human portfolio is pseudo)
    if (humanPortfolio.is_pseudo) {
      const { data: allCommunities, error: communitiesError } = await serviceClient
        .from('portfolios')
        .select('id, metadata')
        .eq('type', 'community')

      if (!communitiesError && allCommunities) {
        for (const community of allCommunities) {
          const metadata = community.metadata as any
          const members = metadata?.members || []
          const managers = metadata?.managers || []
          const isMember = Array.isArray(members) && members.includes(userId)
          const isManager = Array.isArray(managers) && managers.includes(userId)

          if (isMember || isManager) {
            const updatedMembers = Array.isArray(members)
              ? members.filter((id: string) => id !== userId)
              : []
            const updatedManagers = Array.isArray(managers)
              ? managers.filter((id: string) => id !== userId)
              : []

            const { error: updateError } = await serviceClient
              .from('portfolios')
              .update({
                metadata: {
                  ...metadata,
                  members: updatedMembers,
                  managers: updatedManagers,
                },
              })
              .eq('id', community.id)

            if (updateError) {
              console.error(`Error removing user from community ${community.id}:`, updateError)
            }
          }
        }
      }
    }

    // Step 10: Delete pseudo human portfolio
    if (humanPortfolio.is_pseudo) {
      const { error: deleteHumanError } = await serviceClient
        .from('portfolios')
        .delete()
        .eq('id', humanPortfolio.id)

      if (deleteHumanError) {
        console.error('Error deleting human portfolio:', deleteHumanError)
        return {
          success: false,
          error: `Failed to delete human portfolio: ${deleteHumanError.message}`,
        }
      }
    }

    // Step 11: Reset form status to pending
    const { error: updateError } = await serviceClient
      .from('public_upload_forms')
      .update({
        status: 'pending',
        approved_at: null,
        approved_by: null,
        processed_at: null,
      })
      .eq('id', formId)

    if (updateError) {
      return {
        success: false,
        error: `Failed to reset form status: ${updateError.message}`,
      }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Exception reprocessing approved form:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

// Admin demo anonymization preference (stored in current user's user_metadata)
interface GetAdminDemoPreferenceResult {
  success: boolean
  enabled?: boolean
  error?: string
}

/**
 * Get the current admin's demo anonymization preference for the match console.
 * Stored in auth user_metadata.admin_demo_anonymization.
 */
export async function getAdminDemoPreference(): Promise<GetAdminDemoPreferenceResult> {
  try {
    const { user } = await requireAdmin()
    const enabled = user?.user_metadata?.admin_demo_anonymization === true
    return { success: true, enabled: !!enabled }
  } catch (error: any) {
    return {
      success: false,
      enabled: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

interface SetAdminDemoPreferenceResult {
  success: boolean
  error?: string
}

/**
 * Set the current admin's demo anonymization preference for the match console.
 * Persists in auth user_metadata.admin_demo_anonymization.
 */
export async function setAdminDemoPreference(enabled: boolean): Promise<SetAdminDemoPreferenceResult> {
  try {
    const { user } = await requireAdmin()
    const serviceClient = createServiceClient()
    const currentMetadata = user?.user_metadata || {}
    const { error } = await serviceClient.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...currentMetadata,
        admin_demo_anonymization: enabled,
      },
    })
    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

// Match console actions
interface GetMatchDataResult {
  success: boolean
  user?: {
    id: string
    email: string
    username: string | null
    name: string | null
    created_at: string
    is_blocked: boolean
    human_portfolio_id: string | null
  }
  humanPortfolio?: {
    id: string
    metadata: any
    created_at: string
    updated_at: string
  }
  projects?: Array<{
    id: string
    name: string
    metadata: any
    created_at: string
    updated_at: string
    user_id: string
  }>
  notes?: Array<{
    id: string
    text: string
    created_at: string
    assigned_portfolios: string[]
  }>
  error?: string
}

/**
 * Get match console data for a user
 */
export async function getMatchData(userId: string): Promise<GetMatchDataResult> {
  try {
    const { user, supabase } = await requireAdmin()
    const serviceClient = createServiceClient()

    // Get user data from Auth Admin API (not from a users table)
    const { data: authUserData, error: userError } = await serviceClient.auth.admin.getUserById(userId)

    if (userError || !authUserData?.user) {
      return {
        success: false,
        error: 'User not found',
      }
    }

    const userData = authUserData.user
    const userMetadata = userData.user_metadata || {}
    const isBlocked = userMetadata.is_blocked === true

    // Get human portfolio (using serviceClient to bypass RLS and access pseudo portfolios)
    // serviceClient uses service role key which bypasses all RLS policies
    const { data: humanPortfolio, error: portfolioError } = await serviceClient
      .from('portfolios')
      .select('id, metadata, created_at, updated_at, is_pseudo')
      .eq('user_id', userId)
      .eq('type', 'human')
      .maybeSingle()

    if (portfolioError) {
      console.error('Error fetching human portfolio:', portfolioError)
    }

    // Get all projects where user is owner or member
    // Using serviceClient to bypass RLS and access pseudo portfolios
    // serviceClient uses service role key which bypasses all RLS policies
    const { data: allProjects, error: projectsError } = await serviceClient
      .from('portfolios')
      .select('id, metadata, created_at, updated_at, user_id, is_pseudo')
      .eq('type', 'projects')

    if (projectsError) {
      console.error('Error fetching projects:', projectsError)
    }

    const userProjects = (allProjects || []).filter((p: any) => {
      const metadata = p.metadata as any
      const managers = metadata?.managers || []
      const members = metadata?.members || []
      return p.user_id === userId || 
             (Array.isArray(managers) && managers.includes(userId)) ||
             (Array.isArray(members) && members.includes(userId))
    }).map((p: any) => {
      const metadata = p.metadata as any
      const basic = metadata?.basic || {}
      return {
        id: p.id,
        name: basic.name || 'Unnamed Project',
        metadata: p.metadata,
        created_at: p.created_at,
        updated_at: p.updated_at,
        user_id: p.user_id,
      }
    })

    // Get user's notes (using serviceClient to bypass RLS)
    // serviceClient uses service role key which bypasses all RLS policies
    const { data: notes, error: notesError } = await serviceClient
      .from('notes')
      .select('id, text, created_at, assigned_portfolios')
      .eq('owner_account_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (notesError) {
      console.error('Error fetching notes:', notesError)
    }

    return {
      success: true,
      user: {
        id: userData.id,
        email: userData.email || '',
        username: userMetadata.username || null,
        name: userMetadata.name || userMetadata.full_name || null,
        created_at: userData.created_at || new Date().toISOString(),
        is_blocked: isBlocked,
        human_portfolio_id: humanPortfolio?.id || null,
      },
      humanPortfolio: humanPortfolio || undefined,
      projects: userProjects || [],
      notes: (notes || []).map((n: any) => ({
        id: n.id,
        text: n.text,
        created_at: n.created_at,
        assigned_portfolios: n.assigned_portfolios || [],
      })),
    }
  } catch (error: any) {
    console.error('Exception getting match data:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

// Match search actions
interface SearchMatchesResult {
  success: boolean
  matches?: Array<{
    userId: string
    email: string
    username: string | null
    name: string | null
    score: number
    description: string | null
  }>
  matchDetails?: {
    forwardDetails: Record<
      string,
      Array<{
        searchingAsk: string
        searchingAskId: string
        maxSimilarity: number
        matchedKnowledgeText: string
        matchedKnowledgeId: string
      }>
    >
    backwardDetails: Record<
      string,
      Array<{
        searchingNonAsk: string
        searchingNonAskId: string
        maxSimilarity: number
        matchedAskText: string
        matchedKnowledgeId: string
      }>
    >
    topicDetails?: Record<
      string,
      Array<{
        searcherTopicId: string
        searcherTopicName: string
        targetTopicId: string
        targetTopicName: string
        similarity: number
        multiplier: number
      }>
    >
  }
  specificDetails?: Record<
    string,
    Array<{
      searchingAsk: string
      maxSimilarity: number
      matchedKnowledgeText: string
    }>
  >
  error?: string
}

/**
 * Search for matching users based on atomic knowledge vectors
 */
export async function searchMatches(userId: string, searchKeyword?: string): Promise<SearchMatchesResult> {
  try {
    await requireAdmin()
    const serviceClient = createServiceClient()

    const {
      performMatchSearch,
      performSpecificSearch,
      combineSearchScores,
    } = await import('@/lib/indexing/match-search')

    let finalScores: Map<string, number>
    let matchResult: Awaited<ReturnType<typeof performMatchSearch>>
    let specificResult: Awaited<ReturnType<typeof performSpecificSearch>> | undefined

    if (searchKeyword && searchKeyword.trim().length > 0) {
      // Specific search: generate asks from keyword
      specificResult = await performSpecificSearch(userId, searchKeyword.trim())
      // Also perform match search for combined ranking
      matchResult = await performMatchSearch(userId)
      // Combine: 80% specific + 20% match
      finalScores = combineSearchScores(specificResult.scores, matchResult.scores)
    } else {
      // Match search: use all user's asks (forward + backward)
      matchResult = await performMatchSearch(userId)
      finalScores = matchResult.scores
    }

    if (finalScores.size === 0) {
      return {
        success: true,
        matches: [],
      }
    }

    // Sort by score (descending) and get top 50
    const sortedUserIds = Array.from(finalScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([userId]) => userId)

    // Fetch user data for matched users
    const { data: authUsers, error: usersError } = await serviceClient.auth.admin.listUsers()

    if (usersError) {
      return {
        success: false,
        error: `Failed to fetch users: ${usersError.message}`,
      }
    }

    // Build user map
    const userMap = new Map(
      (authUsers.users || []).map((user) => [
        user.id,
        {
          email: user.email || '',
          username: user.user_metadata?.username || null,
          name: user.user_metadata?.name || user.user_metadata?.full_name || null,
        },
      ])
    )

    // Fetch human portfolios for matched users to get descriptions
    const { data: humanPortfolios, error: portfoliosError } = await serviceClient
      .from('portfolios')
      .select('user_id, metadata')
      .eq('type', 'human')
      .in('user_id', sortedUserIds)

    if (portfoliosError) {
      console.error('Error fetching human portfolios for descriptions:', portfoliosError)
    }

    // Build portfolio map
    const portfolioMap = new Map(
      (humanPortfolios || []).map((portfolio: any) => {
        const metadata = portfolio.metadata || {}
        const basic = metadata.basic || {}
        return [
          portfolio.user_id,
          basic.description || null,
        ]
      })
    )

    // Build results
    const matches = sortedUserIds
      .map((matchedUserId) => {
        const userInfo = userMap.get(matchedUserId)
        if (!userInfo) return null

        const score = finalScores.get(matchedUserId) || 0
        const description = portfolioMap.get(matchedUserId) || null
        return {
          userId: matchedUserId,
          email: userInfo.email,
          username: userInfo.username,
          name: userInfo.name,
          score,
          description,
        }
      })
      .filter((match): match is NonNullable<typeof match> => match !== null)

    // Convert Maps to plain objects for serialization
    const forwardDetailsObj: Record<
      string,
      Array<{
        searchingAsk: string
        searchingAskId: string
        maxSimilarity: number
        matchedKnowledgeText: string
        matchedKnowledgeId: string
      }>
    > = {}
    matchResult.forwardDetails.forEach((details, userId) => {
      forwardDetailsObj[userId] = details
    })

    const backwardDetailsObj: Record<
      string,
      Array<{
        searchingNonAsk: string
        searchingNonAskId: string
        maxSimilarity: number
        matchedAskText: string
        matchedKnowledgeId: string
      }>
    > = {}
    matchResult.backwardDetails.forEach((details, userId) => {
      backwardDetailsObj[userId] = details
    })

    const specificDetailsObj: Record<
      string,
      Array<{
        searchingAsk: string
        maxSimilarity: number
        matchedKnowledgeText: string
      }>
    > | undefined = specificResult?.details
      ? (() => {
          const obj: Record<
            string,
            Array<{
              searchingAsk: string
              maxSimilarity: number
              matchedKnowledgeText: string
            }>
          > = {}
          specificResult.details.forEach((details, userId) => {
            obj[userId] = details
          })
          return obj
        })()
      : undefined

    // Convert topic details Map to plain object for serialization
    const topicDetailsObj: Record<
      string,
      Array<{
        searcherTopicId: string
        searcherTopicName: string
        targetTopicId: string
        targetTopicName: string
        similarity: number
        multiplier: number
      }>
    > = {}
    matchResult.topicDetails.forEach((details, userId) => {
      topicDetailsObj[userId] = details
    })

    return {
      success: true,
      matches,
      matchDetails: {
        forwardDetails: forwardDetailsObj,
        backwardDetails: backwardDetailsObj,
        topicDetails: topicDetailsObj,
      },
      specificDetails: specificDetailsObj,
    }
  } catch (error: any) {
    console.error('Exception searching matches:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

interface MatchActivitySuggestion {
  title: string
  description: string
}

interface SubjectMatchAnalysis {
  subjectName: string
  otherPersonName: string
  paragraph: string
  activities: MatchActivitySuggestion[]
}

interface MatchExplanationPayload {
  matcher: SubjectMatchAnalysis
  matchee: SubjectMatchAnalysis
}

interface MatchExplanationResult {
  success: boolean
  explanation?: MatchExplanationPayload
  error?: string
}

/**
 * Generate AI explanation for why two users are a good match
 */
export async function getMatchExplanation(
  searcherId: string,
  targetId: string,
  specificAsks?: string[]
): Promise<MatchExplanationResult> {
  try {
    const { user: adminUser } = await requireAdmin()
    const serviceClient = createServiceClient()
    const demoEnabled = adminUser?.user_metadata?.admin_demo_anonymization === true

    // Fetch auth user data to get reliable display names
    const { data: searcherAuthData } = await serviceClient.auth.admin.getUserById(searcherId)
    const { data: targetAuthData } = await serviceClient.auth.admin.getUserById(targetId)

    const searcherAuthUser = searcherAuthData?.user
    const targetAuthUser = targetAuthData?.user

    const searcherAuthMetadata = searcherAuthUser?.user_metadata || {}
    const targetAuthMetadata = targetAuthUser?.user_metadata || {}

    // Fetch searcher's full profile
    const { data: searcherPortfolio, error: searcherPortfolioError } = await serviceClient
      .from('portfolios')
      .select('id, metadata')
      .eq('user_id', searcherId)
      .eq('type', 'human')
      .maybeSingle()

    if (searcherPortfolioError) {
      console.error('Error fetching searcher portfolio:', searcherPortfolioError)
    }

    // Fetch searcher's projects
    const { data: searcherProjects, error: searcherProjectsError } = await serviceClient
      .from('portfolios')
      .select('id, metadata')
      .eq('type', 'projects')

    if (searcherProjectsError) {
      console.error('Error fetching searcher projects:', searcherProjectsError)
    }

    const searcherUserProjects = (searcherProjects || []).filter((p: any) => {
      const metadata = p.metadata as any
      const managers = metadata?.managers || []
      const members = metadata?.members || []
      return (
        p.user_id === searcherId ||
        (Array.isArray(managers) && managers.includes(searcherId)) ||
        (Array.isArray(members) && members.includes(searcherId))
      )
    })

    // Fetch target user's full profile
    const { data: targetPortfolio, error: targetPortfolioError } = await serviceClient
      .from('portfolios')
      .select('id, metadata')
      .eq('user_id', targetId)
      .eq('type', 'human')
      .maybeSingle()

    if (targetPortfolioError) {
      console.error('Error fetching target portfolio:', targetPortfolioError)
    }

    // Fetch target user's projects
    const { data: targetProjects, error: targetProjectsError } = await serviceClient
      .from('portfolios')
      .select('id, metadata')
      .eq('type', 'projects')

    if (targetProjectsError) {
      console.error('Error fetching target projects:', targetProjectsError)
    }

    const targetUserProjects = (targetProjects || []).filter((p: any) => {
      const metadata = p.metadata as any
      const managers = metadata?.managers || []
      const members = metadata?.members || []
      return (
        p.user_id === targetId ||
        (Array.isArray(managers) && managers.includes(targetId)) ||
        (Array.isArray(members) && members.includes(targetId))
      )
    })

    // Build context for AI
    const searcherProfile = searcherPortfolio?.metadata || {}
    const searcherProjectsMetadata = searcherUserProjects.map((p: any) => p.metadata || {})
    const targetProfile = targetPortfolio?.metadata || {}
    const targetProjectsMetadata = targetUserProjects.map((p: any) => p.metadata || {})

    const searcherNameFromProfile =
      searcherProfile.basic?.name || searcherProfile.full_name || null
    const targetNameFromProfile =
      targetProfile.basic?.name || targetProfile.full_name || null

    const matcherDisplayName = demoEnabled
      ? getDemoDisplayName(searcherId, true, true)
      : searcherNameFromProfile ||
        searcherAuthMetadata.name ||
        searcherAuthMetadata.full_name ||
        searcherAuthUser?.email ||
        'Matcher'

    const matcheeDisplayName = demoEnabled
      ? getDemoDisplayName(targetId, false, true)
      : targetNameFromProfile ||
        targetAuthMetadata.name ||
        targetAuthMetadata.full_name ||
        targetAuthUser?.email ||
        'Matchee'

    // When demo anonymization is enabled, overwrite names and descriptions
    // in the profile metadata we send to the model so that the AI
    // only ever sees mock names and masked descriptions.
    if (demoEnabled) {
      if (!searcherProfile.basic) {
        searcherProfile.basic = {}
      }
      if (!targetProfile.basic) {
        targetProfile.basic = {}
      }
      searcherProfile.basic.name = matcherDisplayName
      targetProfile.basic.name = matcheeDisplayName

      if (searcherProfile.full_name) {
        searcherProfile.full_name = matcherDisplayName
      }
      if (targetProfile.full_name) {
        targetProfile.full_name = matcheeDisplayName
      }

      if (searcherProfile.basic.description) {
        searcherProfile.basic.description = maskDescription(searcherProfile.basic.description, true)
      }
      if (targetProfile.basic.description) {
        targetProfile.basic.description = maskDescription(targetProfile.basic.description, true)
      }
    }

    const { openai } = await import('@/lib/openai/client')

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at analyzing professional collaboration matches.

You will receive:
- A "matcher" (the person searching)
- A "matchee" (the person who was matched)
- Both people's profiles, projects, and optionally the matcher’s specific asks.

Your task:
1. For EACH subject (first the matcher, then the matchee), write ONE short paragraph (about 60–90 words) that explains:
   - How the other person can provide resources, skills, or opportunities that the subject is looking for
   - How this is grounded in their descriptions, experiences, and projects
2. For EACH subject, propose 3–6 concrete activity suggestions as "cards". Each card must:
   - Have a title in one of these formats (use the EXACT patterns):
     - "You should invite [OTHER_PERSON_NAME] to …"  (when the subject initiates or invites to THEIR OWN project / activity)
     - "Join … with [OTHER_PERSON_NAME]"           (when the subject joins the OTHER person's existing project / activity)
   - Have a 1–2 sentence description explaining WHY this activity is a good idea for the subject, based on:
     - The subject’s needs, asks, and goals
     - Both people’s social preferences and constraints
     - Relevant projects, skills, or experiences from either side

Formatting & JSON:
- ONLY return valid JSON (no markdown, no commentary).
- Use this exact JSON shape:
{
  "matcher": {
    "subjectName": string,          // display name for the matcher
    "otherPersonName": string,      // display name for the matchee
    "paragraph": string,           // 60–90 words
    "activities": [
      { "title": string, "description": string },
      ...
    ]
  },
  "matchee": {
    "subjectName": string,          // display name for the matchee
    "otherPersonName": string,      // display name for the matcher
    "paragraph": string,           // 60–90 words
    "activities": [
      { "title": string, "description": string },
      ...
    ]
  }
}

Constraints:
- Titles MUST strictly start with either "You should invite [OTHER_PERSON_NAME] to" or "Join" and MUST include [OTHER_PERSON_NAME] exactly once.
- Descriptions MUST clearly mention how the activity ties to their projects, skills, or social preferences whenever possible.
- Avoid generic networking advice; be concrete and grounded in the provided data.`,
        },
        {
          role: 'user',
          content: `Generate a two-sided match analysis for:

Matcher (subject A): ${matcherDisplayName}
Matchee (subject B): ${matcheeDisplayName}

${specificAsks && specificAsks.length > 0 ? `Matcher's specific asks:\n${specificAsks.map((ask) => `- ${ask}`).join('\n')}\n\n` : ''}Matcher's Profile:
${JSON.stringify(searcherProfile, null, 2)}

Matcher's Projects:
${JSON.stringify(searcherProjectsMetadata, null, 2)}

Matchee's Profile:
${JSON.stringify(targetProfile, null, 2)}

Matchee's Projects:
${JSON.stringify(targetProjectsMetadata, null, 2)}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 1000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from AI')
    }

    let result: MatchExplanationPayload
    try {
      // The OpenAI client is instructed to return a JSON object, but we still
      // defensively parse and handle any malformed output to avoid throwing.
      const jsonStart = content.indexOf('{')
      const jsonEnd = content.lastIndexOf('}')
      const jsonString =
        jsonStart !== -1 && jsonEnd !== -1 ? content.slice(jsonStart, jsonEnd + 1) : content

      result = JSON.parse(jsonString) as MatchExplanationPayload
    } catch (parseError: any) {
      console.error(
        'Failed to parse match explanation JSON:',
        parseError?.message || String(parseError)
      )
      return {
        success: false,
        error: 'Failed to parse AI match explanation',
      }
    }

    return {
      success: true,
      explanation: result,
    }
  } catch (error: any) {
    console.error('Exception generating match explanation:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

interface MatchBreakdownResult {
  success: boolean
  forwardMatches?: Array<{
    searchingAsk: string
    maxSimilarity: number
    matchedKnowledgeText: string
    searchingProject?: {
      id: string
      name: string | null
      description: string | null
    }
    matchedProject?: {
      id: string
      name: string | null
      description: string | null
    }
    projects?: Array<{
      id: string
      name: string | null
      description: string | null
    }>
  }>
  backwardMatches?: Array<{
    searchingNonAsk: string
    maxSimilarity: number
    matchedAskText: string
    searchingProject?: {
      id: string
      name: string | null
      description: string | null
    }
    matchedProject?: {
      id: string
      name: string | null
      description: string | null
    }
    projects?: Array<{
      id: string
      name: string | null
      description: string | null
    }>
  }>
  specificMatches?: Array<{
    searchingAsk: string
    maxSimilarity: number
    matchedKnowledgeText: string
    matchedProject?: {
      id: string
      name: string | null
      description: string | null
    }
    projects?: Array<{
      id: string
      name: string | null
      description: string | null
    }>
  }>
  topicMatches?: Array<{
    searcherTopicId: string
    searcherTopicName: string
    targetTopicId: string
    targetTopicName: string
    similarity: number
    multiplier: number
  }>
  error?: string
}

/**
 * Get detailed match breakdown for a specific target user
 * @param matchDetails - Optional match details already loaded. If provided, will use these instead of rerunning the match.
 * @param projects - Optional array of projects already loaded (from getMatchData). If provided, will reuse this data instead of fetching from DB.
 */
export async function getMatchBreakdown(
  searcherId: string,
  targetUserId: string,
  searchKeyword?: string,
  projects?: Array<{
    id: string
    name: string
    metadata: any
    created_at: string
    updated_at: string
    user_id: string
  }>,
  matchDetails?: {
    forwardDetails?: Record<
      string,
      Array<{
        searchingAsk: string
        searchingAskId: string
        maxSimilarity: number
        matchedKnowledgeText: string
        matchedKnowledgeId: string
      }>
    >
    backwardDetails?: Record<
      string,
      Array<{
        searchingNonAsk: string
        searchingNonAskId: string
        maxSimilarity: number
        matchedAskText: string
        matchedKnowledgeId: string
      }>
    >
    specificDetails?: Record<
      string,
      Array<{
        searchingAsk: string
        maxSimilarity: number
        matchedKnowledgeText: string
        matchedKnowledgeId?: string
      }>
    >
    topicDetails?: Record<
      string,
      Array<{
        searcherTopicId: string
        searcherTopicName: string
        targetTopicId: string
        targetTopicName: string
        similarity: number
        multiplier: number
      }>
    >
  }
): Promise<MatchBreakdownResult> {
  try {
    await requireAdmin()
    const serviceClient = createServiceClient()

    let forwardDetails: Array<{
      searchingAsk: string
      searchingAskId: string
      maxSimilarity: number
      matchedKnowledgeText: string
      matchedKnowledgeId: string
    }> = []
    let backwardDetails: Array<{
      searchingNonAsk: string
      searchingNonAskId: string
      maxSimilarity: number
      matchedAskText: string
      matchedKnowledgeId: string
    }> = []
    let topicDetails: Array<{
      searcherTopicId: string
      searcherTopicName: string
      targetTopicId: string
      targetTopicName: string
      similarity: number
      multiplier: number
    }> = []
    let specificDetails: Array<{
      searchingAsk: string
      maxSimilarity: number
      matchedKnowledgeText: string
      matchedKnowledgeId?: string
    }> = []

    // Use provided match details if available, otherwise rerun the match
    if (matchDetails) {
      forwardDetails = matchDetails.forwardDetails?.[targetUserId] || []
      backwardDetails = matchDetails.backwardDetails?.[targetUserId] || []
      topicDetails = matchDetails.topicDetails?.[targetUserId] || []
      if (searchKeyword && searchKeyword.trim().length > 0) {
        specificDetails = matchDetails.specificDetails?.[targetUserId] || []
      }
    } else {
      // Fallback: rerun match if details not provided (for backward compatibility)
      const {
        performMatchSearch,
        performSpecificSearch,
      } = await import('@/lib/indexing/match-search')

      const matchResult = await performMatchSearch(searcherId)
      forwardDetails = matchResult.forwardDetails.get(targetUserId) || []
      backwardDetails = matchResult.backwardDetails.get(targetUserId) || []
      topicDetails = matchResult.topicDetails.get(targetUserId) || []

      if (searchKeyword && searchKeyword.trim().length > 0) {
        const specificResult = await performSpecificSearch(searcherId, searchKeyword.trim())
        specificDetails = specificResult.details.get(targetUserId) || []
      }
    }

    // Collect all atomic knowledge IDs (both searching and matched sides)
    const allKnowledgeIds = new Set<string>()
    forwardDetails.forEach((m) => {
      if (m.searchingAskId) allKnowledgeIds.add(m.searchingAskId)
      if (m.matchedKnowledgeId) allKnowledgeIds.add(m.matchedKnowledgeId)
    })
    backwardDetails.forEach((m) => {
      if (m.searchingNonAskId) allKnowledgeIds.add(m.searchingNonAskId)
      if (m.matchedKnowledgeId) allKnowledgeIds.add(m.matchedKnowledgeId)
    })
    specificDetails.forEach((m) => {
      if (m.matchedKnowledgeId) allKnowledgeIds.add(m.matchedKnowledgeId)
    })

    // Fetch source_info for all atomic knowledge
    const knowledgeSourceInfoMap = new Map<
      string,
      {
        source_type?: string
        source_id?: string
        property_name?: string
      } | null
    >()

    if (allKnowledgeIds.size > 0) {
      const { data: akRows, error: akError } = await serviceClient
        .from('atomic_knowledge')
        .select('id, source_info')
        .in('id', Array.from(allKnowledgeIds))

      ;(akRows || []).forEach((row: any) => {
        const sourceInfoRaw = row.source_info as any
        // Parse JSON string if it's a string, otherwise use as-is
        let sourceInfo: any = null
        if (sourceInfoRaw) {
          if (typeof sourceInfoRaw === 'string') {
            try {
              sourceInfo = JSON.parse(sourceInfoRaw)
            } catch (e) {
              sourceInfo = sourceInfoRaw
            }
          } else {
            sourceInfo = sourceInfoRaw
          }
        }
        knowledgeSourceInfoMap.set(row.id as string, sourceInfo || null)
      })
    }

    // Collect project IDs from source_info where source_type is 'project_property'
    const projectIdsFromSource = new Set<string>()
    knowledgeSourceInfoMap.forEach((sourceInfo) => {
      if (sourceInfo?.source_type === 'project_property' && sourceInfo.source_id) {
        projectIdsFromSource.add(sourceInfo.source_id)
      }
    })

    // Also collect from assigned_projects (existing logic)
    const knowledgeTexts = new Set<string>()
    forwardDetails.forEach((m) => knowledgeTexts.add(m.matchedKnowledgeText))
    backwardDetails.forEach((m) => knowledgeTexts.add(m.matchedAskText))
    specificDetails.forEach((m) => knowledgeTexts.add(m.matchedKnowledgeText))

    if (knowledgeTexts.size > 0) {
      const { data: akRows } = await serviceClient
        .from('atomic_knowledge')
        .select('knowledge_text, assigned_projects')
        .in('knowledge_text', Array.from(knowledgeTexts))

      ;(akRows || []).forEach((row: any) => {
        const assigned = row.assigned_projects as string[] | null
        if (Array.isArray(assigned)) {
          assigned.forEach((pid) => pid && projectIdsFromSource.add(pid))
        }
      })
    }

    // Build project map from provided projects or fetch from DB
    const projectMap = new Map<string, { id: string; name: string | null; description: string | null }>()
    if (projectIdsFromSource.size > 0) {
      if (projects && projects.length > 0) {
        // Use provided projects (from getMatchData) - no DB call needed
        const providedProjectsMap = new Map(projects.map((p) => [p.id, p]))
        projectIdsFromSource.forEach((projectId) => {
          const project = providedProjectsMap.get(projectId)
          if (project) {
            const meta = (project.metadata as any) || {}
            const basic = meta.basic || {}
            const name = project.name || basic.name || null
            const description = basic.description || meta.description || null

            projectMap.set(projectId, {
              id: projectId,
              name,
              description,
            })
          }
        })
        // If we still need projects that weren't in the provided list, fetch them
        const missingProjectIds = Array.from(projectIdsFromSource).filter((id) => !providedProjectsMap.has(id))
        if (missingProjectIds.length > 0) {
          const { data: fetchedProjects } = await serviceClient
            .from('portfolios')
            .select('id, metadata')
            .in('id', missingProjectIds)
            .eq('type', 'projects')

          ;(fetchedProjects || []).forEach((p: any) => {
            const meta = (p.metadata as any) || {}
            const basic = meta.basic || {}
            const name = basic.name || null
            const description = basic.description || meta.description || null

            projectMap.set(p.id as string, {
              id: p.id as string,
              name,
              description,
            })
          })
        }
      } else {
        // No provided projects, fetch from DB
        const { data: fetchedProjects } = await serviceClient
          .from('portfolios')
          .select('id, metadata')
          .in('id', Array.from(projectIdsFromSource))
          .eq('type', 'projects')

        ;(fetchedProjects || []).forEach((p: any) => {
          const meta = (p.metadata as any) || {}
          const basic = meta.basic || {}
          const name = basic.name || null
          const description = basic.description || meta.description || null

          projectMap.set(p.id as string, {
            id: p.id as string,
            name,
            description,
          })
        })
      }
    }

    // Helper function to get project info from source_info
    const getProjectFromSourceInfo = (knowledgeId: string): { id: string; name: string | null; description: string | null } | null => {
      const sourceInfo = knowledgeSourceInfoMap.get(knowledgeId)
      if (sourceInfo?.source_type === 'project_property' && sourceInfo.source_id) {
        return projectMap.get(sourceInfo.source_id) || null
      }
      return null
    }

    // Enrich forward matches
    const enrichedForward = forwardDetails.map((m) => {
      const searchingProject = m.searchingAskId ? getProjectFromSourceInfo(m.searchingAskId) : null
      const matchedProject = m.matchedKnowledgeId ? getProjectFromSourceInfo(m.matchedKnowledgeId) : null
      
      return {
      ...m,
        searchingProject: searchingProject || undefined,
        matchedProject: matchedProject || undefined,
      }
    })

    // Enrich backward matches
    const enrichedBackward = backwardDetails.map((m) => {
      const searchingProject = m.searchingNonAskId ? getProjectFromSourceInfo(m.searchingNonAskId) : null
      const matchedProject = m.matchedKnowledgeId ? getProjectFromSourceInfo(m.matchedKnowledgeId) : null
      
      return {
      ...m,
        searchingProject: searchingProject || undefined,
        matchedProject: matchedProject || undefined,
      }
    })

    // Enrich specific matches
    const enrichedSpecific = specificDetails.map((m) => {
      const matchedProject = m.matchedKnowledgeId ? getProjectFromSourceInfo(m.matchedKnowledgeId) : null
      
      return {
      ...m,
        matchedProject: matchedProject || undefined,
      }
    })

    return {
      success: true,
      forwardMatches: enrichedForward,
      backwardMatches: enrichedBackward,
      specificMatches: enrichedSpecific.length > 0 ? enrichedSpecific : undefined,
      topicMatches: topicDetails.length > 0 ? topicDetails : undefined,
    }
  } catch (error: any) {
    console.error('Exception getting match breakdown:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

interface GetUserInterestsResult {
  success: boolean
  interests?: Array<{
    topicId: string
    topicName: string
    aggregateScore: number
  }>
  error?: string
}

/**
 * Get user interests ordered by aggregate score
 */
export async function getUserInterests(userId: string): Promise<GetUserInterestsResult> {
  try {
    await requireAdmin()
    const serviceClient = createServiceClient()

    // Get interests ordered by aggregate_score descending
    const { data: interests, error } = await serviceClient
      .from('user_interests')
      .select('topic_id, aggregate_score')
      .eq('user_id', userId)
      .order('aggregate_score', { ascending: false })

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to fetch user interests',
      }
    }

    if (!interests || interests.length === 0) {
      return {
        success: true,
        interests: [],
      }
    }

    // Fetch topic names
    const topicIds = interests.map((i: any) => i.topic_id)
    const { data: topics, error: topicsError } = await serviceClient
      .from('topics')
      .select('id, name')
      .in('id', topicIds)

    if (topicsError) {
      return {
        success: false,
        error: topicsError.message || 'Failed to fetch topic names',
      }
    }

    // Create topic name map
    const topicNameMap = new Map((topics || []).map((t: any) => [t.id, t.name || 'Unknown Topic']))

    // Combine interests with topic names, maintaining order by aggregate_score
    const result = interests.map((interest: any) => ({
      topicId: interest.topic_id,
      topicName: topicNameMap.get(interest.topic_id) || 'Unknown Topic',
      aggregateScore: parseFloat(interest.aggregate_score) || 0,
    }))

    return {
      success: true,
      interests: result,
    }
  } catch (error: any) {
    console.error('Exception getting user interests:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

