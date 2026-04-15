import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isJoinablePublicSpaceRow } from '@/lib/portfolio/spaceCapabilities'
import { isEmailEligibleForOrgMembershipRule } from '@/lib/portfolio/orgMembership'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'

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
      .maybeSingle()

    const resolved =
      !error && p ? (p as any) : await loadPortfolioForPage(supabase as any, portfolioId)

    if (error || !resolved) {
      return NextResponse.json({ eligible: false }, { status: 200 })
    }

    const rowAny = resolved as any
    const joinable = isJoinablePublicSpaceRow(rowAny.type, rowAny.metadata, rowAny.visibility, rowAny.is_pseudo)
    if (!joinable) {
      return NextResponse.json({ eligible: false }, { status: 200 })
    }

    const props = (rowAny.metadata as any)?.properties || {}
    const org = props.org_membership || null
    if (!org || org.enabled !== true) {
      return NextResponse.json({ eligible: false }, { status: 200 })
    }

    const eligible = isEmailEligibleForOrgMembershipRule((user as any).email ?? null, org)
    return NextResponse.json({ eligible }, { status: 200 })
  } catch (_e: any) {
    return NextResponse.json({ eligible: false }, { status: 200 })
  }
}

