import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import { notFound, permanentRedirect } from 'next/navigation'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanProfileUrl, getSpaceUrl } from '@/lib/portfolio/routes'

interface HumanPinnedRedirectProps {
  params: { idOrSlug: string }
}

/** Legacy URL: `/human/.../pinned` redirects to the profile. */
export default async function HumanPinnedRedirect({ params }: HumanPinnedRedirectProps) {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug) notFound()

  const supabase = await createClient()
  const portfolio = await loadPortfolioForPage(supabase, idOrSlug)
  if (!portfolio) notFound()

  if (!isHumanPortfolio(portfolio)) {
    permanentRedirect(getSpaceUrl(portfolio.slug || portfolio.id))
  }

  if (portfolio.slug && idOrSlug !== portfolio.slug) {
    permanentRedirect(getHumanProfileUrl(portfolio.slug))
  }

  permanentRedirect(getHumanProfileUrl(portfolio.slug || portfolio.id))
}
