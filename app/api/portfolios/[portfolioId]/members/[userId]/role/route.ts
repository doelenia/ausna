import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPortfolioManager, isPortfolioCreator } from '@/lib/portfolio/helpers'

/**
 * PUT /api/portfolios/[portfolioId]/members/[userId]/role - Update member role
 * Only managers and creators can update member roles
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { portfolioId: string; userId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { portfolioId, userId } = params
    const { role } = await request.json()

    // Allow users to update their own role, or managers/creators to update any member's role
    const isUpdatingOwnRole = user.id === userId
    const isCreator = await isPortfolioCreator(portfolioId, user.id)
    const isManager = await isPortfolioManager(portfolioId, user.id)

    if (!isUpdatingOwnRole && !isCreator && !isManager) {
      return NextResponse.json(
        { error: 'You can only update your own role, or you must be a manager/creator to update other members\' roles' },
        { status: 403 }
      )
    }

    // Get portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, metadata, user_id')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return NextResponse.json(
        { error: 'Portfolio not found' },
        { status: 404 }
      )
    }

    // Only projects and communities have member roles
    if (portfolio.type !== 'projects' && portfolio.type !== 'community') {
      return NextResponse.json(
        { error: 'Only projects and communities have member roles' },
        { status: 400 }
      )
    }

    // Validate that the user is a member or manager
    const metadata = portfolio.metadata as any
    const members = metadata?.members || []
    const managers = metadata?.managers || []

    if (!members.includes(userId) && !managers.includes(userId) && portfolio.user_id !== userId) {
      return NextResponse.json(
        { error: 'User is not a member of this portfolio' },
        { status: 400 }
      )
    }

    // Validate role (max 2 words)
    if (role && typeof role === 'string' && role.trim()) {
      const words = role.trim().split(/\s+/)
      if (words.length > 2) {
        return NextResponse.json(
          { error: 'Role must be 2 words or less' },
          { status: 400 }
        )
      }
    }

    // Update memberRoles in metadata
    const currentMemberRoles = metadata?.memberRoles || {}
    const updatedMemberRoles = {
      ...currentMemberRoles,
    }

    if (role && typeof role === 'string' && role.trim()) {
      updatedMemberRoles[userId] = role.trim()
    } else {
      // Remove role if empty or null
      delete updatedMemberRoles[userId]
    }

    const updatedMetadata = {
      ...metadata,
      memberRoles: updatedMemberRoles,
    }

    // Update portfolio
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({
        metadata: updatedMetadata,
      })
      .eq('id', portfolioId)

    if (updateError) {
      console.error('Error updating member role:', updateError)
      return NextResponse.json(
        { error: 'Failed to update member role' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

