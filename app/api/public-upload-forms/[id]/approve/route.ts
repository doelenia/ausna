import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
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

    // Record legal agreements after portfolio creation
    if (result.portfolioId) {
      try {
        // Get the portfolio to get user_id
        const { data: portfolio } = await supabase
          .from('portfolios')
          .select('user_id')
          .eq('id', result.portfolioId)
          .single()

        if (portfolio?.user_id) {
          // Fetch active legal document versions
          const { data: legalDocs } = await supabase
            .from('legal_documents')
            .select('type, version')
            .eq('is_active', true)

          if (legalDocs && legalDocs.length > 0) {
            const termsDoc = legalDocs.find((doc: any) => doc.type === 'terms')
            const privacyDoc = legalDocs.find((doc: any) => doc.type === 'privacy')

            if (termsDoc && privacyDoc) {
              // Record agreements directly using service client
              const serviceClient = createServiceClient()
              const ipAddress =
                request.headers.get('x-forwarded-for') ??
                request.headers.get('x-real-ip') ??
                null

              const rows = [
                {
                  user_id: portfolio.user_id,
                  document_type: 'terms',
                  document_version: termsDoc.version,
                  ip_address: ipAddress,
                },
                {
                  user_id: portfolio.user_id,
                  document_type: 'privacy',
                  document_version: privacyDoc.version,
                  ip_address: ipAddress,
                },
              ]

              const { error: agreementError } = await serviceClient
                .from('user_legal_agreements')
                .insert(rows)

              if (agreementError) {
                console.error('Failed to record legal agreements:', agreementError)
                // Don't fail approval if agreement recording fails
              }
            }
          }
        }
      } catch (agreementError) {
        console.error('Error recording legal agreements:', agreementError)
        // Don't fail approval if agreement recording fails
      }
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

