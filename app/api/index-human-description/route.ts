import { NextRequest, NextResponse } from 'next/server'
import { processHumanDescription } from '@/lib/indexing/property-processing'

/**
 * Background API route for processing human portfolio description
 * Called asynchronously after human description changes
 */
export async function POST(request: NextRequest) {
  try {
    const { portfolioId, userId, description } = await request.json()

    if (!portfolioId || !userId) {
      return NextResponse.json(
        { error: 'portfolioId and userId are required' },
        { status: 400 }
      )
    }

    try {
      // Process human description
      await processHumanDescription(portfolioId, userId, description || null)

      return NextResponse.json({ success: true, portfolioId })
    } catch (error: any) {
      console.error('Human description processing error:', error)
      return NextResponse.json(
        { error: error.message || 'Processing failed' },
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



