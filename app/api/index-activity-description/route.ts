import { NextRequest, NextResponse } from 'next/server'
import { processActivityDescription } from '@/lib/indexing/property-processing'

/**
 * Background API route for indexing activity portfolio descriptions.
 * Called when an activity's description (or external link) is saved.
 */
export async function POST(request: NextRequest) {
  try {
    const { portfolioId, userId, description, externalLink } = await request.json()

    if (!portfolioId || !userId) {
      return NextResponse.json(
        { error: 'portfolioId and userId are required' },
        { status: 400 }
      )
    }

    await processActivityDescription(
      portfolioId,
      userId,
      description ?? null,
      externalLink ?? null
    )

    return NextResponse.json({ success: true, portfolioId })
  } catch (error: unknown) {
    console.error('Index activity description error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Indexing failed' },
      { status: 500 }
    )
  }
}
