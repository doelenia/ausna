import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/notes/[noteId]/annotation-privacy - Update annotation privacy setting
 * Body: { annotation_privacy: 'authors' | 'friends' | 'everyone' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { noteId } = params
    const { annotation_privacy } = await request.json()

    if (!noteId) {
      return NextResponse.json(
        { error: 'Note ID is required' },
        { status: 400 }
      )
    }

    if (!annotation_privacy || !['authors', 'friends', 'everyone'].includes(annotation_privacy)) {
      return NextResponse.json(
        { error: 'Invalid annotation_privacy value. Must be one of: authors, friends, everyone' },
        { status: 400 }
      )
    }

    // Verify note exists and user is the owner
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('owner_account_id')
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      )
    }

    if (note.owner_account_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the note owner can update annotation privacy' },
        { status: 403 }
      )
    }

    // Update annotation privacy
    const { error: updateError } = await supabase
      .from('notes')
      .update({ annotation_privacy })
      .eq('id', noteId)

    if (updateError) {
      console.error('Error updating annotation privacy:', updateError)
      return NextResponse.json(
        { error: updateError.message || 'Failed to update annotation privacy' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      annotation_privacy,
    })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

