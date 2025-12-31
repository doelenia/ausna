import { createClient } from '@/lib/supabase/server'
import { getNoteById, getAnnotationsByNote } from '@/app/notes/actions'
import { canCreateNoteInPortfolio } from '@/lib/notes/helpers'
import { NoteView } from '@/components/notes/NoteView'
import { notFound } from 'next/navigation'
import Link from 'next/link'

interface NotePageProps {
  params: {
    id: string
  }
}

export default async function NotePage({ params }: NotePageProps) {
  const supabase = await createClient()
  
  // Get user if authenticated, but don't require it (notes are publicly viewable)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get the note (allow deleted notes if this is an annotation being viewed individually)
  const noteResult = await getNoteById(params.id, true) // Include deleted to check if referenced note is deleted
  if (!noteResult.success || !noteResult.notes || noteResult.notes.length === 0) {
    notFound()
  }

  const note = noteResult.notes[0]

  // If note is deleted, show 404 (can't view deleted notes directly)
  if (note.deleted_at) {
    notFound()
  }

  // If this is an annotation, check if the referenced note is deleted
  let referencedNoteDeleted = false
  if (note.mentioned_note_id) {
    const referencedNoteResult = await getNoteById(note.mentioned_note_id, true)
    if (referencedNoteResult.success && referencedNoteResult.notes && referencedNoteResult.notes.length > 0) {
      referencedNoteDeleted = referencedNoteResult.notes[0].deleted_at !== null
    }
  }

  // Get annotations
  const annotationsResult = await getAnnotationsByNote(note.id)
  const annotations = annotationsResult.success ? annotationsResult.notes || [] : []

  // Get all portfolios assigned to this note
  const portfolioIds = note.assigned_portfolios || []
  
  // Fetch portfolios
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('*')
    .in('id', portfolioIds)

  // Get all human portfolios for creators (owners of assigned portfolios + note owner)
  const creatorUserIds = new Set<string>()
  creatorUserIds.add(note.owner_account_id) // Note owner
  
  if (portfolios) {
    portfolios.forEach((portfolio) => {
      creatorUserIds.add(portfolio.user_id) // Portfolio owners
      // Also add members if it's a project/community
      const metadata = portfolio.metadata as any
      const members = metadata?.members || []
      if (Array.isArray(members)) {
        members.forEach((memberId: string) => creatorUserIds.add(memberId))
      }
    })
  }

  // Fetch all human portfolios for creators
  const { data: humanPortfolios } = await supabase
    .from('portfolios')
    .select('*')
    .eq('type', 'human')
    .in('user_id', Array.from(creatorUserIds))

  // Check if user can annotate (must be member of at least one portfolio)
  // Only check if user is authenticated
  let canAnnotate = false
  if (user && portfolios && portfolios.length > 0) {
    for (const portfolio of portfolios) {
      const canCreate = await canCreateNoteInPortfolio(portfolio.id, user.id)
      if (canCreate) {
        canAnnotate = true
        break
      }
    }
  }

  // Get the first portfolio for annotate link (or use the first one)
  const firstPortfolio = portfolios && portfolios.length > 0 ? portfolios[0] : null

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          {firstPortfolio && (
            <Link
              href={`/portfolio/${firstPortfolio.type}/${firstPortfolio.id}/all`}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-4 inline-block"
            >
              ← Back to Portfolio
            </Link>
          )}
        </div>

        <NoteView
          note={note}
          annotations={annotations}
          portfolios={portfolios || []}
          humanPortfolios={humanPortfolios || []}
          currentUserId={user?.id}
          canAnnotate={canAnnotate}
          annotatePortfolioId={firstPortfolio?.id}
          referencedNoteDeleted={referencedNoteDeleted}
        />
      </div>
    </div>
  )
}

