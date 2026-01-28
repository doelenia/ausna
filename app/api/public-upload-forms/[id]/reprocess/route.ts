import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { reprocessApprovedForm } from '@/app/admin/actions'
import { PublicUploadFormSubmission } from '@/types/public-upload-form'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()

    const { id } = params

    // Reprocess the form
    const result = await reprocessApprovedForm(id)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to reprocess form' },
        { status: 500 }
      )
    }

    // Fetch the updated submission
    const { createServiceClient } = await import('@/lib/supabase/service')
    const serviceClient = createServiceClient()
    const { data: updatedSubmission, error: fetchError } = await serviceClient
      .from('public_upload_forms')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !updatedSubmission) {
      return NextResponse.json(
        { error: 'Failed to fetch updated submission' },
        { status: 500 }
      )
    }

    return NextResponse.json<PublicUploadFormSubmission>(updatedSubmission)
  } catch (error: any) {
    if (error.message === 'Admin access required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Error in POST reprocess:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

