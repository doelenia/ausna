import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSiteUrl } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/recovery-link
 * Body: { returnTo?: string }
 *
 * Generates a Supabase recovery link for the currently authenticated user
 * without sending an email, so the client can redirect to it immediately.
 * Used by the "Activate account" button in the space invite popups.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const returnTo = typeof body?.returnTo === 'string' ? body.returnTo.trim() : ''

    const siteUrl = getSiteUrl()
    const resetPath = returnTo
      ? `/reset-password?returnTo=${encodeURIComponent(returnTo)}`
      : '/reset-password'
    const redirectTo = siteUrl + resetPath

    let serviceClient: ReturnType<typeof createServiceClient>
    try {
      serviceClient = createServiceClient()
    } catch {
      return NextResponse.json({ error: 'Service client not configured' }, { status: 500 })
    }

    const { data, error } = await serviceClient.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
      options: { redirectTo },
    })

    if (error || !data?.properties?.action_link) {
      console.error('[recovery-link] generateLink error:', error)
      return NextResponse.json({ error: 'Could not generate recovery link' }, { status: 500 })
    }

    return NextResponse.json({ actionLink: data.properties.action_link })
  } catch (error: any) {
    console.error('[recovery-link] error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
