import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isJoinablePublicSpaceRow } from '@/lib/portfolio/spaceCapabilities'
import { isEmailEligibleForOrgMembership } from '@/lib/portfolio/orgMembership'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const portfolioId = url.searchParams.get('portfolioId') || ''

    if (!portfolioId) {
      return NextResponse.json({ eligible: false }, { status: 200 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ eligible: false }, { status: 200 })
    }

    const { data: p, error } = await supabase
      .from('portfolios')
      .select('id, type, metadata, visibility, is_pseudo')
      .eq('id', portfolioId)
      .single()

    if (error || !p) {
      return NextResponse.json({ eligible: false }, { status: 200 })
    }

    if (!isJoinablePublicSpaceRow((p as any).type, (p as any).metadata, (p as any).visibility, (p as any).is_pseudo)) {
      return NextResponse.json({ eligible: false }, { status: 200 })
    }

    const props = ((p as any).metadata as any)?.properties || {}
    const org = props.org_membership || null
    if (!org || org.enabled !== true) {
      return NextResponse.json({ eligible: false }, { status: 200 })
    }

    const eligible = isEmailEligibleForOrgMembership((user as any).email ?? null, org.email_suffixes)
    return NextResponse.json({ eligible }, { status: 200 })
  } catch (_e: any) {
    return NextResponse.json({ eligible: false }, { status: 200 })
  }
}

