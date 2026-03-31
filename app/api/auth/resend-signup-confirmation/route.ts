import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSiteUrl } from '@/lib/utils/site-url'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim() : ''

    if (!email || !email.includes('@')) {
      return NextResponse.json({ success: false, error: 'Valid email is required.' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const siteUrl = getSiteUrl()

    const emailRedirectTo = `${siteUrl}/main`

    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo,
      },
    })

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || 'Failed to resend confirmation email.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to resend confirmation email.' },
      { status: 500 }
    )
  }
}

