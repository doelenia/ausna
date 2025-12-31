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
      console.log('[getHumanPortfolio] Querying for userId:', userId)
      
      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'human')
        .single()

      if (error) {
        // PGRST116 means no rows found, which is expected if portfolio doesn't exist
        if (error.code === 'PGRST116') {
          console.log('[getHumanPortfolio] No portfolio found (expected)')
        } else {
          console.error('[getHumanPortfolio] Error querying portfolio:', error.message, error.code)
        }
        return null
      }

      if (!data) {
        console.log('[getHumanPortfolio] No data returned')
        return null
      }

      const portfolio = data as HumanPortfolio
      console.log('[getHumanPortfolio] Found portfolio:', portfolio.id)
      return portfolio
    },

    async ensureHumanPortfolio(userId: string): Promise<HumanPortfolio> {
      console.log('[ensureHumanPortfolio] Starting for userId:', userId)
      let portfolio = await this.getHumanPortfolio(userId)
      
      if (portfolio) {
        console.log('[ensureHumanPortfolio] Found existing portfolio:', portfolio.id)
        return portfolio
      }

      console.log('[ensureHumanPortfolio] No existing portfolio, creating new one...')

      // Get user info
      const { data: { user }, error: getUserError } = await supabase.auth.getUser()
      
      if (getUserError) {
        console.error('[ensureHumanPortfolio] Error getting user:', getUserError.message)
        throw new Error(`Auth error: ${getUserError.message}`)
      }
      
      if (!user) {
        console.error('[ensureHumanPortfolio] No authenticated user')
        throw new Error('User not authenticated')
      }

      console.log('[ensureHumanPortfolio] User authenticated:', user.id, 'email:', user.email)

      const email = user.email || ''
      const username = email.split('@')[0] || 'user'
      const fullName = user.user_metadata?.full_name || 
                       user.user_metadata?.name || 
                       username

      console.log('[ensureHumanPortfolio] Creating portfolio with data:', {
        type: 'human',
        slug: `user-${userId}`,
        user_id: userId,
        username,
        fullName,
      })

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
        } as any)
        .select()
        .single()

      if (error) {
        console.error('[ensureHumanPortfolio] Error creating portfolio:', error.message, error.code, error.details)
        throw new Error(`Failed to create human portfolio: ${error?.message}`)
      }

      if (!newPortfolio) {
        console.error('[ensureHumanPortfolio] No portfolio returned from insert')
        throw new Error('Failed to create human portfolio: No data returned')
      }

      const createdPortfolio = newPortfolio as HumanPortfolio
      console.log('[ensureHumanPortfolio] Portfolio created successfully:', createdPortfolio.id)
      return createdPortfolio
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

      const updateData: any = { metadata: updatedMetadata }
      const { data, error } = await (supabase
        .from('portfolios') as any)
        .update(updateData)
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

