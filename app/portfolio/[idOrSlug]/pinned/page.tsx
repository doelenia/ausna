import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import { notFound, permanentRedirect } from 'next/navigation'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanProfileUrl, getSpaceUrl } from '@/lib/portfolio/routes'

interface LegacyPinnedRedirectProps {
  params: { idOrSlug: string }
}

/** @deprecated Portfolio pinned URLs redirect to the canonical human or space page. */
export default async function LegacyPinnedRedirect({ params }: LegacyPinnedRedirectProps) {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug) notFound()

  const supabase = await createClient()
  const portfolio = await loadPortfolioForPage(supabase, idOrSlug)
  if (!portfolio) notFound()

  const slugOrId = portfolio.slug || portfolio.id
  if (isHumanPortfolio(portfolio)) {
    permanentRedirect(getHumanProfileUrl(slugOrId))
  }
  permanentRedirect(getSpaceUrl(slugOrId))
}
