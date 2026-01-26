/**
 * Admin helper functions for creating and managing portfolios
 * These functions use service client to bypass RLS and perform admin operations
 */

import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { HumanPortfolio, HumanPortfolioMetadata } from '@/types/portfolio'

/**
 * Find user by email using service client
 * Returns user_id if found, null otherwise
 */
export async function findUserByEmail(email: string): Promise<string | null> {
  const serviceClient = createServiceClient()
  
  try {
    const { data, error } = await serviceClient.auth.admin.listUsers()
    
    if (error) {
      console.error('Error listing users:', error)
      return null
    }
    
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    return user?.id || null
  } catch (error) {
    console.error('Error finding user by email:', error)
    return null
  }
}

/**
 * Find human portfolio by email (searches metadata.email field)
 * Returns portfolio if found, null otherwise
 */
export async function findHumanPortfolioByEmail(email: string): Promise<HumanPortfolio | null> {
  const supabase = await createClient()
  
  try {
    // Search for human portfolios where metadata.email matches
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('type', 'human')
      .eq('metadata->>email', email.toLowerCase())
      .maybeSingle()
    
    if (error) {
      console.error('Error finding human portfolio by email:', error)
      return null
    }
    
    return data as HumanPortfolio | null
  } catch (error) {
    console.error('Error finding human portfolio by email:', error)
    return null
  }
}

/**
 * Create a placeholder human portfolio for an email that doesn't have a user account
 * This creates a pseudo portfolio that can be linked to projects
 * Note: Since portfolios require user_id, we need to create a system user or handle this differently
 * For now, we'll throw an error if no user exists - the calling code should create a user first
 */
export async function createPlaceholderHumanPortfolio(
  email: string,
  name: string,
  userId: string,
  isPseudo: boolean = true // Default to pseudo
): Promise<HumanPortfolio> {
  const supabase = await createClient()
  
  // Generate slug from email
  const emailHash = email.toLowerCase().replace(/[^a-z0-9]/g, '-')
  const baseSlug = `placeholder-${emailHash}`
  let slug = baseSlug
  let slugCounter = 1
  
  // Ensure slug is unique
  while (true) {
    const { data: existing } = await supabase
      .from('portfolios')
      .select('id')
      .eq('type', 'human')
      .eq('slug', slug)
      .maybeSingle()
    
    if (!existing) {
      break
    }
    
    slug = `${baseSlug}-${slugCounter}`
    slugCounter++
  }
  
  // Create placeholder human portfolio
  const { data: newPortfolio, error } = await supabase
    .from('portfolios')
    .insert({
      type: 'human',
      slug,
      user_id: userId, // Use the provided userId (should be from created user or existing user)
      is_pseudo: isPseudo, // Use provided pseudo status (defaults to true)
      metadata: {
        basic: {
          name: name.trim(),
          description: '',
          avatar: '',
        },
        pinned: [],
        settings: {},
        email: email.toLowerCase(),
        username: email.split('@')[0] || 'user',
        full_name: name,
      } as HumanPortfolioMetadata,
    })
    .select()
    .single()
  
  if (error || !newPortfolio) {
    throw new Error(`Failed to create placeholder human portfolio: ${error?.message}`)
  }
  
  return newPortfolio as HumanPortfolio
}

/**
 * Create a user account via admin API
 * Returns user_id if successful, throws error otherwise
 */
export async function createUserAccount(email: string, name: string): Promise<string> {
  const serviceClient = createServiceClient()
  
  try {
    // Generate a random password (user won't be able to login without password reset)
    const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12) + 'A1!'
    
    const { data, error } = await serviceClient.auth.admin.createUser({
      email: email.toLowerCase(),
      email_confirm: true, // Auto-confirm email
      password: randomPassword,
      user_metadata: {
        full_name: name,
        name: name,
      },
    })
    
    if (error || !data.user) {
      throw new Error(`Failed to create user account: ${error?.message || 'Unknown error'}`)
    }
    
    return data.user.id
  } catch (error: any) {
    console.error('Error creating user account:', error)
    throw new Error(`Failed to create user account: ${error.message}`)
  }
}

/**
 * Find or create user by email
 * Returns user_id, creating a user account if needed
 */
export async function findOrCreateUserByEmail(email: string, name: string): Promise<string> {
  // Try to find existing user
  const existingUserId = await findUserByEmail(email)
  if (existingUserId) {
    return existingUserId
  }
  
  // Create new user account
  return await createUserAccount(email, name)
}

/**
 * Find or create human portfolio for email
 * First checks if portfolio exists by email
 * If not, finds user by email or creates user account, then creates portfolio
 * Returns the human portfolio
 */
export async function findOrCreateHumanPortfolioForEmail(
  email: string,
  name: string
): Promise<{ portfolio: HumanPortfolio; isNew: boolean }> {
  // First, check if human portfolio already exists by email
  const existingPortfolio = await findHumanPortfolioByEmail(email)
  if (existingPortfolio) {
    return { portfolio: existingPortfolio, isNew: false }
  }
  
  // Find or create user by email
  const userId = await findOrCreateUserByEmail(email, name)
  
  // Check if user already has a human portfolio
  const supabase = await createClient()
  const { data: existingUserPortfolio } = await supabase
    .from('portfolios')
    .select('*')
    .eq('type', 'human')
    .eq('user_id', userId)
    .maybeSingle()
  
  if (existingUserPortfolio) {
    // User has portfolio but email doesn't match - update email in metadata
    const metadata = existingUserPortfolio.metadata as HumanPortfolioMetadata
    const updatedMetadata = {
      ...metadata,
      email: email.toLowerCase(),
    }
    
    const { data: updated } = await supabase
      .from('portfolios')
      .update({ metadata: updatedMetadata })
      .eq('id', existingUserPortfolio.id)
      .select()
      .single()
    
    if (updated) {
      return { portfolio: updated as HumanPortfolio, isNew: false }
    }
  }
  
  // Create new human portfolio for the user
  const newPortfolio = await createPlaceholderHumanPortfolio(email, name, userId)
  return { portfolio: newPortfolio, isNew: true }
}

/**
 * Update human portfolio metadata by portfolio ID (for admin use)
 * This allows updating portfolios for any user, not just the current user
 */
export async function updateHumanPortfolioMetadataById(
  portfolioId: string,
  updates: Partial<HumanPortfolioMetadata>
): Promise<HumanPortfolio> {
  const supabase = await createClient()
  
  // Get existing portfolio
  const { data: portfolio, error: fetchError } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', portfolioId)
    .eq('type', 'human')
    .single()
  
  if (fetchError || !portfolio) {
    throw new Error(`Human portfolio not found: ${fetchError?.message}`)
  }
  
  // Merge updates with existing metadata, preserving structure
  const existingMetadata = portfolio.metadata as HumanPortfolioMetadata
  const updatedMetadata = {
    ...existingMetadata,
    ...updates,
    // Ensure basic structure is preserved
    basic: {
      ...existingMetadata.basic,
      ...(updates.basic || {}),
    },
  }
  
  const { data, error } = await supabase
    .from('portfolios')
    .update({ metadata: updatedMetadata })
    .eq('id', portfolioId)
    .select()
    .single()
  
  if (error || !data) {
    throw new Error(`Failed to update human portfolio: ${error?.message}`)
  }
  
  return data as HumanPortfolio
}

/**
 * Add a project to a human portfolio's owned_projects list (admin version)
 * This allows adding projects to any user's portfolio, not just the current user
 */
export async function addProjectToOwnedListById(
  portfolioId: string,
  projectId: string
): Promise<void> {
  const supabase = await createClient()
  
  // Get human portfolio
  const { data: portfolio, error: fetchError } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', portfolioId)
    .eq('type', 'human')
    .single()
  
  if (fetchError || !portfolio) {
    throw new Error(`Human portfolio not found: ${fetchError?.message}`)
  }
  
  const metadata = portfolio.metadata as HumanPortfolioMetadata
  const ownedProjects = metadata.owned_projects || []
  
  // Remove project if it already exists (to move it to top)
  const filteredProjects = ownedProjects.filter((id) => id !== projectId)
  
  // Add project to the beginning (most recent first)
  const updatedProjects = [projectId, ...filteredProjects]
  
  // Update metadata
  await updateHumanPortfolioMetadataById(portfolioId, {
    owned_projects: updatedProjects,
  })
}

/**
 * Remove a project from a human portfolio's owned_projects list (admin version)
 * This allows removing projects from any user's portfolio, not just the current user
 * Can be called with either userId or portfolioId
 */
export async function removeProjectFromOwnedListById(
  userIdOrPortfolioId: string,
  projectId: string
): Promise<void> {
  const serviceClient = createServiceClient()
  
  // Try to find portfolio by user_id first (more common case)
  let portfolio: HumanPortfolio | null = null
  
  const { data: portfolioByUserId, error: userError } = await serviceClient
    .from('portfolios')
    .select('*')
    .eq('type', 'human')
    .eq('user_id', userIdOrPortfolioId)
    .maybeSingle()
  
  if (!userError && portfolioByUserId) {
    portfolio = portfolioByUserId as HumanPortfolio
  } else {
    // Try by portfolio ID
    const { data: portfolioById, error: idError } = await serviceClient
      .from('portfolios')
      .select('*')
      .eq('type', 'human')
      .eq('id', userIdOrPortfolioId)
      .maybeSingle()
    
    if (!idError && portfolioById) {
      portfolio = portfolioById as HumanPortfolio
    }
  }
  
  if (!portfolio) {
    // If portfolio doesn't exist, nothing to remove
    return
  }
  
  const metadata = portfolio.metadata as HumanPortfolioMetadata
  const ownedProjects = metadata.owned_projects || []
  
  // Remove project from list
  const updatedProjects = ownedProjects.filter((id) => id !== projectId)
  
  // Update metadata
  await updateHumanPortfolioMetadataById(portfolio.id, {
    owned_projects: updatedProjects,
  })
}

