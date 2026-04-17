import { createClient } from '@/lib/supabase/server'
import { Portfolio, PortfolioType, isHumanPortfolio } from '@/types/portfolio'
import { SupabaseClient } from '@supabase/supabase-js'

// Re-export pure utility functions (can be used in client components)
export { getPortfolioBasic, generateSlug } from './utils'

/**
 * Get portfolio owner user_id (server-side)
 */
export async function getPortfolioOwner(portfolioId: string): Promise<string | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('portfolios')
    .select('user_id')
    .eq('id', portfolioId)
    .single()

  if (error || !data) {
    return null
  }

  return data.user_id
}

/**
 * Check if user is the owner of a portfolio (server-side)
 */
export async function isPortfolioOwner(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  const ownerId = await getPortfolioOwner(portfolioId)
  return ownerId === userId
}

/**
 * Check if user is the creator of a portfolio (server-side)
 * Creator is the portfolio owner (user_id)
 */
export async function isPortfolioCreator(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  return await isPortfolioOwner(portfolioId, userId)
}

/**
 * Check if user is a manager of a portfolio (server-side).
 * For any non-human portfolio: true when `metadata.managers` includes the user.
 */
export async function isPortfolioManager(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient()

  const { data: portfolio, error } = await supabase
    .from('portfolios')
    .select('type, metadata')
    .eq('id', portfolioId)
    .single()

  if (error || !portfolio) {
    return false
  }

  if (isHumanPortfolio(portfolio as Portfolio)) {
    return false
  }

  const metadata = portfolio.metadata as any
  const managers = metadata?.managers || []

  return Array.isArray(managers) && managers.includes(userId)
}

/**
 * Check if user can edit a portfolio (server-side)
 * Returns true if user is creator or manager
 */
export async function canEditPortfolio(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  const isCreator = await isPortfolioCreator(portfolioId, userId)
  if (isCreator) {
    return true
  }
  
  return await isPortfolioManager(portfolioId, userId)
}

/**
 * Check if user can delete a portfolio (server-side)
 * Returns true only if user is creator
 */
export async function canDeletePortfolio(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  return await isPortfolioCreator(portfolioId, userId)
}

/**
 * Get human portfolio by user_id (server-side)
 */
export async function getHumanPortfolioByUserId(
  userId: string
): Promise<Portfolio | null> {
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

  return data as Portfolio
}


/**
 * Check if a note is assigned to a portfolio
 */
export async function isNoteAssignedToPortfolio(
  noteId: string,
  portfolioId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { data: note, error } = await supabase
    .from('notes')
    .select('assigned_portfolios')
    .eq('id', noteId)
    .is('deleted_at', null)
    .single()

  if (error || !note) {
    return false
  }

  const assignedPortfolios = note.assigned_portfolios || []
  return Array.isArray(assignedPortfolios) && assignedPortfolios.includes(portfolioId)
}

/**
 * Get project type from portfolio (server-side)
 * Returns the specific type if available, otherwise null
 */
export function getProjectType(portfolio: Portfolio): string | null {
  if (isHumanPortfolio(portfolio)) {
    return null
  }
  const metadata = portfolio.metadata as any
  return metadata?.project_type_specific || null
}

/**
 * Get member role from portfolio (server-side)
 * Returns the role for a specific user, or null if not set
 */
export function getMemberRole(portfolio: Portfolio, userId: string): string | null {
  if (isHumanPortfolio(portfolio)) {
    return null
  }
  const metadata = portfolio.metadata as any
  const memberRoles = metadata?.memberRoles || {}
  return memberRoles[userId] || null
}

/**
 * Check if user can edit project type (server-side)
 * Returns true if user is creator or manager
 */
export async function canEditProjectType(
  portfolioId: string,
  userId: string
): Promise<boolean> {
  return await canEditPortfolio(portfolioId, userId)
}

/**
 * Client-side portfolio helpers
 */
export function createPortfolioHelpers(supabase: SupabaseClient) {
  return {
    async getPortfolioOwner(portfolioId: string): Promise<string | null> {
      const { data, error } = await supabase
        .from('portfolios')
        .select('user_id')
        .eq('id', portfolioId)
        .single()

      if (error || !data) {
        return null
      }

      return data.user_id
    },

    async isPortfolioOwner(portfolioId: string, userId: string): Promise<boolean> {
      const ownerId = await this.getPortfolioOwner(portfolioId)
      return ownerId === userId
    },

    async getHumanPortfolioByUserId(userId: string): Promise<Portfolio | null> {
      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'human')
        .single()

      if (error || !data) {
        return null
      }

      return data as Portfolio
    },
  }
}

