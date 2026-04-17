import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { PENDING_CONTACT_INVITE_META_KEY } from '@/lib/auth/contact-invite-metadata'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/activate
 *
 * Clears the invite placeholder state for the current user:
 * - Removes `ausna_pending_contact_invite` from user_metadata when set.
 * - Sets the user’s human portfolio row(s) still marked `is_pseudo` to non-pseudo.
 *
 * Typical call: after the user sets a password (reset-password or Join Ausna).
 * Also used when a pending invitee declines activation on a space invite: we release
 * the placeholder, then the client signs them out while they stay on the space.
 */
export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let serviceClient: ReturnType<typeof createServiceClient>
    try {
      serviceClient = createServiceClient()
    } catch {
      return NextResponse.json({ error: 'Service client not configured' }, { status: 500 })
    }

    // 1. Clear pending invite metadata flag
    const existingMeta = (user.user_metadata as Record<string, unknown>) || {}
    if (existingMeta[PENDING_CONTACT_INVITE_META_KEY]) {
      const { [PENDING_CONTACT_INVITE_META_KEY]: _removed, ...cleanedMeta } = existingMeta
      await serviceClient.auth.admin.updateUserById(user.id, {
        user_metadata: cleanedMeta,
      })
    }

    // 2. Convert pseudo human portfolio(s) to non-pseudo
    await serviceClient
      .from('portfolios')
      .update({ is_pseudo: false })
      .eq('type', 'human')
      .eq('user_id', user.id)
      .eq('is_pseudo', true)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[activate] error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
