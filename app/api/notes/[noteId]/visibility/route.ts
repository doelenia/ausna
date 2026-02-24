import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()
    const noteId = params.noteId

    if (!noteId) {
      return NextResponse.json(
        { success: false, error: 'Note ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const visibility = body.visibility as 'public' | 'private' | undefined

    if (visibility !== 'public' && visibility !== 'private') {
      return NextResponse.json(
        { success: false, error: 'Invalid visibility value' },
        { status: 400 }
      )
    }

    // Ensure the requester owns the note
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('owner_account_id')
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return NextResponse.json(
        { success: false, error: 'Note not found' },
        { status: 404 }
      )
    }

    if (note.owner_account_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to update this note' },
        { status: 403 }
      )
    }

    const { error: updateError } = await supabase
      .from('notes')
      .update({ visibility })
      .eq('id', noteId)

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message || 'Failed to update visibility' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

