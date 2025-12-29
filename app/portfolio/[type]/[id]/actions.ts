'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { Portfolio, isProjectPortfolio, isDiscussionPortfolio, isHumanPortfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'

interface UpdatePortfolioResult {
  success: boolean
  error?: string
}

interface DeletePortfolioResult {
  success: boolean
  error?: string
}

interface SubPortfolio {
  id: string
  type: 'projects' | 'discussion'
  name: string
  avatar?: string
  slug: string
}

interface GetSubPortfoliosResult {
  success: boolean
  projects?: SubPortfolio[]
  discussions?: SubPortfolio[]
  error?: string
}

/**
 * Get sub-portfolios for a given portfolio
 * For human portfolios: returns projects and discussions where user is a member
 * For project/discussion portfolios: returns portfolios where hosts contains this portfolio ID
 */
export async function getSubPortfolios(portfolioId: string): Promise<GetSubPortfoliosResult> {
  try {
    const supabase = await createClient()
    
    // Get the portfolio to determine its type
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    const portfolioData = portfolio as Portfolio

    if (isHumanPortfolio(portfolioData)) {
      // For human portfolios: fetch projects and discussions where user is a member
      const userId = portfolioData.user_id

      // Fetch all projects and discussions, then filter by membership
      // Note: PostgREST doesn't have great support for JSONB array contains, so we fetch and filter
      const { data: allProjects, error: projectsError } = await supabase
        .from('portfolios')
        .select('id, type, slug, metadata')
        .eq('type', 'projects')
        .order('created_at', { ascending: false })
        .limit(100)

      const { data: allDiscussions, error: discussionsError } = await supabase
        .from('portfolios')
        .select('id, type, slug, metadata')
        .eq('type', 'discussion')
        .order('created_at', { ascending: false })
        .limit(10)

      if (projectsError || discussionsError) {
        return {
          success: false,
          error: 'Failed to fetch sub-portfolios',
        }
      }

      // Filter projects where user is a member
      const projects = (allProjects || [])
        .filter((p: any) => {
          const metadata = p.metadata as any
          const members = metadata?.members || []
          return Array.isArray(members) && members.includes(userId)
        })
        .map((p: any) => {
          const basic = getPortfolioBasic(p as Portfolio)
          return {
            id: p.id,
            type: 'projects' as const,
            name: basic.name,
            avatar: basic.avatar,
            slug: p.slug,
          }
        })

      // Filter discussions where user is a member
      const discussions = (allDiscussions || [])
        .filter((p: any) => {
          const metadata = p.metadata as any
          const members = metadata?.members || []
          return Array.isArray(members) && members.includes(userId)
        })
        .map((p: any) => {
          const basic = getPortfolioBasic(p as Portfolio)
          return {
            id: p.id,
            type: 'discussion' as const,
            name: basic.name,
            avatar: basic.avatar,
            slug: p.slug,
          }
        })

      return {
        success: true,
        projects,
        discussions,
      }
    } else if (isProjectPortfolio(portfolioData) || isDiscussionPortfolio(portfolioData)) {
      // For project/discussion portfolios: fetch portfolios where hosts contains this portfolio ID
      // Fetch all projects and discussions, then filter by hosts
      const { data: allSubPortfolios, error: subError } = await supabase
        .from('portfolios')
        .select('id, type, slug, metadata')
        .in('type', ['projects', 'discussion'])
        .order('created_at', { ascending: false })

      if (subError) {
        return {
          success: false,
          error: 'Failed to fetch sub-portfolios',
        }
      }

      // Filter portfolios where hosts array contains this portfolio ID
      const filtered = (allSubPortfolios || []).filter((p: any) => {
        const metadata = p.metadata as any
        const hosts = metadata?.hosts || []
        return Array.isArray(hosts) && hosts.includes(portfolioId)
      })

      // Separate into projects and discussions
      const projects: SubPortfolio[] = []
      const discussions: SubPortfolio[] = []

      filtered.forEach((p: any) => {
        const basic = getPortfolioBasic(p as Portfolio)
        const subPortfolio: SubPortfolio = {
          id: p.id,
          type: p.type as 'projects' | 'discussion',
          name: basic.name,
          avatar: basic.avatar,
          slug: p.slug,
        }

        if (p.type === 'projects') {
          projects.push(subPortfolio)
        } else if (p.type === 'discussion') {
          discussions.push(subPortfolio)
        }
      })

      return {
        success: true,
        projects,
        discussions,
      }
    }

    return {
      success: false,
      error: 'Invalid portfolio type',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

export async function updatePortfolio(
  formData: FormData
): Promise<UpdatePortfolioResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    const portfolioId = formData.get('portfolioId') as string
    const name = formData.get('name') as string
    const description = formData.get('description') as string | null
    const avatarFile = formData.get('avatar') as File | null

    if (!portfolioId) {
      return {
        success: false,
        error: 'Portfolio ID is required',
      }
    }

    // Check ownership
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('user_id, metadata')
      .eq('id', portfolioId)
      .single()

    if (!portfolio || portfolio.user_id !== user.id) {
      return {
        success: false,
        error: 'You do not have permission to update this portfolio',
      }
    }

    // Get current metadata
    const currentMetadata = (portfolio.metadata as any) || {}
    const basicMetadata = currentMetadata.basic || {}

    // Update basic metadata
    const updatedMetadata = {
      ...currentMetadata,
      basic: {
        ...basicMetadata,
        name: name || basicMetadata.name,
        description: description !== null ? description : basicMetadata.description,
        avatar: basicMetadata.avatar, // Will be updated separately if avatar file is provided
      },
    }

    // Update portfolio
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({
        metadata: updatedMetadata,
      })
      .eq('id', portfolioId)

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to update portfolio',
      }
    }

    // Handle avatar upload if provided
    if (avatarFile && avatarFile.size > 0) {
      try {
        const { uploadAvatar } = await import('@/lib/storage/avatars-server')
        const avatarResult = await uploadAvatar(portfolioId, avatarFile)

        // Update portfolio with avatar URL
        await supabase
          .from('portfolios')
          .update({
            metadata: {
              ...updatedMetadata,
              basic: {
                ...updatedMetadata.basic,
                avatar: avatarResult.url,
              },
            },
          })
          .eq('id', portfolioId)
      } catch (avatarError: any) {
        // Avatar upload failed, but portfolio was updated
        console.error('Failed to upload avatar:', avatarError)
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    // Re-throw redirect errors so Next.js can handle them
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

export async function deletePortfolio(portfolioId: string): Promise<DeletePortfolioResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Check ownership and portfolio type
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('user_id, type')
      .eq('id', portfolioId)
      .single()

    if (!portfolio || portfolio.user_id !== user.id) {
      return {
        success: false,
        error: 'You do not have permission to delete this portfolio',
      }
    }

    // Prevent deletion of human portfolios
    if (portfolio.type === 'human') {
      return {
        success: false,
        error: 'Human portfolios cannot be deleted',
      }
    }

    // Delete portfolio
    const { error: deleteError } = await supabase
      .from('portfolios')
      .delete()
      .eq('id', portfolioId)

    if (deleteError) {
      return {
        success: false,
        error: deleteError.message || 'Failed to delete portfolio',
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    // Re-throw redirect errors so Next.js can handle them
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}
