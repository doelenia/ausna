'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { uploadAvatar } from '@/lib/storage/avatars-server'
import { generateSlug } from '@/lib/portfolio/helpers'

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
    const avatarFile = formData.get('avatar') as File | null

    // Validate type
    if (type !== 'projects' && type !== 'community') {
      return {
        success: false,
        error: 'Invalid portfolio type. Only projects and communities can be created.',
      }
    }

    // Validate name
    if (!name || !name.trim()) {
      return {
        success: false,
        error: 'Portfolio name is required',
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

    // Create portfolio metadata structure
    const metadata: any = {
      basic: {
        name: name.trim(),
        description: '',
        avatar: '',
      },
      pinned: [],
      settings: {},
      members: [user.id], // Creator is automatically a member
      managers: [user.id], // Creator is automatically a manager
    }

    // Create portfolio
    const { data: portfolio, error: createError } = await supabase
      .from('portfolios')
      .insert({
        type: type as 'projects' | 'community',
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

    // Trigger background interest processing if description exists (fire-and-forget)
    // Note: Currently description starts empty, but this handles future cases
    const description = metadata.basic.description || ''
    if (description.trim().length > 0) {
      try {
        // Use absolute URL - in server actions, we need the full URL
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        // Use fetch without await - fire and forget
        fetch(`${baseUrl}/api/process-portfolio-interests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            portfolioId: portfolio.id,
            userId: user.id,
            isPersonalPortfolio: false, // New portfolios are not personal
            description,
          }),
        }).catch((error) => {
          // Log error but don't fail portfolio creation
          console.error('Failed to trigger background interest processing:', error)
        })
      } catch (error) {
        // Don't fail portfolio creation if interest processing trigger fails
        console.error('Error triggering background interest processing:', error)
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

