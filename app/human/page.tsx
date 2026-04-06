import { createClient } from '@/lib/supabase/server'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioUrl } from '@/lib/portfolio/routes'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import Link from 'next/link'
import { Title, Content, UIText, Button } from '@/components/ui'

interface HumanIndexPageProps {
  searchParams: {
    q?: string
    limit?: string
    offset?: string
  }
}

export default async function HumanIndexPage({ searchParams }: HumanIndexPageProps) {
  const supabase = await createClient()

  const limit = searchParams.limit ? parseInt(searchParams.limit) : 20
  const offset = searchParams.offset ? parseInt(searchParams.offset) : 0

  let query = supabase.from('portfolios').select('*').eq('type', 'human')

  if (searchParams.q) {
    query = query.or(
      `metadata->basic->>name.ilike.%${searchParams.q}%,metadata->basic->>description.ilike.%${searchParams.q}%`
    )
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)

  const { data: portfolios, error } = await query

  if (error) {
    console.error('Error fetching humans:', error)
  }

  return (
    <div className="mb-8">
      <Title as="h1" className="mb-4">
        Humans
      </Title>

      <div className="flex gap-2 mb-4">
        <Button asLink href="/human" variant="primary">
          <UIText>Humans</UIText>
        </Button>
        <Button asLink href="/spaces" variant="secondary">
          <UIText>Spaces</UIText>
        </Button>
      </div>

      <form method="get" className="mb-6">
        <input
          type="text"
          name="q"
          placeholder="Search humans..."
          defaultValue={searchParams.q}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {portfolios && portfolios.length > 0 ? (
          portfolios.map((portfolio: Portfolio) => {
            const basic = getPortfolioBasic(portfolio)
            return (
              <Link
                key={portfolio.id}
                href={getPortfolioUrl(portfolio)}
                className="bg-transparent rounded-lg p-6 transition-opacity hover:opacity-80"
              >
                <Title as="h2" className="mb-2">
                  {basic.name}
                </Title>
                {basic.description && (
                  <Content as="p" className="mb-4 line-clamp-2">
                    {basic.description}
                  </Content>
                )}
                <UIText as="div">{new Date(portfolio.created_at).toLocaleDateString()}</UIText>
              </Link>
            )
          })
        ) : (
          <div className="col-span-full text-center py-12">
            <Content>No humans found.</Content>
          </div>
        )}
      </div>
    </div>
  )
}
