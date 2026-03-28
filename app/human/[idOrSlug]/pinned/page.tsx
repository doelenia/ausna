import { createClient } from '@/lib/supabase/server'
import { isHumanPortfolio } from '@/types/portfolio'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPortfolioBasic, isPortfolioOwner } from '@/lib/portfolio/helpers'
import { EditPinnedView } from '@/components/portfolio/EditPinnedView'
import { Title, UIText } from '@/components/ui'
import { loadPortfolioForPage } from '@/lib/portfolio/loadPortfolioForPage'
import { getHumanPinnedUrl, getSpacePinnedUrl } from '@/lib/portfolio/routes'

interface HumanEditPinnedPageProps {
  params: { idOrSlug: string }
}

export default async function HumanEditPinnedPage({ params }: HumanEditPinnedPageProps) {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const portfolio = await loadPortfolioForPage(supabase, idOrSlug)
  if (!portfolio) notFound()

  if (!isHumanPortfolio(portfolio)) {
    permanentRedirect(getSpacePinnedUrl(portfolio.slug || portfolio.id))
  }

  if (portfolio.slug && idOrSlug !== portfolio.slug) {
    permanentRedirect(getHumanPinnedUrl(portfolio.slug))
  }

  const isOwner = await isPortfolioOwner(portfolio.id, user.id)
  if (!isOwner) notFound()

  const basic = getPortfolioBasic(portfolio)

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="mb-6">
        <Title as="h1" className="mb-2">
          Edit Pinned Items
        </Title>
        <UIText as="p">{basic.name}</UIText>
      </div>
      <EditPinnedView portfolioId={portfolio.id} portfolioType={portfolio.type} />
    </div>
  )
}
