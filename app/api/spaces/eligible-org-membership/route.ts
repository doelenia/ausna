import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isJoinablePublicSpaceRow } from '@/lib/portfolio/spaceCapabilities'
import { isEmailEligibleForOrgMembership } from '@/lib/portfolio/orgMembership'
import { ONBOARDING_JOIN_SPACES_PINNED_PORTFOLIO_ID } from '@/lib/onboarding/status'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ results: [] }, { status: 200 })
    }

    // Keep this lightweight: fetch recent public spaces and filter in-process.
    const { data: rows, error } = await supabase
      .from('portfolios')
      .select('id, type, slug, metadata, visibility, is_pseudo, created_at')
      .eq('type', 'space')
      .neq('visibility', 'private')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      return NextResponse.json({ results: [], error: error.message }, { status: 200 })
    }

    function toFeaturedPayload(p: any, featuredSource: 'org' | 'pinned') {
      const basic = (p.metadata as any)?.basic || {}
      return {
        id: p.id,
        slug: p.slug,
        name: (basic.name as string) || 'Space',
        description: (basic.description as string) || '',
        avatar: (basic.avatar as string) || null,
        emoji: (basic.emoji as string) || null,
        featuredSource,
      }
    }

    const orgEligible = (rows || [])
      .filter((p: any) =>
        isJoinablePublicSpaceRow(p.type, p.metadata, p.visibility, p.is_pseudo)
      )
      .filter((p: any) => {
        const props = (p.metadata as any)?.properties || {}
        const org = props.org_membership || null
        if (!org || org.enabled !== true) return false
        return isEmailEligibleForOrgMembership((user as any).email ?? null, org.email_suffixes)
      })
      .slice(0, 3)
      .map((p: any) => toFeaturedPayload(p, 'org'))

    const { data: pinnedRow } = await supabase
      .from('portfolios')
      .select('id, type, slug, metadata, visibility, is_pseudo')
      .eq('id', ONBOARDING_JOIN_SPACES_PINNED_PORTFOLIO_ID)
      .maybeSingle()

    let results = orgEligible
    if (
      pinnedRow &&
      isJoinablePublicSpaceRow(
        (pinnedRow as any).type,
        (pinnedRow as any).metadata,
        (pinnedRow as any).visibility,
        (pinnedRow as any).is_pseudo
      )
    ) {
      const pinned = toFeaturedPayload(pinnedRow, 'pinned')
      results = [pinned, ...orgEligible.filter((x) => x.id !== pinned.id)]
    }

    return NextResponse.json({ results }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ results: [], error: e?.message || 'Failed' }, { status: 200 })
  }
}

