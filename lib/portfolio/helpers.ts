import { createClient } from '@/lib/supabase/server'
import { Portfolio, PortfolioType, PinnedItem } from '@/types/portfolio'
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
 * Check if a portfolio has a parent portfolio in its hosts array
 */
export async function isPortfolioHost(
  parentPortfolioId: string,
  childPortfolioId: string
): Promise<boolean> {
  const supabase = await createClient()
  
  const { data: childPortfolio, error } = await supabase
    .from('portfolios')
    .select('metadata')
    .eq('id', childPortfolioId)
    .single()

  if (error || !childPortfolio) {
    return false
  }

  const metadata = childPortfolio.metadata as any
  const hosts = metadata?.hosts || []
  return Array.isArray(hosts) && hosts.includes(parentPortfolioId)
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
 * Get the count of pinned items in a portfolio
 */
export function getPinnedItemsCount(portfolio: Portfolio): number {
  const metadata = portfolio.metadata as any
  const pinned = metadata?.pinned || []
  return Array.isArray(pinned) ? pinned.length : 0
}

/**
 * Check if an item can be added to pinned list
 */
export async function canAddToPinned(
  portfolio: Portfolio,
  itemType: 'portfolio' | 'note',
  itemId: string
): Promise<{ canAdd: boolean; error?: string }> {
  // Check if pinned list is full
  const pinnedCount = getPinnedItemsCount(portfolio)
  if (pinnedCount >= 9) {
    return {
      canAdd: false,
      error: 'Pinned list is full (maximum 9 items)',
    }
  }

  // Check if item is already pinned
  const metadata = portfolio.metadata as any
  const pinned = metadata?.pinned || []
  if (Array.isArray(pinned)) {
    const isAlreadyPinned = pinned.some(
      (item: PinnedItem) => item.type === itemType && item.id === itemId
    )
    if (isAlreadyPinned) {
      return {
        canAdd: false,
        error: 'Item is already pinned',
      }
    }
  }

  // Validate based on item type
  if (itemType === 'portfolio') {
    const isHost = await isPortfolioHost(portfolio.id, itemId)
    if (!isHost) {
      return {
        canAdd: false,
        error: 'Portfolio must have this portfolio in its hosts array',
      }
    }
  } else if (itemType === 'note') {
    const isAssigned = await isNoteAssignedToPortfolio(itemId, portfolio.id)
    if (!isAssigned) {
      return {
        canAdd: false,
        error: 'Note must be assigned to this portfolio',
      }
    }
  }

  return { canAdd: true }
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

