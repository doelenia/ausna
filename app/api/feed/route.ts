import { NextRequest, NextResponse } from 'next/server'
import { getFeedItems } from '@/app/main/actions'
import type { FeedType } from '@/app/main/actions'

export const dynamic = 'force-dynamic'

function normalizeFeedTypeParam(
  raw: string | null
): FeedType | null {
  if (!raw) return null
  const t = raw.toLowerCase()
  if (t === 'community') return 'space'
  if (t === 'all' || t === 'friends' || t === 'space') return t as FeedType
  return null
}

/**
 * GET /api/feed - Get feed notes
 * Query params:
 *   - type: 'all' | 'friends' | 'space' (legacy: 'community' → space)
 *   - spaceId: string (required if type is space; legacy: communityId)
 *   - offset: number (default: 0)
 *   - limit: number (default: 10)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const feedType = normalizeFeedTypeParam(searchParams.get('type'))
    const spaceId =
      searchParams.get('spaceId')?.trim() ||
      searchParams.get('communityId')?.trim() ||
      null
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    if (!feedType || !['all', 'friends', 'space'].includes(feedType)) {
      return NextResponse.json(
        { error: 'Invalid feed type. Must be "all", "friends", or "space"' },
        { status: 400 }
      )
    }

    if (feedType === 'space' && !spaceId) {
      return NextResponse.json(
        { error: 'spaceId is required for space feed (legacy: communityId)' },
        { status: 400 }
      )
    }

    const result = await getFeedItems(feedType, spaceId, offset, limit)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch feed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      items: result.items || [],
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
