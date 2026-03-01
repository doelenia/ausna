import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isPortfolioManager, isPortfolioCreator } from '@/lib/portfolio/helpers'

/** Apply member list update to portfolio (uses service client so RLS does not block e.g. member leaving). */
async function applyMembersUpdate(
  portfolioId: string,
  metadata: any,
  updatedMembers: string[],
  updatedManagers: string[],
  updatedMemberRoles: Record<string, string>
) {
  const supabase = createServiceClient()
  const { error: rpcError } = await supabase.rpc('update_portfolio_members', {
    portfolio_id: portfolioId,
    new_members: updatedMembers,
  })
  const nextMetadata = {
    ...metadata,
    members: updatedMembers,
    managers: updatedManagers,
    memberRoles: updatedMemberRoles,
  }
  if (rpcError) {
    const { error: directError } = await supabase
      .from('portfolios')
      .update({ metadata: nextMetadata })
      .eq('id', portfolioId)
    if (directError) throw directError
  } else {
    const { error: metaError } = await supabase
      .from('portfolios')
      .update({ metadata: nextMetadata })
      .eq('id', portfolioId)
    if (metaError) throw metaError
  }
}

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

    // Projects, communities, and activities can have members
    if (portfolio.type !== 'projects' && portfolio.type !== 'community' && portfolio.type !== 'activities') {
      return NextResponse.json(
        { error: 'Only projects, communities, and activities can have members' },
        { status: 400 }
      )
    }

    const metadata = portfolio.metadata as any
    const properties = metadata?.properties || {}
    const isExternalActivity = portfolio.type === 'activities' && properties.external === true

    // External activities: owner/manager cannot remove other members (only self-removal/leave allowed)
    if (!isSelfRemoval && isExternalActivity) {
      return NextResponse.json(
        { error: 'Cannot remove members from external activities' },
        { status: 403 }
      )
    }
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

        // Transfer creator: update portfolio.user_id and managers (use service client so RLS does not block)
        const serviceSupabase = createServiceClient()
        const { error: creatorUpdateError } = await serviceSupabase
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
        let updatedMembers = members
        if (isMember) {
          updatedMembers = members.filter((id: string) => id !== userId)
        }
        const memberRoles = metadata?.memberRoles || {}
        const updatedMemberRoles = { ...memberRoles }
        delete updatedMemberRoles[userId]

        try {
          await applyMembersUpdate(
            portfolioId,
            metadata,
            updatedMembers,
            updatedManagersForTransfer,
            updatedMemberRoles
          )
        } catch (memberUpdateError: any) {
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
      const memberRoles: Record<string, string> = metadata?.memberRoles || {}

      if (isManager && !isCreator) {
        updatedManagers = managers.filter((id: string) => id !== userId)
        if (!isMember) {
          updatedMembers = [...members, userId]
        }
      } else if (isMember) {
        updatedMembers = members.filter((id: string) => id !== userId)
      }

      const updatedMemberRoles = { ...memberRoles }
      if (updatedMembers.indexOf(userId) === -1) delete updatedMemberRoles[userId]

      try {
        await applyMembersUpdate(portfolioId, metadata, updatedMembers, updatedManagers, updatedMemberRoles)
      } catch (updateError: any) {
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

    const updatedMembers = members.filter((id: string) => id !== userId)
    const updatedManagers = isManager
      ? managers.filter((id: string) => id !== userId)
      : managers
    const memberRoles: Record<string, string> = metadata?.memberRoles || {}
    const updatedMemberRoles = { ...memberRoles }
    delete updatedMemberRoles[userId]

    try {
      await applyMembersUpdate(portfolioId, metadata, updatedMembers, updatedManagers, updatedMemberRoles)
    } catch (updateError: any) {
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
