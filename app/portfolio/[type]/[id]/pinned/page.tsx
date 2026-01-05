import { createClient } from '@/lib/supabase/server'
import { parsePortfolioRoute } from '@/lib/portfolio/routes'
import { Portfolio } from '@/types/portfolio'
import { notFound } from 'next/navigation'
import { getPortfolioBasic, isPortfolioOwner } from '@/lib/portfolio/helpers'
import { EditPinnedView } from '@/components/portfolio/EditPinnedView'
import Link from 'next/link'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { Title, UIText } from '@/components/ui'

interface EditPinnedPageProps {
  params: {
    type: string
    id: string
  }
}

export default async function EditPinnedPage({ params }: EditPinnedPageProps) {
  const { type, id, isValid } = parsePortfolioRoute(params.type, params.id)

  if (!isValid || !type) {
    notFound()
  }

  const supabase = await createClient()

  // Get current user for ownership check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  // Fetch portfolio by ID, slug, or user_id (for human portfolios)
  let portfolio: Portfolio | null = null

  // Try fetching by ID first
  const { data: portfolioById } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', id)
    .eq('type', type)
    .maybeSingle()

  if (portfolioById) {
    portfolio = portfolioById as Portfolio
  } else if (type === 'human') {
    // For human portfolios, also try fetching by user_id
    const { data: portfolioByUserId } = await supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', id)
      .eq('type', 'human')
      .maybeSingle()

    if (portfolioByUserId) {
      portfolio = portfolioByUserId as Portfolio
    }
  }

  if (!portfolio) {
    // Try fetching by slug as last resort
    const { data: portfolioBySlug } = await supabase
      .from('portfolios')
      .select('*')
      .eq('slug', id)
      .eq('type', type)
      .maybeSingle()

    if (portfolioBySlug) {
      portfolio = portfolioBySlug as Portfolio
    }
  }

  if (!portfolio) {
    notFound()
  }

  // Check if user is owner
  const isOwner = await isPortfolioOwner(portfolio.id, user.id)
  if (!isOwner) {
    notFound()
  }

  // Extract basic info
  const basic = getPortfolioBasic(portfolio)

  return (
    <div className="bg-white shadow rounded-lg p-6">
          {/* Header */}
          <div className="mb-6">
            <Link
              href={getPortfolioUrl(portfolio.type, portfolio.id)}
              className="text-blue-600 hover:text-blue-700 mb-4 inline-block"
            >
              <UIText>← Back to Portfolio</UIText>
            </Link>
            <Title as="h1" className="mb-2">Edit Pinned Items</Title>
            <UIText as="p">{basic.name}</UIText>
          </div>

          {/* Edit View */}
          <EditPinnedView portfolioId={portfolio.id} portfolioType={portfolio.type} />
        </div>
  )
}

