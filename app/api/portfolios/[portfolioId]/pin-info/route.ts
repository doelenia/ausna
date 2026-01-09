import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getPinnedItemsCount, isPortfolioOwner } from '@/lib/portfolio/helpers'
import { Portfolio } from '@/types/portfolio'

/**
 * GET /api/portfolios/[portfolioId]/pin-info - Get pin information for a portfolio
 * Returns pin count and whether user can pin items
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { portfolioId: string } }
) {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const portfolioId = params.portfolioId

    if (!portfolioId) {
      return NextResponse.json(
        { success: false, error: 'Portfolio ID is required' },
        { status: 400 }
      )
    }

    // Get portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return NextResponse.json(
        { success: false, error: 'Portfolio not found' },
        { status: 404 }
      )
    }

    // Check if user is owner
    const canPin = await isPortfolioOwner(portfolioId, user.id)
    
    // Get pin count
    const pinCount = getPinnedItemsCount(portfolio as Portfolio)

    return NextResponse.json({
      success: true,
      pinCount,
      max: 9,
      canPin,
    })
  } catch (error: any) {
    console.error('[API /portfolios/[portfolioId]/pin-info] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
        pinCount: 0,
        max: 9,
        canPin: false,
      },
      { status: 500 }
    )
  }
}

