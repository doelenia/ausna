'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { uploadAvatar } from '@/lib/storage/avatars-server'
import { generateSlug, isPortfolioOwner } from '@/lib/portfolio/helpers'
import { getHumanPortfolio } from '@/lib/portfolio/human'

interface CreatePortfolioResult {
  success: boolean
  portfolioId?: string
  error?: string
}

export async function createPortfolio(
  formData: FormData
): Promise<CreatePortfolioResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Extract form data
    const type = formData.get('type') as string
    const name = formData.get('name') as string
    const fromPortfolioId = formData.get('fromPortfolioId') as string | null
    const avatarFile = formData.get('avatar') as File | null

    // Validate type
    if (type !== 'projects' && type !== 'discussion') {
      return {
        success: false,
        error: 'Invalid portfolio type. Only projects and discussions can be created.',
      }
    }

    // Validate name
    if (!name || !name.trim()) {
      return {
        success: false,
        error: 'Portfolio name is required',
      }
    }

    // Validate fromPortfolioId ownership if provided
    if (fromPortfolioId) {
      // First, verify that fromPortfolioId is actually a portfolio ID (exists in portfolios table)
      const { data: fromPortfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .select('id, user_id')
        .eq('id', fromPortfolioId)
        .maybeSingle()

      if (portfolioError || !fromPortfolio) {
        return {
          success: false,
          error: 'Invalid portfolio ID. The portfolio you are creating from does not exist.',
        }
      }

      // Verify ownership
      if (fromPortfolio.user_id !== user.id) {
        return {
          success: false,
          error: 'You do not own the portfolio you are creating from',
        }
      }
    }

    // Generate slug from name
    const baseSlug = generateSlug(name)
    let slug = baseSlug
    let slugCounter = 1

    // Ensure slug is unique for this type
    while (true) {
      const { data: existing } = await supabase
        .from('portfolios')
        .select('id')
        .eq('type', type)
        .eq('slug', slug)
        .single()

      if (!existing) {
        break
      }

      slug = `${baseSlug}-${slugCounter}`
      slugCounter++
    }

    // Get user's human portfolio to add as host
    const humanPortfolio = await getHumanPortfolio(user.id)
    const humanPortfolioId = humanPortfolio?.id

    // Create portfolio metadata structure
    const metadata: any = {
      basic: {
        name: name.trim(),
        description: '',
        avatar: '',
      },
      pinned: [],
      settings: {},
      members: [user.id], // Owner is automatically a member
    }

    // Build hosts array: always include user's human portfolio, plus fromPortfolioId if provided
    const hosts: string[] = []
    
    // Add user's human portfolio if it exists
    if (humanPortfolioId) {
      hosts.push(humanPortfolioId)
    }
    
    // Add fromPortfolioId if provided (and it's different from human portfolio)
    if (fromPortfolioId && fromPortfolioId !== humanPortfolioId) {
      hosts.push(fromPortfolioId)
    }
    
    // Set hosts if we have any
    if (hosts.length > 0) {
      metadata.hosts = hosts
    }

    // Create portfolio
    const { data: portfolio, error: createError } = await supabase
      .from('portfolios')
      .insert({
        type: type as 'projects' | 'discussion',
        slug,
        user_id: user.id,
        metadata,
      })
      .select()
      .single()

    if (createError || !portfolio) {
      // Log error for debugging
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to create portfolio:', {
          error: createError,
          type,
          slug,
          userId: user.id,
        })
      }
      return {
        success: false,
        error: createError?.message || 'Failed to create portfolio',
      }
    }

    // Ensure portfolio has an ID
    if (!portfolio.id) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Portfolio created but missing ID:', portfolio)
      }
      return {
        success: false,
        error: 'Portfolio created but missing ID',
      }
    }

    // Upload avatar after portfolio creation if provided
    if (avatarFile && avatarFile.size > 0) {
      try {
        const avatarResult = await uploadAvatar(portfolio.id, avatarFile)
        
        // Update portfolio with avatar URL
        await supabase
          .from('portfolios')
          .update({
            metadata: {
              ...metadata,
              basic: {
                ...metadata.basic,
                avatar: avatarResult.url,
              },
            },
          })
          .eq('id', portfolio.id)
      } catch (avatarError: any) {
        // Avatar upload failed, but portfolio was created
        // Log error but don't fail the creation
        console.error('Failed to upload avatar:', avatarError)
      }
    }

    // Log success for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Portfolio created successfully:', {
        id: portfolio.id,
        type,
        slug,
        name: metadata.basic.name,
      })
    }

    return {
      success: true,
      portfolioId: portfolio.id,
    }
  } catch (error: any) {
    // Re-throw redirect errors so Next.js can handle them
    // Next.js redirect() throws an error with digest starting with 'NEXT_REDIRECT'
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

