import { NextRequest, NextResponse } from 'next/server'
import { processPortfolioDescriptionForInterests } from '@/lib/indexing/interest-tracking'

/**
 * Background API route for processing portfolio description interests
 * Called asynchronously after portfolio description changes
 */
export async function POST(request: NextRequest) {
  try {
    const { portfolioId, userId, isPersonalPortfolio, description } = await request.json()

    if (!portfolioId || !userId) {
      return NextResponse.json(
        { error: 'portfolioId and userId are required' },
        { status: 400 }
      )
    }

    try {
      // Process portfolio description for interests
      await processPortfolioDescriptionForInterests(
        portfolioId,
        userId,
        isPersonalPortfolio || false,
        description || null
      )

      return NextResponse.json({ success: true, portfolioId })
    } catch (error: any) {
      console.error('Portfolio interest processing error:', error)
      return NextResponse.json(
        { error: error.message || 'Interest processing failed' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


