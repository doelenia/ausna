import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function isValidEmail(email: string): boolean {
  const trimmed = email.trim()
  if (!trimmed) return false
  const emailRegex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

/**
 * GET /api/contacts/find-user-by-email?email=...
 *
 * Looks up a registered, non-pseudo human by email and returns minimal
 * profile info plus friend status relative to the current user.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const emailParam = searchParams.get('email')

    if (!emailParam || emailParam.trim().length === 0) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    if (!isValidEmail(emailParam)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    const emailLower = emailParam.trim().toLowerCase()

    // Find a non-pseudo human portfolio whose metadata.email matches this email.
    // We query a reasonable set and filter on the server to avoid relying on
    // JSON path operators that may not be available.
    const { data: portfolios, error: portfolioError } = await supabase
      .from('portfolios')
      .select('user_id, slug, metadata, is_pseudo')
      .eq('type', 'human')
      .limit(200)

    if (portfolioError) {
      console.error('Error searching portfolios by email:', portfolioError)
      return NextResponse.json(
        { error: 'Failed to look up user' },
        { status: 500 }
      )
    }

    const matchingPortfolio =
      portfolios?.find((p: any) => {
        if (p.is_pseudo) {
          return false
        }
        const metadata = p.metadata as any
        const emailMeta =
          (metadata?.email as string | undefined)?.toLowerCase() || ''
        return emailMeta === emailLower
      }) || null

    if (!matchingPortfolio) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Do not treat the current user as a "contact" result
    if (matchingPortfolio.user_id === user.id) {
      return NextResponse.json(
        { error: 'Cannot add yourself as a contact' },
        { status: 400 }
      )
    }

    // Check existing friendship between current user and found user
    const { data: friendship } = await supabase
      .from('friends')
      .select('*')
      .or(
        `and(user_id.eq.${user.id},friend_id.eq.${matchingPortfolio.user_id}),and(user_id.eq.${matchingPortfolio.user_id},friend_id.eq.${user.id})`
      )
      .maybeSingle()

    const isFriend = !!friendship && friendship.status === 'accepted'
    const hasPendingRequest =
      !!friendship && friendship.status === 'pending'

    const metadata = matchingPortfolio.metadata as any
    const basic = metadata?.basic || {}

    const responseUser = {
      id: matchingPortfolio.user_id as string,
      username: (matchingPortfolio.slug as string | null) || null,
      name:
        (basic.name as string | undefined) ||
        (matchingPortfolio.slug as string | null) ||
        null,
      avatar:
        (basic.avatar as string | undefined) ||
        (metadata?.avatar_url as string | undefined) ||
        null,
      isFriend,
      hasPendingRequest,
    }

    return NextResponse.json({ user: responseUser })
  } catch (error: any) {
    console.error('Error in find-user-by-email API:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

