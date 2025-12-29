import { createClient } from '@/lib/supabase/server'
import { PortfolioSearchOptions, Portfolio } from '@/types/portfolio'
import { getPortfolioTypes, getPortfolioTypeDisplayName } from '@/lib/portfolio/routes'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import Link from 'next/link'

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
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Portfolios</h1>
          
          {/* Type filters */}
          <div className="flex gap-2 mb-4">
            <Link
              href="/portfolio"
              className={`px-4 py-2 rounded-lg ${
                !searchParams.type
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              All
            </Link>
            {portfolioTypes.map((type) => (
              <Link
                key={type}
                href={`/portfolio?type=${type}`}
                className={`px-4 py-2 rounded-lg ${
                  searchParams.type === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {getPortfolioTypeDisplayName(type)}
              </Link>
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
        </div>

        {/* Portfolio list */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {portfolios && portfolios.length > 0 ? (
            portfolios.map((portfolio: Portfolio) => {
              const basic = getPortfolioBasic(portfolio)
              return (
                <Link
                  key={portfolio.id}
                  href={getPortfolioUrl(portfolio.type, portfolio.id)}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="mb-2">
                    <span className="text-xs font-semibold text-blue-600 uppercase">
                      {getPortfolioTypeDisplayName(portfolio.type)}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold mb-2">{basic.name}</h2>
                  {basic.description && (
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                      {basic.description}
                    </p>
                  )}
                  <div className="text-xs text-gray-500">
                    {new Date(portfolio.created_at).toLocaleDateString()}
                  </div>
                </Link>
              )
            })
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-gray-500">No portfolios found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

