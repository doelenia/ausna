import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/portfolios/[portfolioId]/invitations/[inviteeId] - Check invitation status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { portfolioId: string; inviteeId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ hasInvitation: false, status: null })
    }

    const { portfolioId, inviteeId } = params

    // Check invitation status
    const { data: invitation } = await supabase
      .from('portfolio_invitations')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('invitee_id', inviteeId)
      .eq('status', 'pending')
      .maybeSingle()

    if (!invitation) {
      return NextResponse.json({ hasInvitation: false, status: null })
    }

    // Determine the status from the user's perspective
    let status: 'pending_sent' | 'pending_received' | 'accepted' | null = null
    if (invitation.status === 'accepted') {
      status = 'accepted'
    } else if (invitation.inviter_id === user.id) {
      status = 'pending_sent'
    } else if (invitation.invitee_id === user.id) {
      status = 'pending_received'
    }

    return NextResponse.json({
      hasInvitation: true,
      status,
      invitation,
    })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/portfolios/[portfolioId]/invitations/[inviteeId] - Accept invitation
 */
export async function PUT(
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

    // Verify the invitee is the current user
    if (inviteeId !== user.id) {
      return NextResponse.json(
        { error: 'You can only accept invitations sent to you' },
        { status: 403 }
      )
    }

    // Find pending invitation
    const { data: invitation, error: findError } = await supabase
      .from('portfolio_invitations')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('invitee_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()

    if (findError || !invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      )
    }

    const isManagerInvitation = invitation.invitation_type === 'manager'

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

    if (isManagerInvitation) {
      // Handle manager invitation acceptance
      // User must already be a member to become a manager
      if (!members.includes(user.id) && portfolio.user_id !== user.id) {
        return NextResponse.json(
          { error: 'You must be a member before becoming a manager' },
          { status: 400 }
        )
      }

      // Check if user is already a manager
      if (managers.includes(user.id) || portfolio.user_id === user.id) {
        // User is already a manager, update invitation status to accepted
        await supabase
          .from('portfolio_invitations')
          .update({
            status: 'accepted',
            accepted_at: new Date().toISOString(),
          })
          .eq('id', invitation.id)

        return NextResponse.json({ success: true, message: 'Already a manager' })
      }

      // Add user to managers array (avoid duplicates)
      const updatedManagers = managers.includes(user.id) ? managers : [...managers, user.id]

      // Update portfolio metadata
      const updatedMetadata = {
        ...metadata,
        managers: updatedManagers,
      }

      // Update portfolio using RPC function (bypasses RLS for the update)
      const { error: updateError } = await supabase.rpc('update_portfolio_members', {
        portfolio_id: portfolioId,
        new_members: members, // Keep existing members
      })

      // If RPC fails, try direct update
      if (updateError) {
        console.error('Error adding manager via RPC, trying direct update:', updateError)
        const { error: directUpdateError } = await supabase
          .from('portfolios')
          .update({
            metadata: updatedMetadata,
          })
          .eq('id', portfolioId)

        if (directUpdateError) {
          console.error('Error adding manager (direct update):', directUpdateError)
          return NextResponse.json(
            { error: `Failed to add manager: ${directUpdateError.message || directUpdateError.code}` },
            { status: 500 }
          )
        }
      } else {
        // If RPC succeeded, still need to update managers separately
        const { error: managerUpdateError } = await supabase
          .from('portfolios')
          .update({
            metadata: updatedMetadata,
          })
          .eq('id', portfolioId)

        if (managerUpdateError) {
          console.error('Error updating managers:', managerUpdateError)
          return NextResponse.json(
            { error: 'Failed to update managers' },
            { status: 500 }
          )
        }
      }

      // Update invitation status
      const { error: invitationUpdateError } = await supabase
        .from('portfolio_invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invitation.id)

      if (invitationUpdateError) {
        console.error('Error updating invitation status:', invitationUpdateError)
        // Don't fail if invitation update fails, manager was already added
      }

      // Get portfolio name for the acceptance message
      const basic = metadata?.basic || {}
      const portfolioName = basic.name || 'this portfolio'

      // Send acceptance message for manager invitation
      await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: invitation.inviter_id,
          text: `accepted your invitation to become a manager of ${portfolioName} (${portfolio.type === 'projects' ? 'project' : 'community'})`,
        })

      // Trigger background interest processing for joining portfolio (fire-and-forget)
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        
        // Use fetch without await - fire and forget
        fetch(`${baseUrl}/api/process-portfolio-interests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            portfolioId,
            userId: user.id,
            isPersonalPortfolio: false, // Joining a portfolio is not personal
            description: null, // Will be read from portfolio in the API route
          }),
        }).catch((error) => {
          // Log error but don't fail invitation acceptance
          console.error('Failed to trigger background interest processing:', error)
        })
      } catch (error) {
        // Don't fail invitation acceptance if interest processing trigger fails
        console.error('Error triggering background interest processing:', error)
      }

      return NextResponse.json({ success: true })
    }

    // Handle member invitation acceptance (existing logic)
    // Check if user is already a member or manager
    if (members.includes(user.id) || managers.includes(user.id) || portfolio.user_id === user.id) {
      // User is already a member, update invitation status to accepted
      await supabase
        .from('portfolio_invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invitation.id)

      return NextResponse.json({ success: true, message: 'Already a member' })
    }

    // Add user to members array (avoid duplicates)
    const updatedMembers = members.includes(user.id) ? members : [...members, user.id]

    // Update portfolio metadata - preserve all existing metadata structure
    const updatedMetadata = {
      ...metadata,
      members: updatedMembers,
    }

    // Update portfolio using RPC function (bypasses RLS for the update)
    const { error: updateError } = await supabase.rpc('update_portfolio_members', {
      portfolio_id: portfolioId,
      new_members: updatedMembers,
    })

    // If RPC fails, try direct update (should work with the new RLS policy)
    if (updateError) {
      console.error('Error adding member via RPC, trying direct update:', updateError)
      const { error: directUpdateError } = await supabase
        .from('portfolios')
        .update({
          metadata: updatedMetadata,
        })
        .eq('id', portfolioId)

      if (directUpdateError) {
        console.error('Error adding member (direct update):', directUpdateError)
        return NextResponse.json(
          { error: `Failed to add member: ${directUpdateError.message || directUpdateError.code}` },
          { status: 500 }
        )
      }
    }

    // Update invitation status
    const { error: invitationUpdateError } = await supabase
      .from('portfolio_invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invitation.id)

    if (invitationUpdateError) {
      console.error('Error updating invitation status:', invitationUpdateError)
      // Don't fail if invitation update fails, member was already added
    }

    // Get portfolio name for the acceptance message
    const basic = metadata?.basic || {}
    const portfolioName = basic.name || 'this portfolio'

    // Send acceptance message
    await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: invitation.inviter_id,
        text: `accepted your invitation to join ${portfolioName} (${portfolio.type === 'projects' ? 'project' : 'community'})`,
      })

      // Trigger background interest processing for joining portfolio (fire-and-forget)
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        
        // Use fetch without await - fire and forget
        fetch(`${baseUrl}/api/process-portfolio-interests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            portfolioId,
            userId: user.id,
            isPersonalPortfolio: false, // Joining a portfolio is not personal
            description: null, // Will be read from portfolio in the API route
          }),
        }).catch((error) => {
          // Log error but don't fail invitation acceptance
          console.error('Failed to trigger background interest processing:', error)
        })
      } catch (error) {
        // Don't fail invitation acceptance if interest processing trigger fails
        console.error('Error triggering background interest processing:', error)
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

/**
 * DELETE /api/portfolios/[portfolioId]/invitations/[inviteeId] - Cancel invitation
 */
export async function DELETE(
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

    // Find pending invitation
    const { data: invitation, error: findError } = await supabase
      .from('portfolio_invitations')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('invitee_id', inviteeId)
      .eq('status', 'pending')
      .maybeSingle()

    if (findError || !invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      )
    }

    // Only the inviter can cancel
    if (invitation.inviter_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the inviter can cancel the invitation' },
        { status: 403 }
      )
    }

    // Update invitation status to cancelled instead of deleting
    // This preserves the invitation in the database with status 'cancelled'
    // so it can be properly matched to invite messages for displaying the portfolio card
    const { data: updatedInvitation, error: updateError } = await supabase
      .from('portfolio_invitations')
      .update({
        status: 'cancelled',
      })
      .eq('id', invitation.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error canceling invitation:', updateError)
      console.error('Update error details:', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
      })
      return NextResponse.json(
        { 
          error: 'Failed to cancel invitation',
          details: updateError.message || updateError.code 
        },
        { status: 500 }
      )
    }

    console.log('Successfully cancelled invitation:', updatedInvitation)
    return NextResponse.json({ success: true, invitation: updatedInvitation })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

