import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'

export async function POST(
  request: NextRequest,
  { params }: { params: { portfolioId: string; inviteeId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { portfolioId, inviteeId } = params
    if (!portfolioId || !inviteeId) {
      return NextResponse.json({ error: 'portfolioId and inviteeId are required' }, { status: 400 })
    }

    if (inviteeId !== user.id) {
      return NextResponse.json({ error: 'You can only decline invitations sent to you' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const intent = body?.intent === 'follow_only' ? 'follow_only' : 'decline'
    const declineMessageRaw = typeof body?.message === 'string' ? body.message : ''
    const declineMessage =
      declineMessageRaw.trim().length > 0 ? declineMessageRaw.trim().slice(0, 500) : null

    const { data: invitation, error: findError } = await supabase
      .from('portfolio_invitations')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('invitee_id', inviteeId)
      .eq('status', 'pending')
      .maybeSingle()

    if (findError || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    }

    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('id, type, metadata, user_id')
      .eq('id', portfolioId)
      .maybeSingle()

    const basic = portfolio ? getPortfolioBasic(portfolio as any) : null
    const portfolioName = basic?.name || 'this space'

    if (intent === 'follow_only') {
      if (invitation.invitation_type !== 'member') {
        return NextResponse.json(
          { error: 'Follow-only resolution applies to membership invitations only' },
          { status: 400 }
        )
      }
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('portfolio_id', portfolioId)
        .maybeSingle()
      if (!subscription) {
        return NextResponse.json(
          { error: 'Follow the space first, then try again' },
          { status: 400 }
        )
      }
    }

    const storedDeclineMessage = intent === 'follow_only' ? null : declineMessage

    const { error: updateError } = await supabase
      .from('portfolio_invitations')
      .update({
        status: 'declined',
        declined_at: new Date().toISOString(),
        decline_message: storedDeclineMessage,
      })
      .eq('id', invitation.id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to decline invitation' }, { status: 500 })
    }

    let text: string
    if (intent === 'follow_only') {
      text = `followed ${portfolioName} (space) instead of joining as a member`
    } else {
      const kindLabel = invitation.invitation_type === 'follow' ? 'follow' : 'join'
      text = declineMessage
        ? `passed on your invite to ${kindLabel} ${portfolioName} (space)\n\nReason: ${declineMessage}`
        : `passed on your invite to ${kindLabel} ${portfolioName} (space)`
    }

    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: invitation.inviter_id,
      text,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('decline invitation error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

