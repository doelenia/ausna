import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/notes/[noteId]/record-view
 * Records that the current user has viewed this open call.
 * Appends user ID to metadata.viewed_by (avoids duplicates).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { noteId: string } }
) {
  try {
    const noteId = params.noteId
    if (!noteId) {
      return NextResponse.json(
        { error: 'Note ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('id, type, metadata')
      .eq('id', noteId)
      .single()

    if (fetchError || !note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      )
    }

    if (note.type !== 'open_call') {
      return NextResponse.json(
        { error: 'Not an open call note' },
        { status: 400 }
      )
    }

    const meta = (note.metadata as Record<string, unknown>) || {}
    const viewedBy: string[] = Array.isArray(meta.viewed_by) ? [...meta.viewed_by] : []

    if (!viewedBy.includes(user.id)) {
      viewedBy.push(user.id)
    }

    // Use service client to bypass RLS for the update itself.
    // We still require end-user auth above to ensure only logged-in users can record their view.
    const service = createServiceClient()

    const { error: updateError, data: updateData } = await service
      .from('notes')
      .update({
        metadata: { ...meta, viewed_by: viewedBy },
        updated_at: new Date().toISOString(),
      })
      .eq('id', noteId)
      .select('id')

    if (updateError) {
      console.error('[API record-view] Update error:', updateError)
      return NextResponse.json(
        { error: updateError.message || 'Failed to record view' },
        { status: 500 }
      )
    }

    // Re-fetch from DB (service client) to verify metadata.viewed_by actually includes this user
    const { data: verified, error: verifyError } = await service
      .from('notes')
      .select('id, metadata')
      .eq('id', noteId)
      .single()

    const verifiedMeta = (verified?.metadata as Record<string, unknown>) || {}
    const verifiedViewedBy: string[] = Array.isArray((verifiedMeta as any).viewed_by)
      ? ((verifiedMeta as any).viewed_by as string[])
      : []

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API record-view] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
