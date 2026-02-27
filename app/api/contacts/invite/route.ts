import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { findHumanPortfolioByEmail } from '@/lib/portfolio/admin-helpers'

export const dynamic = 'force-dynamic'

function isValidEmail(email: string): boolean {
  const trimmed = email.trim()
  if (!trimmed) return false
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return 'http://localhost:3000'
}

/**
 * POST /api/contacts/invite
 *
 * Body: { email: string, name: string, fromUserId?: string }
 *
 * - Validates email and name.
 * - Ensures a pseudo human portfolio exists for this email (creating one if needed).
 * - Creates a friend relation between inviter and the pseudo human's user account.
 * - Creates a user_invites record with a one-time token.
 * - Sends an invitation email via Supabase Auth Admin API.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email: string = body?.email || ''
    const name: string = body?.name || ''
    const fromUserId: string | undefined = body?.fromUserId
    const forceResend: boolean = body?.forceResend === true

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format.' },
        { status: 400 }
      )
    }

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Name is required.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const inviterUserId = fromUserId || user.id

    const normalizedEmail = email.trim().toLowerCase()
    const trimmedName = name.trim()

    const serviceClient = createServiceClient()

    // 1. Check for existing pending invite for this inviter + email
    const { data: existingInvite, error: existingInviteError } = await supabase
      .from('user_invites')
      .select('*')
      .eq('inviter_user_id', inviterUserId)
      .eq('invitee_email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingInviteError) {
      console.error('Error checking existing invite:', existingInviteError)
    }

    if (existingInvite) {
      const siteUrl = getSiteUrl()
      const inviteLink = `${siteUrl}/invite/${existingInvite.token}`

      if (!forceResend) {
        // Tell client an invite already exists so it can decide whether to resend
        return NextResponse.json(
          {
            error: 'Invite already pending for this email.',
            code: 'invite_already_pending',
            invite_link: inviteLink,
          },
          { status: 409 }
        )
      }

      // Resend path: reuse existing token and just send another email
      try {
        // Derive inviter display name
        let inviterName = 'Someone'
        const { data: inviterPortfolio } = await supabase
          .from('portfolios')
          .select('metadata')
          .eq('type', 'human')
          .eq('user_id', inviterUserId)
          .maybeSingle()

        if (inviterPortfolio) {
          const meta = inviterPortfolio.metadata as any
          const basic = meta?.basic || {}
          inviterName =
            (basic.name as string | undefined) ||
            (meta?.full_name as string | undefined) ||
            inviterName
        }

        const { data: emailResult, error: emailError } =
          await serviceClient.auth.admin.inviteUserByEmail(normalizedEmail, {
            redirectTo: inviteLink,
            data: {
              invited_by_name: inviterName,
            },
          } as any)

        if (emailError) {
          console.error('Error resending invite email:', emailError)
        } else {
          console.log('Resent invite email via Supabase:', emailResult)
        }
      } catch (err) {
        console.error('Exception when resending invite email:', err)
      }

      return NextResponse.json({ success: true, invite_link: inviteLink })
    }

    // 2. Ensure we have an auth user for this email (create if needed)
    const { data: listResult, error: listError } =
      await serviceClient.auth.admin.listUsers({
        email: normalizedEmail,
        perPage: 1,
      } as any)

    if (listError) {
      console.error('Error checking auth user for invite:', listError)
      return NextResponse.json(
        { error: 'Failed to prepare invitation.' },
        { status: 500 }
      )
    }

    let inviteeUserId: string | null = null
    const existingUser =
      (listResult as any)?.users?.find(
        (u: any) =>
          typeof u.email === 'string' &&
          u.email.toLowerCase() === normalizedEmail
      ) ?? null

    if (existingUser) {
      inviteeUserId = existingUser.id as string
    } else {
      // Create a new auth user in disabled / invite-only fashion
      const { data: createdUser, error: createError } =
        await serviceClient.auth.admin.createUser({
          email: normalizedEmail,
          email_confirm: false,
          user_metadata: {
            full_name: trimmedName,
            name: trimmedName,
          },
        })

      if (createError || !createdUser?.user) {
        console.error('Error creating invitee user:', createError)
        return NextResponse.json(
          { error: 'Failed to prepare invitation.' },
          { status: 500 }
        )
      }

      inviteeUserId = createdUser.user.id as string
    }

    if (!inviteeUserId) {
      return NextResponse.json(
        { error: 'Failed to prepare invitation.' },
        { status: 500 }
      )
    }

    if (inviteeUserId === inviterUserId) {
      return NextResponse.json(
        { error: 'You cannot invite yourself.' },
        { status: 400 }
      )
    }

    // 3. Ensure a (possibly pseudo) human portfolio exists for this email
    let pseudoPortfolioId: string | null = null
    const existingPortfolio = await findHumanPortfolioByEmail(normalizedEmail)

    if (existingPortfolio) {
      pseudoPortfolioId = existingPortfolio.id

      // For invites, ensure this portfolio is treated as pseudo until onboarding completes.
      // This mirrors the behavior in createHumanPortfolioWithProjects where new records
      // start as pseudo and are later upgraded to non-pseudo.
      try {
        const { error: updateError } = await serviceClient
          .from('portfolios')
          .update({ is_pseudo: true })
          .eq('id', existingPortfolio.id)

        if (updateError) {
          console.error(
            'Error forcing existing human portfolio to pseudo for invite:',
            updateError
          )
        }
      } catch (err) {
        console.error(
          'Exception while ensuring pseudo status for invite portfolio:',
          err
        )
      }
    } else {
      // Create a minimal pseudo human portfolio row using service client
      const basicMetadata = {
        basic: {
          name: trimmedName,
          description: '',
          avatar: '',
        },
        pinned: [],
        settings: {},
        email: normalizedEmail,
      }

      const { data: newPortfolio, error: insertError } = await serviceClient
        .from('portfolios')
        .insert({
          type: 'human',
          user_id: inviteeUserId,
          slug: `invite-${normalizedEmail.replace(/[^a-z0-9]/g, '-')}`,
          is_pseudo: true,
          metadata: basicMetadata,
        })
        .select()
        .single()

      if (insertError || !newPortfolio) {
        console.error('Error creating pseudo human portfolio for invite:', insertError)
        return NextResponse.json(
          { error: 'Failed to prepare invitation.' },
          { status: 500 }
        )
      }

      pseudoPortfolioId = newPortfolio.id as string
    }

    // 4. Ensure a friend relation exists (owner ↔ invitee user)
    const { data: existingFriendship } = await supabase
      .from('friends')
      .select('*')
      .or(
        `and(user_id.eq.${inviterUserId},friend_id.eq.${inviteeUserId}),and(user_id.eq.${inviteeUserId},friend_id.eq.${inviterUserId})`
      )
      .maybeSingle()

    if (!existingFriendship) {
      const { error: friendError } = await supabase
        .from('friends')
        .insert({
          user_id: inviterUserId,
          friend_id: inviteeUserId,
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })

      if (friendError) {
        console.error('Error creating friend relation for invite:', friendError)
        // Non-fatal; continue with invite creation
      }
    }

    // 5. Create user_invites row with token
    const token = crypto.randomUUID().replace(/-/g, '')
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const inviteInsert = await supabase
      .from('user_invites')
      .insert({
        inviter_user_id: inviterUserId,
        invitee_email: normalizedEmail,
        invitee_name: trimmedName,
        pseudo_portfolio_id: pseudoPortfolioId,
        token,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        metadata: {},
      })
      .select()
      .single()

    if (inviteInsert.error) {
      console.error('Error creating user_invites row:', inviteInsert.error)
      return NextResponse.json(
        { error: 'Failed to create invitation.' },
        { status: 500 }
      )
    }

    const siteUrl = getSiteUrl()
    const inviteLink = `${siteUrl}/invite/${token}`

    // Derive inviter display name for email metadata
    let inviterName = 'Someone'
    try {
      const { data: inviterPortfolio } = await supabase
        .from('portfolios')
        .select('metadata')
        .eq('type', 'human')
        .eq('user_id', inviterUserId)
        .maybeSingle()

      if (inviterPortfolio) {
        const meta = inviterPortfolio.metadata as any
        const basic = meta?.basic || {}
        inviterName =
          (basic.name as string | undefined) ||
          (meta?.full_name as string | undefined) ||
          inviterName
      }
    } catch (e) {
      console.error('Error resolving inviter name for invite email:', e)
    }

    // 6. Send invitation email via Supabase Auth Admin API
    try {
      const { data: emailResult, error: emailError } =
        await serviceClient.auth.admin.inviteUserByEmail(normalizedEmail, {
          redirectTo: inviteLink,
          data: {
            invited_by_name: inviterName,
          },
        } as any)

      if (emailError) {
        console.error('Error sending invite email:', emailError)
        // Do not fail the request if email sending fails; user_invites row exists
      } else {
        console.log('Invite email sent via Supabase:', emailResult)
      }
    } catch (err) {
      console.error('Exception when sending invite email:', err)
      // Non-fatal
    }

    return NextResponse.json({ success: true, invite_link: inviteLink })
  } catch (error: any) {
    console.error('Error in /api/contacts/invite:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

