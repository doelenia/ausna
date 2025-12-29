/**
 * Client-side helper functions for working with human portfolios
 * This file only contains client-side code and can be safely imported in client components
 */

import { HumanPortfolio, HumanPortfolioMetadata } from '@/types/portfolio'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

type Client = SupabaseClient<Database>

/**
 * Client-side version (for use in client components)
 */
export function createHumanPortfolioHelpers(supabase: Client) {
  return {
    async getHumanPortfolio(userId: string): Promise<HumanPortfolio | null> {
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
    },

    async ensureHumanPortfolio(userId: string): Promise<HumanPortfolio> {
      let portfolio = await this.getHumanPortfolio(userId)
      
      if (portfolio) {
        return portfolio
      }

      // Get user info
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('User not authenticated')
      }

      const email = user.email || ''
      const username = email.split('@')[0] || 'user'
      const fullName = user.user_metadata?.full_name || 
                       user.user_metadata?.name || 
                       username

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
              avatar: user.user_metadata?.avatar_url || '',
            },
            pinned: [],
            settings: {},
            username, // Keep for backward compatibility
            email,
            full_name: fullName,
            avatar_url: user.user_metadata?.avatar_url, // Keep for backward compatibility
          } as HumanPortfolioMetadata,
        })
        .select()
        .single()

      if (error || !newPortfolio) {
        throw new Error(`Failed to create human portfolio: ${error?.message}`)
      }

      return newPortfolio as HumanPortfolio
    },

    async updateHumanPortfolioMetadata(
      userId: string,
      updates: Partial<HumanPortfolioMetadata>
    ): Promise<HumanPortfolio> {
      const portfolio = await this.ensureHumanPortfolio(userId)
      
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
    },

    async updateHumanPortfolioUsername(
      userId: string,
      username: string
    ): Promise<HumanPortfolio> {
      return this.updateHumanPortfolioMetadata(userId, { username })
    },

    async getUsername(userId: string): Promise<string | null> {
      const portfolio = await this.getHumanPortfolio(userId)
      if (!portfolio) return null
      
      const metadata = portfolio.metadata as HumanPortfolioMetadata
      return metadata.username || null
    },
  }
}

