import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createHumanPortfolioWithProjects } from '@/app/admin/actions'
import { PublicUploadFormSubmission } from '@/types/public-upload-form'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin()

    const { id } = params

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the submission
    const { data: submission, error: fetchError } = await supabase
      .from('public_upload_forms')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !submission) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      )
    }

    if (submission.status === 'approved') {
      return NextResponse.json(
        { error: 'Submission already approved' },
        { status: 400 }
      )
    }

    // Process the submission using the existing admin function
    const result = await createHumanPortfolioWithProjects(submission.submission_data)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to process submission' },
        { status: 500 }
      )
    }

    // Update submission status
    const { data: updatedSubmission, error: updateError } = await supabase
      .from('public_upload_forms')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        processed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating submission status:', updateError)
      // Note: The portfolio was created successfully, but status update failed
      // We still return success since the main operation succeeded
    }

    return NextResponse.json<PublicUploadFormSubmission>(
      updatedSubmission || submission
    )
  } catch (error: any) {
    if (error.message === 'Admin access required') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Error in POST approve:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

