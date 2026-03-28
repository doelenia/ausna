import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import { notFound, permanentRedirect } from 'next/navigation'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanCommunitiesUrl } from '@/lib/portfolio/routes'

interface LegacyHumanCommunitiesRedirectProps {
  params: { id: string }
}

/** @deprecated Use `/human/[id]/communities`. */
export default async function LegacyHumanCommunitiesRedirect({
  params,
}: LegacyHumanCommunitiesRedirectProps) {
  const supabase = await createClient()
  const portfolio = await loadPortfolioForPage(supabase, params.id)
  if (!portfolio || !isHumanPortfolio(portfolio)) notFound()
  permanentRedirect(getHumanCommunitiesUrl(portfolio.slug || portfolio.id))
}
