import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * GET /api/notes/[noteId]/interested
 * Returns the list of user IDs who are interested in this open call.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const { noteId } = params
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: note, error } = await supabase
      .from('notes')
      .select('id, type, metadata')
      .eq('id', noteId)
      .maybeSingle()

    if (error || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.type !== 'open_call') {
      return NextResponse.json({ interested: [] })
    }

    const metadata = (note.metadata as { interested?: string[] }) ?? {}
    const interested = Array.isArray(metadata.interested) ? metadata.interested : []

    return NextResponse.json({ interested })
  } catch (err: unknown) {
    console.error('[interested GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/notes/[noteId]/interested
 * Toggle current user in the interested list. Requires auth.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const { noteId } = params
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('id, type, metadata')
      .eq('id', noteId)
      .maybeSingle()

    if (noteError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.type !== 'open_call') {
      return NextResponse.json(
        { error: 'Not an open call note' },
        { status: 400 }
      )
    }

    const metadata = (note.metadata as { interested?: string[] }) ?? {}
    const current = Array.isArray(metadata.interested) ? metadata.interested : []
    const hasUser = current.includes(user.id)
    const updated = hasUser
      ? current.filter((id) => id !== user.id)
      : [...current, user.id]

    const serviceSupabase = createServiceClient()
    const { error: updateError } = await serviceSupabase
      .from('notes')
      .update({
        metadata: {
          ...metadata,
          interested: updated,
        },
      })
      .eq('id', noteId)

    if (updateError) {
      console.error('[interested POST] update failed', updateError)
      return NextResponse.json(
        { error: updateError.message || 'Failed to update' },
        { status: 500 }
      )
    }

    return NextResponse.json({ interested: updated })
  } catch (err: unknown) {
    console.error('[interested POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
