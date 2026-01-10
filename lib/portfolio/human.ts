/**
 * Helper functions for working with human portfolios
 * Since each user must have exactly one human portfolio, these functions
 * ensure that portfolio exists and provide convenient access to it.
 */

import { createClient } from '@/lib/supabase/server'
import { HumanPortfolio, HumanPortfolioMetadata } from '@/types/portfolio'

/**
 * Get the human portfolio for a user
 * Returns null if not found (should not happen in normal operation)
 */
export async function getHumanPortfolio(userId: string): Promise<HumanPortfolio | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'human')
    .single()

  if (error || !data) {
    return null
  }

  return data as HumanPortfolio
}

/**
 * Get or create the human portfolio for a user
 * This ensures every user has a human portfolio
 */
export async function ensureHumanPortfolio(userId: string): Promise<HumanPortfolio> {
  const supabase = await createClient()
  
  // Try to get existing portfolio
  let portfolio = await getHumanPortfolio(userId)
  
  if (portfolio) {
    return portfolio
  }

  // Get user info to create default portfolio
  // Note: This function should typically be called by the user themselves
  // For server-side operations, we'll use the current authenticated user
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  
  const email = currentUser?.email || 'user@example.com'
  const username = email.split('@')[0] || 'user'
  const fullName = currentUser?.user_metadata?.full_name || 
                   currentUser?.user_metadata?.name || 
                   username

  // Create new human portfolio with new metadata structure
  const { data: newPortfolio, error } = await supabase
    .from('portfolios')
    .insert({
      type: 'human',
      slug: `user-${userId}`,
      user_id: userId,
      metadata: {
        basic: {
          name: fullName,
          description: '',
          avatar: currentUser?.user_metadata?.avatar_url || '',
        },
        pinned: [],
        settings: {},
        username, // Keep for backward compatibility
        email,
        full_name: fullName,
        avatar_url: currentUser?.user_metadata?.avatar_url, // Keep for backward compatibility
      } as HumanPortfolioMetadata,
    })
    .select()
    .single()

  if (error || !newPortfolio) {
    throw new Error(`Failed to create human portfolio: ${error?.message}`)
  }

  return newPortfolio as HumanPortfolio
}

/**
 * Update human portfolio metadata
 */
export async function updateHumanPortfolioMetadata(
  userId: string,
  updates: Partial<HumanPortfolioMetadata>
): Promise<HumanPortfolio> {
  const supabase = await createClient()
  
  // Ensure portfolio exists
  const portfolio = await ensureHumanPortfolio(userId)
  
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
    .eq('user_id', userId)
    .eq('type', 'human')
    .select()
    .single()

  if (error || !data) {
    throw new Error(`Failed to update human portfolio: ${error?.message}`)
  }

  return data as HumanPortfolio
}

/**
 * Update human portfolio username
 */
export async function updateHumanPortfolioUsername(
  userId: string,
  username: string
): Promise<HumanPortfolio> {
  return updateHumanPortfolioMetadata(userId, { username })
}

/**
 * Get username from human portfolio
 */
export async function getUsername(userId: string): Promise<string | null> {
  const portfolio = await getHumanPortfolio(userId)
  if (!portfolio) return null
  
  const metadata = portfolio.metadata as HumanPortfolioMetadata
  return metadata.username || null
}

/**
 * Add a project to the user's owned_projects list (moves to top if already exists)
 * This should be called when:
 * - A project is created by the user
 * - A note is posted to a project owned by the user
 */
export async function addProjectToOwnedList(
  userId: string,
  projectId: string
): Promise<void> {
  const supabase = await createClient()
  
  // Get human portfolio
  const portfolio = await getHumanPortfolio(userId)
  if (!portfolio) {
    throw new Error('Human portfolio not found')
  }
  
  const metadata = portfolio.metadata as HumanPortfolioMetadata
  const ownedProjects = metadata.owned_projects || []
  
  // Remove project if it already exists (to move it to top)
  const filteredProjects = ownedProjects.filter((id) => id !== projectId)
  
  // Add project to the beginning (most recent first)
  const updatedProjects = [projectId, ...filteredProjects]
  
  // Update metadata
  await updateHumanPortfolioMetadata(userId, {
    owned_projects: updatedProjects,
  })
}

/**
 * Remove a project from the user's owned_projects list
 * This should be called when a project is deleted
 */
export async function removeProjectFromOwnedList(
  userId: string,
  projectId: string
): Promise<void> {
  const supabase = await createClient()
  
  // Get human portfolio
  const portfolio = await getHumanPortfolio(userId)
  if (!portfolio) {
    // If portfolio doesn't exist, nothing to remove
    return
  }
  
  const metadata = portfolio.metadata as HumanPortfolioMetadata
  const ownedProjects = metadata.owned_projects || []
  
  // Remove project from list
  const updatedProjects = ownedProjects.filter((id) => id !== projectId)
  
  // Update metadata
  await updateHumanPortfolioMetadata(userId, {
    owned_projects: updatedProjects,
  })
}

// Client-side helpers have been moved to human-client.ts
// Import from '@/lib/portfolio/human-client' in client components

