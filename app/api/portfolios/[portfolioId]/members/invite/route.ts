import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPortfolioManager, isPortfolioCreator } from '@/lib/portfolio/helpers'

/**
 * POST /api/portfolios/[portfolioId]/members/invite - Invite a user to join a portfolio
 * Sends a message invitation similar to friend request
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
    const { userId } = await request.json()

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
        { error: 'Only managers and creators can invite members' },
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

    // Only projects and communities can have members
    if (portfolio.type !== 'projects' && portfolio.type !== 'community') {
      return NextResponse.json(
        { error: 'Only projects and communities can have members' },
        { status: 400 }
      )
    }

    // Check if user is already a member or manager
    const metadata = portfolio.metadata as any
    const members = metadata?.members || []
    const managers = metadata?.managers || []

    if (members.includes(userId) || managers.includes(userId) || portfolio.user_id === userId) {
      return NextResponse.json(
        { error: 'User is already a member or manager' },
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

    // Check if there's already a pending invitation
    const { data: existingInvitation } = await supabase
      .from('portfolio_invitations')
      .select('id')
      .eq('portfolio_id', portfolioId)
      .eq('invitee_id', userId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'Invitation already sent' },
        { status: 400 }
      )
    }

    // Create invitation record
    const { data: invitation, error: invitationError } = await supabase
      .from('portfolio_invitations')
      .insert({
        portfolio_id: portfolioId,
        inviter_id: user.id,
        invitee_id: userId,
        status: 'pending',
      })
      .select()
      .single()

    if (invitationError) {
      console.error('Error creating invitation:', invitationError)
      return NextResponse.json(
        { error: 'Failed to create invitation' },
        { status: 500 }
      )
    }

    // Get portfolio name for the invitation message
    const basic = metadata?.basic || {}
    const portfolioName = basic.name || 'this portfolio'

    // Send invitation message
    const { error: messageError } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: userId,
        text: `invited you to join ${portfolioName} (${portfolio.type === 'projects' ? 'project' : 'community'})`,
      })

    if (messageError) {
      console.error('Error sending invitation message:', messageError)
      // Don't fail the whole request if message fails, invitation is already created
    }

    return NextResponse.json({ success: true, invitation })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

