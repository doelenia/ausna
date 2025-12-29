import { createClient } from '@/lib/supabase/server'
import { Portfolio, PortfolioType } from '@/types/portfolio'
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

