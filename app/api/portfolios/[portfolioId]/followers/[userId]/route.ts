import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPortfolioCreator, isPortfolioManager } from '@/lib/portfolio/helpers'

/**
 * DELETE /api/portfolios/[portfolioId]/followers/[userId]
 * Remove a user's follow subscription (space owner or manager only).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { portfolioId: string; userId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { portfolioId, userId } = params

    if (!portfolioId || !userId) {
      return NextResponse.json({ error: 'portfolioId and userId are required' }, { status: 400 })
    }

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type')
      .eq('id', portfolioId)
      .maybeSingle()

    if (portfolioError || !portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    if (portfolio.type === 'human') {
      return NextResponse.json({ error: 'Invalid portfolio type' }, { status: 400 })
    }

    const canManage =
      (await isPortfolioCreator(portfolioId, user.id)) ||
      (await isPortfolioManager(portfolioId, user.id))

    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: existing, error: selectError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', userId)
      .maybeSingle()

    if (selectError) {
      console.error('Error checking subscription:', selectError)
      return NextResponse.json({ error: 'Failed to verify subscription' }, { status: 500 })
    }

    if (!existing) {
      return NextResponse.json({ error: 'User is not a follower of this portfolio' }, { status: 404 })
    }

    const { error: deleteError } = await supabase
      .from('subscriptions')
      .delete()
      .eq('portfolio_id', portfolioId)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('Error removing follower subscription:', deleteError)
      return NextResponse.json({ error: 'Failed to remove follower' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('API route error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
