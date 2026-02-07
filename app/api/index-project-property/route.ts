import { NextRequest, NextResponse } from 'next/server'
import { processProjectProperty } from '@/lib/indexing/property-processing'

/**
 * Background API route for processing project property (goals, timelines, asks)
 * Called asynchronously after project property changes
 */
export async function POST(request: NextRequest) {
  try {
    const { portfolioId, userId, propertyName, propertyValue } = await request.json()

    if (!portfolioId || !userId || !propertyName) {
      return NextResponse.json(
        { error: 'portfolioId, userId, and propertyName are required' },
        { status: 400 }
      )
    }

    if (!['goals', 'timelines', 'asks'].includes(propertyName)) {
      return NextResponse.json(
        { error: 'propertyName must be one of: goals, timelines, asks' },
        { status: 400 }
      )
    }

    try {
      // Process project property
      await processProjectProperty(
        portfolioId,
        userId,
        propertyName as 'goals' | 'timelines' | 'asks',
        propertyValue || null
      )

      return NextResponse.json({ success: true, portfolioId, propertyName })
    } catch (error: any) {
      console.error('Project property processing error:', error)
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


