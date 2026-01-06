import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

interface AgreementPayload {
  userId: string
  agreements: Array<{
    documentType: 'terms' | 'privacy'
    documentVersion: number
  }>
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AgreementPayload

    if (!body.userId || !Array.isArray(body.agreements) || body.agreements.length === 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const ipAddress =
      request.headers.get('x-forwarded-for') ??
      request.headers.get('x-real-ip') ??
      request.ip ??
      null

    const rows = body.agreements.map((agreement) => ({
      user_id: body.userId,
      document_type: agreement.documentType,
      document_version: agreement.documentVersion,
      ip_address: ipAddress,
    }))

    const { error } = await supabase.from('user_legal_agreements').insert(rows)

    if (error) {
      console.error('Error inserting user legal agreements:', error)
      return NextResponse.json({ error: 'Failed to record agreements' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error in legal agreement endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


