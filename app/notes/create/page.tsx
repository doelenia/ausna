import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getHumanPortfolio } from '@/lib/portfolio/human'
import { Portfolio } from '@/types/portfolio'
import { getPortfolioBasic } from '@/lib/portfolio/helpers'
import { CreateNoteForm } from '@/components/notes/CreateNoteForm'
import { redirect } from 'next/navigation'
import { Content, UIText } from '@/components/ui'

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

  // Get source portfolio if provided - must be a project or activity
  let sourcePortfolio: Portfolio | null = null
  if (searchParams.portfolio) {
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', searchParams.portfolio)
      .in('type', ['projects', 'activities'])
      .single()

    if (!error && data) {
      sourcePortfolio = data as Portfolio
    }
  }
  
  // If portfolio was provided but is invalid, redirect
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
    <div className="bg-white shadow rounded-lg p-6">
          {annotatedNote && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <UIText as="p" className="mb-2">Annotating:</UIText>
              <Content as="p">{annotatedNote.text.substring(0, 200)}{annotatedNote.text.length > 200 ? '...' : ''}</Content>
            </div>
          )}

          <CreateNoteForm
            portfolios={portfolios}
            defaultPortfolioIds={defaultPortfolioIds}
            humanPortfolioId={undefined}
            mentionedNoteId={searchParams.annotate || undefined}
            redirectUrl="/main"
          />
        </div>
  )
}

