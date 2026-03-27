import { createClient } from '@/lib/supabase/server'
import { Portfolio } from '@/types/portfolio'
import { notFound, redirect } from 'next/navigation'
import { getPortfolioBasic, isPortfolioOwner } from '@/lib/portfolio/helpers'
import { EditPinnedView } from '@/components/portfolio/EditPinnedView'
import { Title, UIText } from '@/components/ui'

interface EditPinnedPageProps {
  params: {
    idOrSlug: string
  }
}

export default async function EditPinnedPage({ params }: EditPinnedPageProps) {
  const idOrSlug = params.idOrSlug
  if (!idOrSlug) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  let portfolio: Portfolio | null = null
  const { data: byId } = await supabase.from('portfolios').select('*').eq('id', idOrSlug).maybeSingle()
  if (byId) portfolio = byId as Portfolio
  if (!portfolio) {
    const { data: bySlug } = await supabase
      .from('portfolios')
      .select('*')
      .eq('slug', idOrSlug)
      .maybeSingle()
    if (bySlug) portfolio = bySlug as Portfolio
  }

  if (!portfolio) notFound()

  if (portfolio.slug && idOrSlug !== portfolio.slug) {
    redirect(`/portfolio/${portfolio.slug}/pinned`)
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

