import type { SupabaseClient } from '@supabase/supabase-js'

export type ViewerJoinStatus = 'none' | 'member' | 'pending_request' | 'pending_invite'

export function viewerJoinStatusForSpaceRow(
  row: { id: string; user_id: string; metadata: unknown },
  viewerUserId: string | null | undefined,
  pendingRequestPortfolioIds: Set<string>,
  pendingInvitePortfolioIds: Set<string>
): ViewerJoinStatus {
  if (!viewerUserId) return 'none'
  const metadata = (row.metadata || {}) as { members?: string[]; managers?: string[] }
  const members = metadata.members ?? []
  const managers = metadata.managers ?? []
  if (
    row.user_id === viewerUserId ||
    members.includes(viewerUserId) ||
    managers.includes(viewerUserId)
  ) {
    return 'member'
  }
  if (pendingRequestPortfolioIds.has(row.id)) return 'pending_request'
  if (pendingInvitePortfolioIds.has(row.id)) return 'pending_invite'
  return 'none'
}

export async function fetchViewerPendingSpaceIds(
  supabase: SupabaseClient,
  viewerUserId: string,
  portfolioIds: string[]
): Promise<{ pendingRequestIds: Set<string>; pendingInviteIds: Set<string> }> {
  if (portfolioIds.length === 0) {
    return { pendingRequestIds: new Set(), pendingInviteIds: new Set() }
  }
  const [{ data: reqs }, { data: invites }] = await Promise.all([
    supabase
      .from('portfolio_join_requests')
      .select('portfolio_id')
      .eq('applicant_user_id', viewerUserId)
      .eq('status', 'pending')
      .in('portfolio_id', portfolioIds),
    supabase
      .from('portfolio_invitations')
      .select('portfolio_id')
      .eq('invitee_id', viewerUserId)
      .eq('status', 'pending')
      .in('portfolio_id', portfolioIds),
  ])
  return {
    pendingRequestIds: new Set(
      (reqs ?? []).map((r: { portfolio_id: string }) => r.portfolio_id).filter(Boolean)
    ),
    pendingInviteIds: new Set(
      (invites ?? []).map((r: { portfolio_id: string }) => r.portfolio_id).filter(Boolean)
    ),
  }
}
