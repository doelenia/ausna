import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPortfolioManager, isPortfolioCreator } from '@/lib/portfolio/helpers'

/**
 * DELETE /api/portfolios/[portfolioId]/members/[userId] - Remove a member from a portfolio
 * Handles:
 * - Managers removing members (but not other managers)
 * - Managers removing themselves (requires creator transfer if they're the creator)
 * - Members removing themselves (leaving)
 */
export async function DELETE(
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
    const isSelfRemoval = userId === user.id

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

    // Only projects and communities can have members
    if (portfolio.type !== 'projects' && portfolio.type !== 'community') {
      return NextResponse.json(
        { error: 'Only projects and communities can have members' },
        { status: 400 }
      )
    }

    const metadata = portfolio.metadata as any
    const members = metadata?.members || []
    const managers = metadata?.managers || []
    const isCreator = portfolio.user_id === userId
    const isManager = managers.includes(userId)
    const isMember = members.includes(userId)

    // Handle self-removal (member leaving or manager removing themselves)
    if (isSelfRemoval) {
      // If creator is removing themselves as manager, they need to transfer creator first
      if (isCreator && isManager) {
        // Check if new creator is provided in request body
        const body = await request.json().catch(() => ({}))
        const newCreatorId = body.newCreatorId

        if (!newCreatorId) {
          return NextResponse.json(
            { 
              error: 'Creator transfer required',
              requiresCreatorTransfer: true,
              message: 'You must select a new creator before removing yourself as manager'
            },
            { status: 400 }
          )
        }

        // Validate new creator is a member or manager
        if (!members.includes(newCreatorId) && !managers.includes(newCreatorId) && portfolio.user_id !== newCreatorId) {
          return NextResponse.json(
            { error: 'New creator must be a member or manager' },
            { status: 400 }
          )
        }

        // Ensure new creator is in managers array
        const updatedManagersForTransfer = managers.includes(newCreatorId) 
          ? managers.filter((id: string) => id !== userId) // Remove old creator from managers
          : [...managers.filter((id: string) => id !== userId), newCreatorId] // Remove old creator, add new creator

        // Transfer creator: update portfolio.user_id and managers
        const { error: creatorUpdateError } = await supabase
          .from('portfolios')
          .update({
            user_id: newCreatorId,
            metadata: {
              ...metadata,
              managers: updatedManagersForTransfer,
            },
          })
          .eq('id', portfolioId)

        if (creatorUpdateError) {
          console.error('Error transferring creator:', creatorUpdateError)
          return NextResponse.json(
            { error: 'Failed to transfer creator' },
            { status: 500 }
          )
        }

        // After creator transfer, continue with member removal
        // Remove from members if they're a member
        let updatedMembers = members
        if (isMember) {
          updatedMembers = members.filter((id: string) => id !== userId)
        }

        // Update portfolio to remove from members
        const { error: memberUpdateError } = await supabase
          .from('portfolios')
          .update({
            metadata: {
              ...metadata,
              members: updatedMembers,
              managers: updatedManagersForTransfer, // Already updated, but keep it
            },
          })
          .eq('id', portfolioId)

        if (memberUpdateError) {
          console.error('Error removing member after creator transfer:', memberUpdateError)
          return NextResponse.json(
            { error: 'Failed to remove member' },
            { status: 500 }
          )
        }

        return NextResponse.json({ success: true })
      }

      // If manager (but not creator) is removing themselves, move them to members instead of removing
      let updatedManagers = managers
      let updatedMembers = members
      
      if (isManager && !isCreator) {
        // Remove from managers
        updatedManagers = managers.filter((id: string) => id !== userId)
        // Add to members if not already a member
        if (!isMember) {
          updatedMembers = [...members, userId]
        }
        // If already a member, keep them in members
      } else if (isMember) {
        // Regular member leaving - remove from members
        updatedMembers = members.filter((id: string) => id !== userId)
      }

      // Update portfolio
      const { error: updateError } = await supabase
        .from('portfolios')
        .update({
          metadata: {
            ...metadata,
            members: updatedMembers,
            managers: updatedManagers,
          },
        })
        .eq('id', portfolioId)

      if (updateError) {
        console.error('Error removing member:', updateError)
        return NextResponse.json(
          { error: 'Failed to remove member' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true })
    }

    // Handle removing other users (only managers/creators can do this)
    const currentUserIsCreator = await isPortfolioCreator(portfolioId, user.id)
    const currentUserIsManager = await isPortfolioManager(portfolioId, user.id)

    if (!currentUserIsCreator && !currentUserIsManager) {
      return NextResponse.json(
        { error: 'Only managers and creators can remove members' },
        { status: 403 }
      )
    }

    // Cannot remove creator
    if (isCreator) {
      return NextResponse.json(
        { error: 'Cannot remove the creator' },
        { status: 400 }
      )
    }

    // Managers cannot remove other managers (only creators can)
    if (isManager && !currentUserIsCreator) {
      return NextResponse.json(
        { error: 'Managers cannot remove other managers' },
        { status: 403 }
      )
    }

    // Check if user is a member
    if (!isMember) {
      return NextResponse.json(
        { error: 'User is not a member' },
        { status: 400 }
      )
    }

    // Remove from members array
    const updatedMembers = members.filter((id: string) => id !== userId)
    
    // If removing a manager, also remove from managers
    const updatedManagers = isManager 
      ? managers.filter((id: string) => id !== userId)
      : managers

    // Update portfolio
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({
        metadata: {
          ...metadata,
          members: updatedMembers,
          managers: updatedManagers,
        },
      })
      .eq('id', portfolioId)

    if (updateError) {
      console.error('Error removing member:', updateError)
      return NextResponse.json(
        { error: 'Failed to remove member' },
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
