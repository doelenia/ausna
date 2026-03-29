import { NextRequest, NextResponse } from 'next/server'
import { getUserSpaces } from '@/app/main/actions'

/**
 * GET /api/feed/communities — spaces the current user belongs to (feed tabs).
 * Response includes `spaces` (canonical) and `communities` (same data, deprecated alias).
 */
export async function GET(_request: NextRequest) {
  try {
    const result = await getUserSpaces()

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch spaces' },
        { status: 500 }
      )
    }

    const spaces = result.spaces || []
    return NextResponse.json({
      spaces,
      communities: spaces,
    })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
