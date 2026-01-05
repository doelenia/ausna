import { NextRequest, NextResponse } from 'next/server'
import { markNotesAsSeenAction } from '@/app/main/actions'

/**
 * POST /api/feed/seen - Mark notes as seen
 * Body: { noteIds: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { noteIds } = body

    if (!noteIds || !Array.isArray(noteIds)) {
      return NextResponse.json(
        { error: 'noteIds array is required' },
        { status: 400 }
      )
    }

    const result = await markNotesAsSeenAction(noteIds)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to mark notes as seen' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


