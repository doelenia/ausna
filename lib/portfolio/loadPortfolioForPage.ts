import type { SupabaseClient } from '@supabase/supabase-js'
import type { Portfolio } from '@/types/portfolio'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Resolve a portfolio by id, slug, or (for human rows) auth user_id in the path segment.
 *
 * Note on unlisted:
 * - Normal selects should treat `unlisted` like `private` (RLS), so list queries don't leak it.
 * - For direct-link page loads, we fall back to a service-role lookup and allow returning
 *   public + unlisted portfolios only (never private).
 */
export async function loadPortfolioForPage(
  supabase: SupabaseClient,
  idOrSlug: string
): Promise<Portfolio | null> {
  if (!idOrSlug || typeof idOrSlug !== 'string') return null

  const { data: byId } = await supabase.from('portfolios').select('*').eq('id', idOrSlug).maybeSingle()
  if (byId) {
    return byId as Portfolio
  }

  const { data: bySlug } = await supabase
    .from('portfolios')
    .select('*')
    .eq('slug', idOrSlug)
    .maybeSingle()
  if (bySlug) {
    return bySlug as Portfolio
  }

  // Direct-link fallback: allow fetching public/unlisted even when RLS hides unlisted.
  try {
    const service = createServiceRoleClient()
    const { data: anyRowById } = await service
      .from('portfolios')
      .select('*')
      .eq('id', idOrSlug)
      .maybeSingle()
    const row = (anyRowById || null) as any
    if (row && (row.visibility === 'public' || row.visibility === 'unlisted') && row.is_pseudo !== true) {
      return row as Portfolio
    }

    const { data: anyRowBySlug } = await service
      .from('portfolios')
      .select('*')
      .eq('slug', idOrSlug)
      .maybeSingle()
    const row2 = (anyRowBySlug || null) as any
    if (row2 && (row2.visibility === 'public' || row2.visibility === 'unlisted') && row2.is_pseudo !== true) {
      return row2 as Portfolio
    }
  } catch {
    // Service key not configured or other error: ignore and continue.
  }

  const { data: byUserId } = await supabase
    .from('portfolios')
    .select('*')
    .eq('type', 'human')
    .eq('user_id', idOrSlug)
    .maybeSingle()
  if (byUserId) return byUserId as Portfolio

  return null
}
