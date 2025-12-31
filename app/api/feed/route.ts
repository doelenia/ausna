import { NextRequest, NextResponse } from 'next/server'
import { getFeedNotes } from '@/app/main/actions'

/**
 * GET /api/feed - Get feed notes
 * Query params:
 *   - type: 'all' | 'friends' | 'community'
 *   - communityId: string (required if type is 'community')
 *   - offset: number (default: 0)
 *   - limit: number (default: 10)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const feedType = searchParams.get('type') as 'all' | 'friends' | 'community' | null
    const communityId = searchParams.get('communityId')
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    if (!feedType || !['all', 'friends', 'community'].includes(feedType)) {
      return NextResponse.json(
        { error: 'Invalid feed type. Must be "all", "friends", or "community"' },
        { status: 400 }
      )
    }

    if (feedType === 'community' && !communityId) {
      return NextResponse.json(
        { error: 'communityId is required for community feed' },
        { status: 400 }
      )
    }

    const result = await getFeedNotes(
      feedType,
      communityId,
      offset,
      limit
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch feed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      notes: result.notes || [],
      hasMore: result.hasMore ?? false,
    })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

