import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canCreateNoteInPortfolio } from '@/lib/notes/helpers'

export const dynamic = 'force-dynamic'

/**
 * POST /api/portfolios/can-create-all
 * Body: { portfolio_ids: string[], user_ids: string[] }
 * Returns for each portfolio_id whether ALL users in user_ids can create a note there.
 * Used when assigning a note with collaborators: only portfolios where every collaborator can post are allowed.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const portfolio_ids = body.portfolio_ids as string[] | undefined
    const user_ids = body.user_ids as string[] | undefined

    if (!Array.isArray(portfolio_ids) || !Array.isArray(user_ids)) {
      return NextResponse.json(
        { error: 'portfolio_ids and user_ids arrays are required' },
        { status: 400 }
      )
    }

    const uniquePortfolioIds = [...new Set(portfolio_ids)].slice(0, 50)
    const uniqueUserIds = [...new Set(user_ids)].slice(0, 20)

    const result: Record<string, boolean> = {}
    for (const portfolioId of uniquePortfolioIds) {
      let allCan = true
      for (const userId of uniqueUserIds) {
        const can = await canCreateNoteInPortfolio(portfolioId, userId)
        if (!can) {
          allCan = false
          break
        }
      }
      result[portfolioId] = allCan
    }

    return NextResponse.json({ result })
  } catch (error: any) {
    console.error('can-create-all error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
