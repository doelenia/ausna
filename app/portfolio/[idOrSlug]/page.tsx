import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import { notFound, permanentRedirect } from 'next/navigation'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanProfileUrl, getSpaceUrl } from '@/lib/portfolio/routes'

interface LegacyPortfolioDetailRedirectProps {
  params: { idOrSlug: string }
}

/** @deprecated Use `/human/...` or `/space/...`. */
export default async function LegacyPortfolioDetailRedirect({
  params,
}: LegacyPortfolioDetailRedirectProps) {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug) notFound()

  const supabase = await createClient()
  const portfolio = await loadPortfolioForPage(supabase, idOrSlug)
  if (!portfolio) notFound()

  const target = isHumanPortfolio(portfolio)
    ? getHumanProfileUrl(portfolio.slug || portfolio.id)
    : getSpaceUrl(portfolio.slug || portfolio.id)
  permanentRedirect(target)
}
