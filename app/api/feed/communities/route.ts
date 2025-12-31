import { NextRequest, NextResponse } from 'next/server'
import { getUserCommunities } from '@/app/main/actions'

/**
 * GET /api/feed/communities - Get all communities the user is a member of
 */
export async function GET(request: NextRequest) {
  try {
    const result = await getUserCommunities()

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch communities' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      communities: result.communities || [],
    })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

