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
  }
  projects: Array<{
    name: string
    description?: string
    project_type_general: string
    project_type_specific: string
    is_pseudo?: boolean // defaults to true
    members: Array<{
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

    // Update properties if provided
    if (data.properties) {
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

    // Process each project
    for (const projectData of data.projects) {
      // Validate project data
      if (!projectData.name || !projectData.name.trim()) {
        continue // Skip invalid projects
      }

      // Project types are optional - allow projects without types

      // Validate member roles (max 2 words)
      const invalidRole = projectData.members.find((m) => {
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
      for (const member of projectData.members) {
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

