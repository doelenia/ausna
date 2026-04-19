import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPortfolioManager, isPortfolioCreator } from '@/lib/portfolio/helpers'

/**
 * POST /api/portfolios/[portfolioId]/managers/invite — Promote an existing member to manager immediately.
 * Only creators and managers may call this route.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { portfolioId } = params
    const { userId, message } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    if (userId === user.id) {
      return NextResponse.json(
        { error: 'Cannot invite yourself' },
        { status: 400 }
      )
    }

    // Check if user is manager or creator
    const isCreator = await isPortfolioCreator(portfolioId, user.id)
    const isManager = await isPortfolioManager(portfolioId, user.id)

    if (!isCreator && !isManager) {
      return NextResponse.json(
        { error: 'Only managers and creators can invite managers' },
        { status: 403 }
      )
    }

    // Get portfolio info
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

    // Only projects, activities, and communities can have managers
    if (portfolio.type === 'human') {
      return NextResponse.json(
        { error: 'Only projects, activities, and communities can have managers' },
        { status: 400 }
      )
    }

    const metadata = portfolio.metadata as any
    const members = metadata?.members || []
    const managers = metadata?.managers || []

    // User must be a member to become a manager
    if (!members.includes(userId)) {
      return NextResponse.json(
        { error: 'User must be a member before becoming a manager' },
        { status: 400 }
      )
    }

    // Check if user is already a manager
    if (managers.includes(userId)) {
      return NextResponse.json(
        { error: 'User is already a manager' },
        { status: 400 }
      )
    }

    // Check if user is the creator (creator is automatically a manager)
    if (portfolio.user_id === userId) {
      return NextResponse.json(
        { error: 'Creator is automatically a manager' },
        { status: 400 }
      )
    }

    // Verify invited user exists
    const { data: userPortfolio, error: userError } = await supabase
      .from('portfolios')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'human')
      .maybeSingle()

    if (userError || !userPortfolio) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const { data: existingJoinRequest } = await supabase
      .from('portfolio_join_requests')
      .select('id')
      .eq('portfolio_id', portfolioId)
      .eq('applicant_user_id', userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingJoinRequest) {
      return NextResponse.json(
        {
          error:
            'This user has a pending join request. Resolve it before sending a manager invitation.',
        },
        { status: 400 }
      )
    }

    const { data: existingPendingInvite } = await supabase
      .from('portfolio_invitations')
      .select('id, invitation_type')
      .eq('portfolio_id', portfolioId)
      .eq('invitee_id', userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingPendingInvite && existingPendingInvite.invitation_type !== 'manager') {
      return NextResponse.json(
        { error: 'Invitation already sent' },
        { status: 400 }
      )
    }

    const trimmedInviteMessage =
      message && typeof message === 'string' && message.trim().length > 0 ? message.trim() : null

    // Add user to managers (same outcome as accepting a manager invite; no separate accept step).
    const updatedManagers = [...managers, userId]
    const updatedMetadata = {
      ...metadata,
      managers: updatedManagers,
    }

    const { error: rpcError } = await supabase.rpc('update_portfolio_members', {
      portfolio_id: portfolioId,
      new_members: members,
    })

    if (rpcError) {
      console.error('Error syncing members via RPC, trying direct update:', rpcError)
      const { error: directUpdateError } = await supabase
        .from('portfolios')
        .update({ metadata: updatedMetadata })
        .eq('id', portfolioId)

      if (directUpdateError) {
        console.error('Error adding manager (direct update):', directUpdateError)
        return NextResponse.json(
          { error: `Failed to add manager: ${directUpdateError.message || directUpdateError.code}` },
          { status: 500 }
        )
      }
    } else {
      const { error: managerUpdateError } = await supabase
        .from('portfolios')
        .update({ metadata: updatedMetadata })
        .eq('id', portfolioId)

      if (managerUpdateError) {
        console.error('Error updating managers:', managerUpdateError)
        return NextResponse.json({ error: 'Failed to update managers' }, { status: 500 })
      }
    }

    const acceptedAt = new Date().toISOString()
    const { data: upgradedRows, error: upgradeError } = await supabase
      .from('portfolio_invitations')
      .update({
        status: 'accepted',
        accepted_at: acceptedAt,
        message: trimmedInviteMessage,
      })
      .eq('portfolio_id', portfolioId)
      .eq('invitee_id', userId)
      .eq('invitation_type', 'manager')
      .eq('status', 'pending')
      .select('id')

    if (upgradeError) {
      console.error('Error finalizing legacy manager invitation:', upgradeError)
    }

    if (!upgradedRows?.length) {
      const { error: insertInvError } = await supabase.from('portfolio_invitations').insert({
        portfolio_id: portfolioId,
        inviter_id: user.id,
        invitee_id: userId,
        status: 'accepted',
        accepted_at: acceptedAt,
        invitation_type: 'manager',
        message: trimmedInviteMessage,
      })
      if (insertInvError) {
        console.error('Error recording manager promotion:', insertInvError)
      }
    }

    const basic = metadata?.basic || {}
    const portfolioName = basic.name || 'this space'
    const customMessage = trimmedInviteMessage ? `\n\nMessage: ${trimmedInviteMessage}` : ''

    const { error: messageError } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: userId,
      text: `added you as a manager of ${portfolioName} (space)${customMessage}`,
    })

    if (messageError) {
      console.error('Error sending manager promotion message:', messageError)
    }

    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/process-portfolio-interests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId,
          userId,
          isPersonalPortfolio: false,
          description: null,
        }),
      }).catch((err) => console.error('Failed to trigger portfolio interest processing:', err))
    } catch (e) {
      console.error('Error triggering portfolio interest processing:', e)
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

