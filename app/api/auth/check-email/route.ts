import { NextResponse } from 'next/server'
import { checkEmailStatus } from '@/app/login/actions'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email : ''

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 })
    }

    const result = await checkEmailStatus(email)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error in /api/auth/check-email:', error)
    return NextResponse.json(
      { error: 'Failed to check email. Please try again.' },
      { status: 500 }
    )
  }
}

