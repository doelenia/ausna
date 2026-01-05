import { createClient } from '@/lib/supabase/server'
import { PortfolioSearchOptions, Portfolio } from '@/types/portfolio'
import { getPortfolioTypes, getPortfolioTypeDisplayName } from '@/lib/portfolio/routes'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import Link from 'next/link'
import { Title, Content, UIText, Button } from '@/components/ui'

interface PortfolioIndexPageProps {
  searchParams: {
    type?: string
    q?: string
    limit?: string
    offset?: string
  }
}

export default async function PortfolioIndexPage({ searchParams }: PortfolioIndexPageProps) {
  const supabase = await createClient()

  // Parse search options
  const searchOptions: PortfolioSearchOptions = {
    type: searchParams.type as any,
    query: searchParams.q,
    limit: searchParams.limit ? parseInt(searchParams.limit) : 20,
    offset: searchParams.offset ? parseInt(searchParams.offset) : 0,
    order_by: 'created_at',
    order: 'desc',
  }

  // Build query
  let query = supabase.from('portfolios').select('*')

  if (searchOptions.type) {
    const types = Array.isArray(searchOptions.type) 
      ? searchOptions.type 
      : [searchOptions.type]
    query = query.in('type', types)
  }

  if (searchOptions.query) {
    // Search in metadata.basic.name and metadata.basic.description
    // Using JSONB path queries
    query = query.or(
      `metadata->basic->>name.ilike.%${searchOptions.query}%,metadata->basic->>description.ilike.%${searchOptions.query}%`
    )
  }

  query = query
    .order(searchOptions.order_by || 'created_at', { ascending: searchOptions.order === 'asc' })
    .range(searchOptions.offset || 0, (searchOptions.offset || 0) + (searchOptions.limit || 20) - 1)

  const { data: portfolios, error } = await query

  if (error) {
    console.error('Error fetching portfolios:', error)
  }

  const portfolioTypes = getPortfolioTypes()

  return (
    <div className="mb-8">
          <Title as="h1" className="mb-4">Portfolios</Title>
          
          {/* Type filters */}
          <div className="flex gap-2 mb-4">
            <Button
              asLink
              href="/portfolio"
              variant={!searchParams.type ? 'primary' : 'secondary'}
            >
              <UIText>All</UIText>
            </Button>
            {portfolioTypes.map((type) => (
              <Button
                key={type}
                asLink
                href={`/portfolio?type=${type}`}
                variant={searchParams.type === type ? 'primary' : 'secondary'}
              >
                <UIText>{getPortfolioTypeDisplayName(type)}</UIText>
              </Button>
            ))}
          </div>

          {/* Search bar */}
          <form method="get" className="mb-6">
            <input
              type="text"
              name="q"
              placeholder="Search portfolios..."
              defaultValue={searchParams.q}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchParams.type && (
              <input type="hidden" name="type" value={searchParams.type} />
            )}
          </form>

          {/* Portfolio list */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {portfolios && portfolios.length > 0 ? (
            portfolios.map((portfolio: Portfolio) => {
              const basic = getPortfolioBasic(portfolio)
              return (
                <Link
                  key={portfolio.id}
                  href={getPortfolioUrl(portfolio.type, portfolio.id)}
                  className="bg-transparent rounded-lg p-6 transition-opacity hover:opacity-80"
                >
                  <Title as="h2" className="mb-2">{basic.name}</Title>
                  {basic.description && (
                    <Content as="p" className="mb-4 line-clamp-2">
                      {basic.description}
                    </Content>
                  )}
                  <UIText as="div">
                    {new Date(portfolio.created_at).toLocaleDateString()}
                  </UIText>
                </Link>
              )
            })
          ) : (
            <div className="col-span-full text-center py-12">
              <Content>No portfolios found.</Content>
            </div>
          )}
          </div>
        </div>
  )
}

