import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import { notFound, permanentRedirect } from 'next/navigation'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanProfileUrl, getSpaceMembersUrl } from '@/lib/portfolio/routes'

interface LegacyMembersRedirectProps {
  params: { idOrSlug: string }
  searchParams?: Promise<{ tab?: string }> | { tab?: string }
}

/** @deprecated Use `/space/[id]/members`. */
export default async function LegacyMembersRedirect({ params, searchParams }: LegacyMembersRedirectProps) {
  const resolvedSearchParams =
    searchParams && typeof (searchParams as any).then === 'function'
      ? await (searchParams as Promise<{ tab?: string }>)
      : (searchParams as { tab?: string } | undefined)

  const tab = resolvedSearchParams?.tab
  const qs = tab ? `tab=${encodeURIComponent(tab)}` : ''

  const idOrSlug = params.idOrSlug
  if (!idOrSlug) notFound()

  const supabase = await createClient()
  const portfolio = await loadPortfolioForPage(supabase, idOrSlug)
  if (!portfolio) notFound()

  if (isHumanPortfolio(portfolio)) {
    permanentRedirect(getHumanProfileUrl(portfolio.slug || portfolio.id))
  }

  permanentRedirect(getSpaceMembersUrl(portfolio.slug || portfolio.id, qs))
}
