import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isPortfolioCreator } from '@/lib/portfolio/helpers'
import { applyMembersUpdate } from '@/lib/portfolio/applyMembersUpdate'

/**
 * DELETE /api/portfolios/[portfolioId]/managers/[userId]
 * Remove a user's manager role only (they stay a member). Space owner (portfolio creator) only.
 *
 * Portfolios RLS allows UPDATE only when auth.uid() = portfolios.user_id; this route uses
 * applyMembersUpdate (service role) after verifying the caller is the creator.
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

    const isCreator = await isPortfolioCreator(portfolioId, user.id)
    if (!isCreator) {
      return NextResponse.json(
        { error: 'Only the space owner can remove a manager role' },
        { status: 403 }
      )
    }

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('id, type, metadata, user_id')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 })
    }

    if (portfolio.type === 'human') {
      return NextResponse.json({ error: 'Invalid portfolio type' }, { status: 400 })
    }

    const metadata = portfolio.metadata as Record<string, any>
    const properties = metadata?.properties || {}
    if (properties.external === true) {
      return NextResponse.json(
        { error: 'Manager changes are not available for this activity type' },
        { status: 403 }
      )
    }

    if (portfolio.user_id === userId) {
      return NextResponse.json(
        { error: 'Cannot remove manager role from the space owner' },
        { status: 400 }
      )
    }

    const members: string[] = metadata?.members || []
    const managers: string[] = metadata?.managers || []

    if (!managers.includes(userId)) {
      return NextResponse.json({ error: 'User is not a manager' }, { status: 400 })
    }

    const updatedManagers = managers.filter((id: string) => id !== userId)
    const updatedMembers = members.includes(userId) ? members : [...members, userId]
    const memberRoles: Record<string, string> = metadata?.memberRoles || {}

    try {
      await applyMembersUpdate(portfolioId, metadata, updatedMembers, updatedManagers, memberRoles)
    } catch (updateError: unknown) {
      console.error('Error demoting manager:', updateError)
      return NextResponse.json({ error: 'Failed to remove manager role' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('API route error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
