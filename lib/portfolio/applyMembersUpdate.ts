import { createServiceClient } from '@/lib/supabase/service'

/**
 * Apply member list + managers metadata (service role; portfolios UPDATE RLS is owner-only).
 */
export async function applyMembersUpdate(
  portfolioId: string,
  metadata: Record<string, any>,
  updatedMembers: string[],
  updatedManagers: string[],
  updatedMemberRoles: Record<string, string>
) {
  const supabase = createServiceClient()
  const { error: rpcError } = await supabase.rpc('update_portfolio_members', {
    portfolio_id: portfolioId,
    new_members: updatedMembers,
  })
  const nextMetadata = {
    ...metadata,
    members: updatedMembers,
    managers: updatedManagers,
    memberRoles: updatedMemberRoles,
  }
  if (rpcError) {
    const { error: directError } = await supabase
      .from('portfolios')
      .update({ metadata: nextMetadata })
      .eq('id', portfolioId)
    if (directError) throw directError
  } else {
    const { error: metaError } = await supabase
      .from('portfolios')
      .update({ metadata: nextMetadata })
      .eq('id', portfolioId)
    if (metaError) throw metaError
  }
}
