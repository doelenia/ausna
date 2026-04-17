import { isHumanPortfolio } from '@/types/portfolio'
import { notFound, permanentRedirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanProfileUrl, getSpaceUrl } from '@/lib/portfolio/routes'

interface SpacePinnedRedirectProps {
  params: { idOrSlug: string }
}

/** Legacy URL: `/space/.../pinned` redirects to the space. */
export default async function SpacePinnedRedirect({ params }: SpacePinnedRedirectProps) {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug) notFound()

  const supabase = await createClient()
  const portfolio = await loadPortfolioForPage(supabase, idOrSlug)
  if (!portfolio) notFound()

  if (isHumanPortfolio(portfolio)) {
    permanentRedirect(getHumanProfileUrl(portfolio.slug || portfolio.id))
  }

  if (portfolio.slug && idOrSlug !== portfolio.slug) {
    permanentRedirect(getSpaceUrl(portfolio.slug))
  }

  permanentRedirect(getSpaceUrl(portfolio.slug || portfolio.id))
}
