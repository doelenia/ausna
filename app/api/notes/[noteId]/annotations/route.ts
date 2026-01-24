import { NextRequest, NextResponse } from 'next/server'
import { getAnnotationsByNote } from '@/app/notes/actions'

/**
 * GET /api/notes/[noteId]/annotations - Get annotations for a note with pagination
 * Query params:
 *   - offset: number (default: 0)
 *   - limit: number (default: 20)
 *   - includeReplies: boolean (default: true) - always included in response
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const { noteId } = params
    const { searchParams } = new URL(request.url)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    if (!noteId) {
      return NextResponse.json(
        { error: 'Note ID is required' },
        { status: 400 }
      )
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: 'Offset must be non-negative' },
        { status: 400 }
      )
    }

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 100' },
        { status: 400 }
      )
    }

    const result = await getAnnotationsByNote(noteId, offset, limit)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch annotations' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      annotations: result.annotations || [],
      hasMore: result.hasMore || false,
      totalCount: result.totalCount || 0,
    })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

