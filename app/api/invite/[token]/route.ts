import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  findHumanPortfolioByEmail,
  updateHumanPortfolioMetadataById,
} from '@/lib/portfolio/admin-helpers'

export const dynamic = 'force-dynamic'

function isValidEmail(email: string): boolean {
  const trimmed = email.trim()
  if (!trimmed) return false
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

/**
 * GET /api/invite/[token] - validate invite and return basic info
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token
    const supabase = await createClient()
    const serviceClient = createServiceClient()

    if (!token) {
      return NextResponse.json(
        { error: 'Invalid invite token.' },
        { status: 400 }
      )
    }

    const { data: invite, error } = await serviceClient
      .from('user_invites')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (error || !invite) {
      return NextResponse.json(
        { error: 'Invite not found.' },
        { status: 404 }
      )
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: 'This invite has already been used or cancelled.' },
        { status: 400 }
      )
    }

    const now = new Date()
    const expiresAt = invite.expires_at
      ? new Date(invite.expires_at as string)
      : null
    if (expiresAt && now > expiresAt) {
      return NextResponse.json(
        { error: 'This invite has expired.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      email: invite.invitee_email,
      name: invite.invitee_name,
    })
  } catch (error: any) {
    console.error('Error in GET /api/invite/[token]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/invite/[token] - complete invite, set password, login, convert pseudo
 *
 * Body: { email, name, password }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const body = await request.json()
    const email: string = body?.email || ''
    const name: string = body?.name || ''
    const password: string = body?.password || ''

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Invalid email format.' },
        { status: 400 }
      )
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const serviceClient = createServiceClient()
    const token = params.token

    if (!token) {
      return NextResponse.json(
        { error: 'Invalid invite token.' },
        { status: 400 }
      )
    }

    const { data: invite, error } = await serviceClient
      .from('user_invites')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (error || !invite) {
      return NextResponse.json(
        { error: 'Invite not found.' },
        { status: 404 }
      )
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: 'This invite has already been used or cancelled.' },
        { status: 400 }
      )
    }

    const now = new Date()
    const expiresAt = invite.expires_at
      ? new Date(invite.expires_at as string)
      : null
    if (expiresAt && now > expiresAt) {
      return NextResponse.json(
        { error: 'This invite has expired.' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()
    const trimmedName = name.trim() || invite.invitee_name || ''

    // Find or create auth user for this email
    const { data: listResult, error: listError } =
      await serviceClient.auth.admin.listUsers({
        email: normalizedEmail,
        perPage: 1,
      } as any)

    if (listError) {
      console.error('Error checking auth user in invite completion:', listError)
      return NextResponse.json(
        { error: 'Failed to complete invite.' },
        { status: 500 }
      )
    }

    let authUserId: string | null = null
    const existingUser =
      (listResult as any)?.users?.find(
        (u: any) =>
          typeof u.email === 'string' &&
          u.email.toLowerCase() === normalizedEmail
      ) ?? null

      if (existingUser) {
      authUserId = existingUser.id as string
      // Update password and confirm email
      await serviceClient.auth.admin.updateUserById(authUserId, {
        email: normalizedEmail,
        email_confirm: true,
        password,
      } as any)
    } else {
      const { data: createdUser, error: createError } =
        await serviceClient.auth.admin.createUser({
          email: normalizedEmail,
          email_confirm: true,
          password,
          user_metadata: {
            full_name: trimmedName,
            name: trimmedName,
          },
        })

      if (createError || !createdUser?.user) {
        console.error(
          'Error creating auth user in invite completion:',
          createError
        )
        return NextResponse.json(
          { error: 'Failed to complete invite.' },
          { status: 500 }
        )
      }

      authUserId = createdUser.user.id as string
    }

    if (!authUserId) {
      return NextResponse.json(
        { error: 'Failed to complete invite.' },
        { status: 500 }
      )
    }

    // Convert pseudo portfolio to non-pseudo and update name/email if possible
    let convertedPortfolioId: string | null = null

    if (invite.pseudo_portfolio_id) {
      try {
        // Ensure we can see portfolio even if RLS would hide it
        const { data: pseudo } = await serviceClient
          .from('portfolios')
          .select('*')
          .eq('id', invite.pseudo_portfolio_id)
          .eq('type', 'human')
          .maybeSingle()

        if (pseudo) {
          // Update owner to this auth user and clear is_pseudo
          const { error: updateError } = await serviceClient
            .from('portfolios')
            .update({
              user_id: authUserId,
              is_pseudo: false,
            })
            .eq('id', pseudo.id)

          if (updateError) {
            console.error(
              'Error converting pseudo portfolio to non-pseudo:',
              updateError
            )
          } else {
            // Also update basic metadata name/email if provided
            const metadata = pseudo.metadata as any
            const existingBasic = metadata?.basic || {}
            const updatedMetadata = {
              ...metadata,
              basic: {
                ...existingBasic,
                name: trimmedName || existingBasic.name,
              },
              email: normalizedEmail,
            }
            await updateHumanPortfolioMetadataById(
              pseudo.id as string,
              updatedMetadata
            )
            convertedPortfolioId = pseudo.id as string
          }
        } else {
          // Fallback: if no portfolio was found by ID, try by email
          const byEmail = await findHumanPortfolioByEmail(normalizedEmail)
          if (byEmail) {
            const { error: updateError } = await serviceClient
              .from('portfolios')
              .update({
                user_id: authUserId,
                is_pseudo: false,
              })
              .eq('id', byEmail.id)
            if (!updateError) {
              const metadata = byEmail.metadata as any
              const existingBasic = metadata?.basic || {}
              const updatedMetadata = {
                ...metadata,
                basic: {
                  ...existingBasic,
                  name: trimmedName || existingBasic.name,
                },
                email: normalizedEmail,
              }
              await updateHumanPortfolioMetadataById(
                byEmail.id as string,
                updatedMetadata
              )
              convertedPortfolioId = byEmail.id as string
            }
          }
        }
      } catch (err) {
        console.error('Error updating pseudo portfolio on invite completion:', err)
      }
    }

    // Fallback: if this invite doesn't have a pseudo_portfolio_id (older invites),
    // or conversion by id failed to set convertedPortfolioId, try resolving by email.
    if (!convertedPortfolioId && !invite.pseudo_portfolio_id) {
      try {
        const byEmail = await findHumanPortfolioByEmail(normalizedEmail)
        if (byEmail) {
          const { error: updateError } = await serviceClient
            .from('portfolios')
            .update({
              user_id: authUserId,
              is_pseudo: false,
            })
            .eq('id', byEmail.id)

          if (!updateError) {
            const metadata = byEmail.metadata as any
            const existingBasic = metadata?.basic || {}
            const updatedMetadata = {
              ...metadata,
              basic: {
                ...existingBasic,
                name: trimmedName || existingBasic.name,
              },
              email: normalizedEmail,
            }
            await updateHumanPortfolioMetadataById(
              byEmail.id as string,
              updatedMetadata
            )
            convertedPortfolioId = byEmail.id as string
          }
        }
      } catch (err) {
        console.error(
          'Error updating portfolio by email on invite completion:',
          err
        )
      }
    }

    // Mark invite as used
    const { error: updateInviteError } = await supabase
      .from('user_invites')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
      })
      .eq('id', invite.id)

    if (updateInviteError) {
      console.error('Error marking invite as used:', updateInviteError)
    }

    // Log the user in by creating a session
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (signInError) {
      console.error('Error signing in after invite completion:', signInError)
      return NextResponse.json(
        { error: 'Invite completed, but failed to sign in. Please log in manually.' },
        { status: 200 }
      )
    }

    // Optional: notify inviter and any existing friends that this user joined Ausna
    try {
      const inviterId: string | null = invite.inviter_user_id || null

      // Find all accepted friendships where this user is involved
      const { data: friendships } = await supabase
        .from('friends')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${authUserId},friend_id.eq.${authUserId}`)
        .eq('status', 'accepted')

      const friendIds = new Set<string>()
      ;(friendships || []).forEach((f: any) => {
        const otherId = f.user_id === authUserId ? f.friend_id : f.user_id
        if (otherId) friendIds.add(otherId)
      })

      // Resolve basic display name for notifications
      let displayName = trimmedName || `User ${String(authUserId).slice(0, 8)}`
      if (convertedPortfolioId) {
        const { data: humanPortfolio } = await supabase
          .from('portfolios')
          .select('metadata')
          .eq('id', convertedPortfolioId)
          .maybeSingle()
        if (humanPortfolio) {
          const meta = humanPortfolio.metadata as any
          const basic = meta?.basic || {}
          if (basic.name) {
            displayName = basic.name as string
          }
        }
      }

      // Create a short system message notification to each friend,
      // including the inviter if present in friendIds.
      await Promise.all(
        Array.from(friendIds).map(async (friendId) => {
          if (!friendId || friendId === authUserId) return
          try {
            await supabase.from('messages').insert({
              sender_id: authUserId,
              receiver_id: friendId,
              text: `${displayName} joined Ausna`,
              message_type: 'text',
            })
            // Clear any completed state so conversation appears active
            await supabase
              .from('conversation_completions')
              .delete()
              .or(
                `and(user_id.eq.${authUserId},partner_id.eq.${friendId}),and(user_id.eq.${friendId},partner_id.eq.${authUserId})`
              )
          } catch (notifyError) {
            console.error(
              'Error sending joined notification to friend:',
              notifyError
            )
          }
        })
      )
    } catch (notifyErr) {
      console.error('Error while sending friend-joined notifications:', notifyErr)
    }

    return NextResponse.json({ success: true, user_id: authUserId })
  } catch (error: any) {
    console.error('Error in POST /api/invite/[token]:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

