import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isJoinablePublicSpaceRow } from '@/lib/portfolio/spaceCapabilities'
import { isEmailEligibleForOrgMembershipRule } from '@/lib/portfolio/orgMembership'
import {
  fetchViewerPendingSpaceIds,
  viewerJoinStatusForSpaceRow,
} from '@/lib/portfolio/viewerJoinStatus'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ results: [] }, { status: 200 })
    }

    // Keep this lightweight: fetch recent joinable spaces and filter in-process.
    // Directory surfaces should use `portfolios_directory` so unlisted/private stay non-discoverable.
    const { data: rows, error } = await supabase
      .from('portfolios_directory')
      .select('id, user_id, type, slug, metadata, visibility, is_pseudo, created_at')
      .eq('type', 'space')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      return NextResponse.json({ results: [], error: error.message }, { status: 200 })
    }

    function toFeaturedPayload(
      p: any,
      userJoinStatus: ReturnType<typeof viewerJoinStatusForSpaceRow>
    ) {
      const basic = (p.metadata as any)?.basic || {}
      return {
        id: p.id,
        slug: p.slug,
        name: (basic.name as string) || 'Space',
        description: (basic.description as string) || '',
        avatar: (basic.avatar as string) || null,
        emoji: (basic.emoji as string) || null,
        userJoinStatus,
      }
    }

    const joinableRows = (rows || []).filter((p: any) =>
      isJoinablePublicSpaceRow(p.type, p.metadata, p.visibility, p.is_pseudo)
    )
    const orgEligibleRows = joinableRows
      .filter((p: any) => {
        const props = (p.metadata as any)?.properties || {}
        const org = props.org_membership || null
        if (!org || org.enabled !== true) return false
        return isEmailEligibleForOrgMembershipRule((user as any).email ?? null, org)
      })
      .slice(0, 3)

    const featuredRows = orgEligibleRows

    const featuredIds = featuredRows.map((x) => x.id as string)
    const { pendingRequestIds, pendingInviteIds } = await fetchViewerPendingSpaceIds(
      supabase,
      user.id,
      featuredIds
    )

    const results = featuredRows.map((row) => {
      const userJoinStatus = viewerJoinStatusForSpaceRow(
        {
          id: row.id,
          user_id: row.user_id as string,
          metadata: row.metadata,
        },
        user.id,
        pendingRequestIds,
        pendingInviteIds
      )
      return toFeaturedPayload(row, userJoinStatus)
    })

    return NextResponse.json({ results }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ results: [], error: e?.message || 'Failed' }, { status: 200 })
  }
}

