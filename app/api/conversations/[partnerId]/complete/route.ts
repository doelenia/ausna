import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/conversations/[partnerId]/complete - Mark conversation as complete
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { partnerId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { partnerId } = params

    if (!partnerId) {
      return NextResponse.json(
        { error: 'partnerId is required' },
        { status: 400 }
      )
    }

    // Upsert completion record (create or update if exists)
    const { data: completion, error } = await supabase
      .from('conversation_completions')
      .upsert(
        {
          user_id: user.id,
          partner_id: partnerId,
          completed_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,partner_id',
        }
      )
      .select()
      .single()

    if (error) {
      console.error('Error completing conversation:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      console.error('User ID:', user.id)
      console.error('Partner ID:', partnerId)
      return NextResponse.json(
        { error: 'Failed to complete conversation', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, completion })
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/conversations/[partnerId]/complete - Uncomplete conversation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { partnerId: string } }
) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { partnerId } = params

    if (!partnerId) {
      return NextResponse.json(
        { error: 'partnerId is required' },
        { status: 400 }
      )
    }

    // Delete completion record
    const { error } = await supabase
      .from('conversation_completions')
      .delete()
      .eq('user_id', user.id)
      .eq('partner_id', partnerId)

    if (error) {
      console.error('Error uncompleting conversation:', error)
      return NextResponse.json(
        { error: 'Failed to uncomplete conversation' },
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

