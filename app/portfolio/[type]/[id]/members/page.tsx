import { createClient } from '@/lib/supabase/server'
import { parsePortfolioRoute, getPortfolioUrl } from '@/lib/portfolio/routes'
import { Portfolio, isProjectPortfolio, isCommunityPortfolio } from '@/types/portfolio'
import { notFound } from 'next/navigation'
import { isPortfolioManager, isPortfolioCreator, getPortfolioBasic } from '@/lib/portfolio/helpers'
import { MembersPageClient } from '@/components/portfolio/MembersPageClient'
import Link from 'next/link'

interface MembersPageProps {
  params: {
    type: string
    id: string
  }
}

export default async function MembersPage({ params }: MembersPageProps) {
  const { type, id, isValid } = parsePortfolioRoute(params.type, params.id)

  if (!isValid || !type) {
    notFound()
  }

  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch portfolio
  let portfolio: Portfolio | null = null

  const { data: portfolioById } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', id)
    .eq('type', type)
    .maybeSingle()

  if (portfolioById) {
    portfolio = portfolioById as Portfolio
  } else if (type === 'human') {
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

  // Only projects and communities have members
  if (!isProjectPortfolio(portfolio) && !isCommunityPortfolio(portfolio)) {
    notFound()
  }

  // Check if user is manager or creator
  const isCreator = user ? await isPortfolioCreator(portfolio.id, user.id) : false
  const isManager = user ? await isPortfolioManager(portfolio.id, user.id) : false
  const canManage = isCreator || isManager

  const basic = getPortfolioBasic(portfolio)
  const metadata = portfolio.metadata as any
  const members = metadata?.members || []
  const managers = metadata?.managers || []

  // Get member and manager details
  const memberDetails = await Promise.all(
    members.map(async (memberId: string) => {
      const { data: memberPortfolio } = await supabase
        .from('portfolios')
        .select('user_id, metadata')
        .eq('user_id', memberId)
        .eq('type', 'human')
        .maybeSingle()

      if (memberPortfolio) {
        const memberMetadata = memberPortfolio.metadata as any
        const memberBasic = memberMetadata?.basic || {}
        return {
          id: memberId,
          username: memberMetadata?.username || null,
          name: memberBasic.name || memberMetadata?.full_name || null,
          avatar: memberBasic.avatar || memberMetadata?.avatar_url || null,
          isManager: managers.includes(memberId),
          isCreator: portfolio.user_id === memberId,
        }
      }
      return {
        id: memberId,
        username: null,
        name: null,
        avatar: null,
        isManager: managers.includes(memberId),
        isCreator: portfolio.user_id === memberId,
      }
    })
  )

  // Get creator details
  const { data: creatorPortfolio } = await supabase
    .from('portfolios')
    .select('user_id, metadata')
    .eq('user_id', portfolio.user_id)
    .eq('type', 'human')
    .maybeSingle()

  let creatorInfo = null
  if (creatorPortfolio) {
    const creatorMetadata = creatorPortfolio.metadata as any
    const creatorBasic = creatorMetadata?.basic || {}
    creatorInfo = {
      id: portfolio.user_id,
      username: creatorMetadata?.username || null,
      name: creatorBasic.name || creatorMetadata?.full_name || null,
      avatar: creatorBasic.avatar || creatorMetadata?.avatar_url || null,
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          {/* Header */}
          <div className="mb-6">
            <Link
              href={getPortfolioUrl(portfolio.type, portfolio.id)}
              className="text-blue-600 hover:text-blue-800 mb-4 inline-block"
            >
              ← Back to Portfolio
            </Link>
            <h1 className="text-3xl font-bold mb-2">Members</h1>
            <p className="text-gray-600">{basic.name}</p>
          </div>

          {/* Members List */}
          <MembersPageClient
            portfolioId={portfolio.id}
            portfolioName={basic.name}
            portfolioType={portfolio.type}
            creatorInfo={creatorInfo}
            memberDetails={memberDetails}
            canManage={canManage}
            currentUserId={user?.id}
          />
        </div>
      </div>
    </div>
  )
}

