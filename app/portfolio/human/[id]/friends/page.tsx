import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import { notFound, permanentRedirect } from 'next/navigation'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanFriendsUrl } from '@/lib/portfolio/routes'

interface LegacyHumanFriendsRedirectProps {
  params: { id: string }
}

/** @deprecated Use `/human/[id]/friends`. */
export default async function LegacyHumanFriendsRedirect({ params }: LegacyHumanFriendsRedirectProps) {
  const supabase = await createClient()
  const portfolio = await loadPortfolioForPage(supabase, params.id)
  if (!portfolio || !isHumanPortfolio(portfolio)) notFound()
  permanentRedirect(getHumanFriendsUrl(portfolio.slug || portfolio.id))
}
