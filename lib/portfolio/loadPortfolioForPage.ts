import type { SupabaseClient } from '@supabase/supabase-js'
import type { Portfolio } from '@/types/portfolio'

/**
 * Resolve a portfolio by id, slug, or (for human rows) auth user_id in the path segment.
 */
export async function loadPortfolioForPage(
  supabase: SupabaseClient,
  idOrSlug: string
): Promise<Portfolio | null> {
  if (!idOrSlug || typeof idOrSlug !== 'string') return null

  const { data: byId } = await supabase.from('portfolios').select('*').eq('id', idOrSlug).maybeSingle()
  if (byId) return byId as Portfolio

  const { data: bySlug } = await supabase
    .from('portfolios')
    .select('*')
    .eq('slug', idOrSlug)
    .maybeSingle()
  if (bySlug) return bySlug as Portfolio

  const { data: byUserId } = await supabase
    .from('portfolios')
    .select('*')
    .eq('type', 'human')
    .eq('user_id', idOrSlug)
    .maybeSingle()
  if (byUserId) return byUserId as Portfolio

  return null
}
