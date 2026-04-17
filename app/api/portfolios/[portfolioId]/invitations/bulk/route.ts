import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPortfolioCreator, isPortfolioManager, getPortfolioBasic } from '@/lib/portfolio/helpers'
import { createServiceClient } from '@/lib/supabase/service'
import { sendSpaceInviteEmail } from '@/lib/email/spaceInvite'
import { getSiteUrl } from '@/lib/email/resend'
import { findAuthUserIdByEmail } from '@/lib/auth-admin'
import { findHumanPortfolioByEmailWithService } from '@/lib/portfolio/admin-helpers'
import {
  isPendingContactInviteUser,
  PENDING_CONTACT_INVITE_META_KEY,
} from '@/lib/auth/contact-invite-metadata'

type InviteKind = 'follow' | 'join'

/** An invite item resolved to a user ID + kind after email-based lookup/creation. */
type ResolvedInvite = {
  inviteeId: string
  kind: InviteKind
  /** Provided name for the invitee (email-based invites only). */
  inviteeName?: string | null
  /** Provided email (email-based invites only). */
  inviteeEmail?: string | null
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function formatTimeText(metadata: any): string | null {
  const dt = metadata?.properties?.activity_datetime
  if (!dt || typeof dt !== 'object' || !dt.start) return null
  try {
    const start = new Date(dt.start)
    if (Number.isNaN(start.getTime())) return null
    const end = dt.end ? new Date(dt.end) : null
    const startText = start.toLocaleString()
    const endText = end && !Number.isNaN(end.getTime()) ? end.toLocaleString() : null
    return endText ? `${startText} – ${endText}` : startText
  } catch {
    return null
  }
}

function formatLocationText(metadata: any): string | null {
  const loc = metadata?.properties?.location
  if (!loc || typeof loc !== 'object') return null
  if (loc.online) {
    return 'Online'
  }
  const parts = [loc.line1, loc.city, loc.state, loc.country].filter((x) => typeof x === 'string' && x.trim().length > 0)
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * Ensure a pseudo auth user + human portfolio exist for the given email.
 * Returns the auth user ID, or null on failure.
 * Mirrors the logic in /api/contacts/invite.
 */
async function ensurePseudoUserForEmail(
  serviceClient: ReturnType<typeof createServiceClient>,
  inviterId: string,
  normalizedEmail: string,
  trimmedName: string
): Promise<string | null> {
  // 1. Find or create auth user
  let inviteeUserId = await findAuthUserIdByEmail(serviceClient, normalizedEmail)

  if (!inviteeUserId) {
    const { data: createdUser, error: createError } = await serviceClient.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: false,
      user_metadata: {
        full_name: trimmedName,
        name: trimmedName,
        [PENDING_CONTACT_INVITE_META_KEY]: true,
      },
    })

    if (createError || !createdUser?.user) {
      console.error('[bulk-invite] Error creating invitee auth user:', createError)
      return null
    }
    inviteeUserId = createdUser.user.id
  }

  if (!inviteeUserId || inviteeUserId === inviterId) return null

  // 2. Ensure pseudo human portfolio
  const existingPortfolio = await findHumanPortfolioByEmailWithService(normalizedEmail)

  if (existingPortfolio) {
    // Force pseudo status
    await serviceClient
      .from('portfolios')
      .update({ is_pseudo: true })
      .eq('id', existingPortfolio.id)
  } else {
    const { error: insertError } = await serviceClient.from('portfolios').insert({
      type: 'human',
      user_id: inviteeUserId,
      slug: `invite-${normalizedEmail.replace(/[^a-z0-9]/g, '-')}`,
      is_pseudo: true,
      metadata: {
        basic: { name: trimmedName, description: '', avatar: '' },
        settings: {},
        email: normalizedEmail,
      },
    })

    if (insertError) {
      console.error('[bulk-invite] Error creating pseudo human portfolio:', insertError)
    }
  }

  // 3. Ensure friend relation between inviter and invitee
  const supabaseAnon = createServiceClient()
  const { data: existingFriendship } = await supabaseAnon
    .from('friends')
    .select('id')
    .or(
      `and(user_id.eq.${inviterId},friend_id.eq.${inviteeUserId}),and(user_id.eq.${inviteeUserId},friend_id.eq.${inviterId})`
    )
    .maybeSingle()

  if (!existingFriendship) {
    await supabaseAnon.from('friends').insert({
      user_id: inviterId,
      friend_id: inviteeUserId,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
  }

  return inviteeUserId
}

/** Same Join Ausna (`/invite/:token`) row as contact invites — needed for space popup → Activate account. */
async function ensurePendingUserInviteForSpace(
  serviceClient: ReturnType<typeof createServiceClient>,
  inviterUserId: string,
  normalizedEmail: string,
  inviteeDisplayName: string,
  inviteeAuthUserId: string
): Promise<void> {
  const { data: existing } = await serviceClient
    .from('user_invites')
    .select('id')
    .eq('inviter_user_id', inviterUserId)
    .eq('invitee_email', normalizedEmail)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return

  const { data: hp } = await serviceClient
    .from('portfolios')
    .select('id')
    .eq('type', 'human')
    .eq('user_id', inviteeAuthUserId)
    .maybeSingle()

  const token = crypto.randomUUID().replace(/-/g, '')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { error } = await serviceClient.from('user_invites').insert({
    inviter_user_id: inviterUserId,
    invitee_email: normalizedEmail,
    invitee_name: inviteeDisplayName,
    pseudo_portfolio_id: hp?.id ?? null,
    token,
    status: 'pending',
    expires_at: expiresAt.toISOString(),
    metadata: {},
  })

  if (error) {
    console.error('[bulk-invite] user_invites insert failed:', error)
  }
}

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
    if (!portfolioId) {
      return NextResponse.json({ error: 'portfolioId is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const invitesRaw = Array.isArray(body?.invites) ? body.invites : []
    const messageRaw = typeof body?.message === 'string' ? body.message : ''
    const message = messageRaw.trim().length > 0 ? messageRaw.trim().slice(0, 200) : null

    const isCreator = await isPortfolioCreator(portfolioId, user.id)
    const isManager = await isPortfolioManager(portfolioId, user.id)
    if (!isCreator && !isManager) {
      return NextResponse.json({ error: 'Only managers and creators can invite' }, { status: 403 })
    }

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, slug, metadata, user_id')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    if (portfolio.type === 'human') {
      return NextResponse.json({ error: 'Cannot invite to a human portfolio' }, { status: 400 })
    }

    const serviceClient = (() => {
      try {
        return createServiceClient()
      } catch {
        return null
      }
    })()

    // ----------------------------------------------------------------
    // Normalise invite items — resolve email-based items to user IDs
    // ----------------------------------------------------------------
    const resolvedInvites: ResolvedInvite[] = []
    const preErrors: Array<{ raw: any; error: string }> = []

    for (const rawItem of invitesRaw) {
      const kind: InviteKind = rawItem?.kind === 'follow' ? 'follow' : 'join'

      if (rawItem?.inviteeId) {
        // Existing ID-based invite
        const id = String(rawItem.inviteeId).trim()
        if (id) resolvedInvites.push({ inviteeId: id, kind })
        continue
      }

      // Email-based invite
      const emailRaw = String(rawItem?.email || '').trim().toLowerCase()
      const nameRaw = String(rawItem?.name || '').trim()

      if (!isValidEmail(emailRaw)) {
        preErrors.push({ raw: rawItem, error: 'Invalid or missing email' })
        continue
      }
      if (!nameRaw) {
        preErrors.push({ raw: rawItem, error: 'Name is required for email-based invites' })
        continue
      }
      if (!serviceClient) {
        preErrors.push({ raw: rawItem, error: 'Service role not configured; cannot invite by email' })
        continue
      }

      const inviteeUserId = await ensurePseudoUserForEmail(serviceClient, user.id, emailRaw, nameRaw)
      if (!inviteeUserId) {
        preErrors.push({ raw: rawItem, error: 'Failed to prepare invitee account for ' + emailRaw })
        continue
      }

      resolvedInvites.push({
        inviteeId: inviteeUserId,
        kind,
        inviteeName: nameRaw,
        inviteeEmail: emailRaw,
      })
    }

    if (resolvedInvites.length === 0 && preErrors.length > 0) {
      return NextResponse.json({ error: preErrors[0]?.error || 'No valid invites' }, { status: 400 })
    }

    // ----------------------------------------------------------------
    // Build shared invite metadata
    // ----------------------------------------------------------------
    const metadata = portfolio.metadata as any
    const members = Array.isArray(metadata?.members) ? (metadata.members as string[]) : []
    const managers = Array.isArray(metadata?.managers) ? (metadata.managers as string[]) : []
    const portfolioOwnerId = String(portfolio.user_id || '')
    const membersCount = Array.from(
      new Set<string>([portfolioOwnerId, ...managers.map(String), ...members.map(String)].filter(Boolean))
    ).length
    const basic = getPortfolioBasic(portfolio as any)
    const portfolioName = basic?.name || 'this space'
    const portfolioDescription =
      (basic as any)?.description || (portfolio.metadata as any)?.basic?.description || null
    const portfolioAvatar =
      (basic as any)?.avatar || (portfolio.metadata as any)?.basic?.avatar || null
    const portfolioEmoji =
      (basic as any)?.emoji || (portfolio.metadata as any)?.basic?.emoji || null

    const inviterName = await (async () => {
      try {
        const { data: inviterPortfolio } = await supabase
          .from('portfolios')
          .select('user_id, slug, metadata')
          .eq('type', 'human')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!inviterPortfolio) return 'Someone'
        const inviterBasic = getPortfolioBasic(inviterPortfolio as any)
        return inviterBasic?.name || (inviterPortfolio as any)?.slug || 'Someone'
      } catch {
        return 'Someone'
      }
    })()

    const hostNames = await (async (): Promise<string[] | null> => {
      try {
        const hostIds = (portfolio.metadata as any)?.properties?.host_project_ids
        if (!Array.isArray(hostIds) || hostIds.length === 0) return null
        const ids = hostIds.filter((x: any) => typeof x === 'string' && x.length > 0).slice(0, 5)
        if (ids.length === 0) return null
        const { data: hosts } = await supabase
          .from('portfolios')
          .select('id, slug, metadata')
          .in('id', ids)
        const names =
          (hosts || [])
            .map((h: any) => {
              const b = getPortfolioBasic(h as any)
              return b?.name || h.slug || null
            })
            .filter(Boolean) as string[]
        return names.length > 0 ? names : null
      } catch {
        return null
      }
    })()

    const timeText = formatTimeText(portfolio.metadata)
    const locationText = formatLocationText(portfolio.metadata)
    const siteUrl = getSiteUrl()
    const spacePath = `/space/${encodeURIComponent((portfolio as any).slug || portfolio.id)}`
    const ctaUrl = `${siteUrl}${spacePath}`

    const created: Array<{ inviteeId: string; kind: InviteKind; invitationId: string }> = []
    const skipped: Array<{ inviteeId: string; kind: InviteKind; reason: string }> = []
    const errors: Array<{ inviteeId: string; kind: InviteKind; error: string }> = []
    const email: Array<
      | { inviteeId: string; kind: InviteKind; status: 'sent'; messageId: string }
      | { inviteeId: string; kind: InviteKind; status: 'resent'; messageId: string }
      | { inviteeId: string; kind: InviteKind; status: 'skipped'; reason: string }
      | { inviteeId: string; kind: InviteKind; status: 'error'; error: string }
    > = []

    const sendInviteEmail = async (inv: ResolvedInvite, sentStatus: 'sent' | 'resent' = 'sent') => {
      const inviteeId = inv.inviteeId
      const kind = inv.kind
      if (!serviceClient) {
        email.push({
          inviteeId,
          kind,
          status: 'skipped',
          reason: 'Email sending not configured (missing Supabase service credentials)',
        })
        return
      }

      try {
        const { data: inviteeAuth } = await serviceClient.auth.admin.getUserById(inviteeId)
        const toEmail = inviteeAuth?.user?.email || inv.inviteeEmail || ''

        if (!toEmail) {
          email.push({ inviteeId, kind, status: 'skipped', reason: 'Invitee has no email' })
          return
        }

        // Non-pseudo users should receive the standard CTA even if originally invited by email.
        const { data: inviteeHumanPortfolio } = await serviceClient
          .from('portfolios')
          .select('is_pseudo')
          .eq('type', 'human')
          .eq('user_id', inviteeId)
          .maybeSingle()
        const isPseudoPortfolio = !!inviteeHumanPortfolio?.is_pseudo
        const isNewUser =
          isPendingContactInviteUser(inviteeAuth?.user?.user_metadata as Record<string, unknown>) ||
          isPseudoPortfolio

        if (isNewUser) {
          const normInviteEmail = (inv.inviteeEmail || toEmail || '').trim().toLowerCase()
          if (normInviteEmail && isValidEmail(normInviteEmail)) {
            await ensurePendingUserInviteForSpace(
              serviceClient,
              user.id,
              normInviteEmail,
              (inv.inviteeName || '').trim() || 'Member',
              inviteeId
            )
          }
        }

        let newUserCtaLinks: { joinUrl: string; followUrl: string; passUrl: string } | null = null

        if (isNewUser) {
          try {
            // One magic link only: Supabase invalidates the previous OTP when a new magic link is
            // issued for the same email — parallel join/follow/pass links left only the last valid.
            const redirectTo = `${siteUrl}${spacePath}`
            const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
              type: 'magiclink',
              email: toEmail,
              options: { redirectTo },
            } as any)
            const magicUrl =
              !linkError && linkData?.properties?.action_link
                ? linkData.properties.action_link
                : redirectTo
            if (linkError) {
              console.warn('[bulk-invite] magic link generation:', linkError.message)
            }
            newUserCtaLinks = { joinUrl: magicUrl, followUrl: magicUrl, passUrl: magicUrl }
          } catch (linkErr) {
            console.warn('[bulk-invite] Failed to generate magic links:', linkErr)
          }
        }

        const result = await sendSpaceInviteEmail({
          toEmail,
          inviterName,
          inviteeName: inv.inviteeName || null,
          actionLabel: kind === 'follow' ? 'Follow' : 'Join',
          spaceName: portfolioName,
          spaceDescription: portfolioDescription,
          spaceAvatarUrl: portfolioAvatar,
          spaceEmoji: portfolioEmoji,
          inviteMessage: message,
          membersCount,
          hostNames,
          timeText,
          locationText,
          ctaUrl,
          newUserCtaLinks,
        })
        if (result.success) {
          email.push({ inviteeId, kind, status: sentStatus, messageId: result.messageId })
        } else {
          email.push({ inviteeId, kind, status: 'error', error: result.error })
          console.warn('[invite-email] send failed', { inviteeId, kind, error: result.error })
        }
      } catch (e: any) {
        const msg = e?.message || 'Failed to send email'
        email.push({ inviteeId, kind, status: 'error', error: msg })
        console.warn('[invite-email] send failed', { inviteeId, kind, error: msg })
      }
    }

    for (const inv of resolvedInvites) {
      const inviteeId = inv.inviteeId
      const kind = inv.kind

      if (inviteeId === user.id) {
        skipped.push({ inviteeId, kind, reason: 'Cannot invite yourself' })
        continue
      }

      const isAlreadyMemberOrManager =
        inviteeId === portfolioOwnerId || members.includes(inviteeId) || managers.includes(inviteeId)

      if (kind === 'join' && isAlreadyMemberOrManager) {
        skipped.push({ inviteeId, kind, reason: 'Already a member/manager' })
        continue
      }

      if (kind === 'follow') {
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', inviteeId)
          .eq('portfolio_id', portfolioId)
          .maybeSingle()
        if (existingSub) {
          skipped.push({ inviteeId, kind, reason: 'Already following' })
          continue
        }
      }

      if (kind === 'join') {
        const { data: existingJoinRequest } = await supabase
          .from('portfolio_join_requests')
          .select('id')
          .eq('portfolio_id', portfolioId)
          .eq('applicant_user_id', inviteeId)
          .eq('status', 'pending')
          .maybeSingle()
        if (existingJoinRequest) {
          skipped.push({ inviteeId, kind, reason: 'Has a pending join request' })
          continue
        }
      }

      const { data: existingInvitation } = await supabase
        .from('portfolio_invitations')
        .select('id')
        .eq('portfolio_id', portfolioId)
        .eq('invitee_id', inviteeId)
        .eq('status', 'pending')
        .maybeSingle()
      if (existingInvitation) {
        await sendInviteEmail(inv, 'resent')
        skipped.push({ inviteeId, kind, reason: 'Invitation already pending (email resent)' })
        continue
      }

      const invitationType = kind === 'follow' ? 'follow' : 'member'
      const { data: invitation, error: invitationError } = await supabase
        .from('portfolio_invitations')
        .insert({
          portfolio_id: portfolioId,
          inviter_id: user.id,
          invitee_id: inviteeId,
          status: 'pending',
          invitation_type: invitationType,
          message,
        })
        .select('id')
        .single()

      if (invitationError || !invitation?.id) {
        errors.push({
          inviteeId,
          kind,
          error: invitationError?.message || 'Failed to create invitation',
        })
        continue
      }

      const text =
        kind === 'follow'
          ? `invited you to follow ${portfolioName} (space)`
          : `invited you to join ${portfolioName} (space)`

      await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: inviteeId,
        text: message ? `${text}\n\nMessage: ${message}` : text,
      })

      await sendInviteEmail(inv, 'sent')

      created.push({ inviteeId, kind, invitationId: String(invitation.id) })
    }

    return NextResponse.json({ success: true, created, skipped, errors, email, preErrors })
  } catch (error: any) {
    console.error('bulk invitations error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
