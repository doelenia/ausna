import { NextRequest, NextResponse } from 'next/server'
import { findHumanPortfolioByEmail } from '@/lib/portfolio/admin-helpers'
import { EmailCheckResponse } from '@/types/public-upload-form'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const portfolio = await findHumanPortfolioByEmail(email.toLowerCase().trim())

    if (portfolio) {
      const name = portfolio.metadata.basic?.name || portfolio.metadata.full_name || 'User'
      return NextResponse.json<EmailCheckResponse>({
        exists: true,
        name,
      })
    }

    return NextResponse.json<EmailCheckResponse>({
      exists: false,
    })
  } catch (error: any) {
    console.error('Error checking email:', error)
    return NextResponse.json(
      { error: 'Failed to check email' },
      { status: 500 }
    )
  }
}

