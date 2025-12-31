import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getHumanPortfolio } from '@/lib/portfolio/human'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { CreateNoteForm } from '@/components/notes/CreateNoteForm'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface CreateNotePageProps {
  searchParams: {
    portfolio?: string
    annotate?: string
  }
}

export default async function CreateNotePage({ searchParams }: CreateNotePageProps) {
  const { user } = await requireAuth()
  const supabase = await createClient()

  // Get user's human portfolio
  const humanPortfolio = await getHumanPortfolio(user.id)
  if (!humanPortfolio) {
    redirect('/')
  }

  // Get source portfolio if provided - must be a project
  let sourcePortfolio: Portfolio | null = null
  if (searchParams.portfolio) {
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', searchParams.portfolio)
      .eq('type', 'projects')
      .single()

    if (!error && data) {
      sourcePortfolio = data as Portfolio
      // Verify it's actually a project portfolio
      if (sourcePortfolio.type !== 'projects') {
        sourcePortfolio = null
      }
    }
  }
  
  // If portfolio was provided but is not a project, redirect
  if (searchParams.portfolio && !sourcePortfolio) {
    redirect('/portfolio')
  }
  
  // Validate user is a member of the project if provided
  if (sourcePortfolio) {
    const { isPortfolioMember } = await import('@/lib/notes/helpers')
    const isMember = await isPortfolioMember(sourcePortfolio.id, user.id)
    if (!isMember) {
      redirect('/portfolio')
    }
  }

  // Get note being annotated if provided
  let annotatedNote: { id: string; text: string } | null = null
  if (searchParams.annotate) {
    const { data, error } = await supabase
      .from('notes')
      .select('id, text')
      .eq('id', searchParams.annotate)
      .single()

    if (!error && data) {
      annotatedNote = { id: data.id, text: data.text }
    }
  }

  // Build portfolios list: only source project portfolio (no human portfolio)
  const portfolios: Portfolio[] = []
  if (sourcePortfolio) {
    portfolios.push(sourcePortfolio)
  }

  // Default assigned portfolios: only the project (required)
  const defaultPortfolioIds: string[] = []
  if (sourcePortfolio) {
    defaultPortfolioIds.push(sourcePortfolio.id)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="mb-6">
            <Link
              href={sourcePortfolio ? `/portfolio/${sourcePortfolio.type}/${sourcePortfolio.id}/all` : '/portfolio'}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-4 inline-block"
            >
              ← Back
            </Link>
            <h1 className="text-3xl font-bold mb-2">
              {annotatedNote ? 'Annotate Note' : 'Create Note'}
            </h1>
            {annotatedNote && (
              <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">Annotating:</p>
                <p className="text-gray-900">{annotatedNote.text.substring(0, 200)}{annotatedNote.text.length > 200 ? '...' : ''}</p>
              </div>
            )}
          </div>

          <CreateNoteForm
            portfolios={portfolios}
            defaultPortfolioIds={defaultPortfolioIds}
            humanPortfolioId={undefined}
            mentionedNoteId={searchParams.annotate || undefined}
            redirectUrl={sourcePortfolio ? `/portfolio/${sourcePortfolio.type}/${sourcePortfolio.id}/all` : '/portfolio'}
          />
        </div>
      </div>
    </div>
  )
}

