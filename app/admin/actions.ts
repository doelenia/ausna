'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createServiceClient } from '@/lib/supabase/service'

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
  }>
  error?: string
}

interface BlockUserResult {
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
      .select('user_id, metadata, id')
      .eq('type', 'human')

    if (portfolioError) {
      return {
        success: false,
        error: portfolioError.message || 'Failed to fetch portfolios',
      }
    }

    // Create a map of user_id to portfolio
    const portfolioMap = new Map(
      (humanPortfolios || []).map((p) => [
        p.user_id,
        {
          id: p.id,
          metadata: p.metadata as any,
        },
      ])
    )

    // Combine user data with portfolio info
    const users = (authUsers.users || []).map((authUser) => {
      const portfolio = portfolioMap.get(authUser.id)
      const metadata = portfolio?.metadata || {}
      const userMetadata = authUser.user_metadata || {}

      return {
        id: authUser.id,
        email: authUser.email || '',
        username: metadata.username || userMetadata.username || null,
        name: metadata.basic?.name || metadata.full_name || userMetadata.full_name || null,
        created_at: authUser.created_at,
        is_blocked: userMetadata.is_blocked === true,
        human_portfolio_id: portfolio?.id || null,
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

    // Get all human portfolios
    const { data: humanPortfolios } = await supabase
      .from('portfolios')
      .select('user_id, metadata, id')
      .eq('type', 'human')

    const portfolioMap = new Map(
      (humanPortfolios || []).map((p) => [
        p.user_id,
        {
          id: p.id,
          metadata: p.metadata as any,
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
        const portfolio = portfolioMap.get(authUser.id)
        const metadata = portfolio?.metadata || {}
        const userMetadata = authUser.user_metadata || {}

        return {
          id: authUser.id,
          email: authUser.email || '',
          username: metadata.username || userMetadata.username || null,
          name: metadata.basic?.name || metadata.full_name || userMetadata.full_name || null,
          created_at: authUser.created_at,
          is_blocked: userMetadata.is_blocked === true,
          human_portfolio_id: portfolio?.id || null,
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

