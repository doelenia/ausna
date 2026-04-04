import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/auth/requireAuth'
import { DB_NON_HUMAN_TYPES } from '@/types/portfolio'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notes/portfolios - Get portfolio data for notes
 * Query params:
 *   - owner_ids: comma-separated list of owner account IDs
 *   - portfolio_ids: comma-separated list of portfolio IDs (for assigned projects)
 * 
 * Returns portfolio data keyed by owner_id and portfolio_id
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthApi()
    if (!auth.authorized) return auth.response
    const { user, supabase } = auth
    const { searchParams } = new URL(request.url)
    
    const ownerIdsParam = searchParams.get('owner_ids')
    const portfolioIdsParam = searchParams.get('portfolio_ids')
    
    const ownerIds = ownerIdsParam ? ownerIdsParam.split(',').filter(Boolean) : []
    const portfolioIds = portfolioIdsParam ? portfolioIdsParam.split(',').filter(Boolean) : []
    
    const result: {
      ownerPortfolios: Record<string, any>
      assignedPortfolios: Record<string, any>
    } = {
      ownerPortfolios: {},
      assignedPortfolios: {},
    }
    
    // Fetch owner human portfolios
    if (ownerIds.length > 0) {
      const { data: ownerPortfolios, error: ownerError } = await supabase
        .from('portfolios')
        .select('*')
        .eq('type', 'human')
        .in('user_id', ownerIds)
      
      if (ownerError) {
        console.error('[API /notes/portfolios] Error fetching owner portfolios:', ownerError)
      } else if (ownerPortfolios) {
        ownerPortfolios.forEach((portfolio) => {
          result.ownerPortfolios[portfolio.user_id] = portfolio
        })
      }
    }
    
    // Fetch assigned project portfolios
    if (portfolioIds.length > 0) {
      const { data: assignedPortfolios, error: assignedError } = await supabase
        .from('portfolios')
        .select('*')
        .in('id', portfolioIds)
        .in('type', [...DB_NON_HUMAN_TYPES])
      
      if (assignedError) {
        console.error('[API /notes/portfolios] Error fetching assigned portfolios:', assignedError)
      } else if (assignedPortfolios) {
        assignedPortfolios.forEach((portfolio) => {
          result.assignedPortfolios[portfolio.id] = portfolio
        })
      }
    }
    
    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error('[API /notes/portfolios] Unexpected error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Internal server error',
        ownerPortfolios: {},
        assignedPortfolios: {},
      },
      { status: 500 }
    )
  }
}

