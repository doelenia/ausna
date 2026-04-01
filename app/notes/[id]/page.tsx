import { createClient } from '@/lib/supabase/server'
import { getNoteById } from '@/app/notes/actions'
import { canAnnotateNote } from '@/lib/notes/helpers'
import { NotePageClient } from './NotePageClient'
import { notFound, redirect } from 'next/navigation'
import { UIText } from '@/components/ui'
import type { Note } from '@/types/note'
import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/utils/site-url'

interface NotePageProps {
  params: {
    id: string
  }
}

function normalizeNoteText(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function excerpt(text: string, maxLen: number): string {
  const t = normalizeNoteText(text)
  if (!t) return ''
  if (t.length <= maxLen) return t
  return `${t.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`
}

export async function generateMetadata({
  params,
}: NotePageProps): Promise<Metadata> {
  const noteId = params.id
  if (!noteId || typeof noteId !== 'string') return {}

  const base = getSiteUrl()
  const url = `${base}/notes/${encodeURIComponent(noteId)}`

  const noteResult = await getNoteById(noteId, true)
  if (!noteResult.success || !noteResult.notes || noteResult.notes.length === 0) {
    return { alternates: { canonical: url } }
  }

  const rawNote = noteResult.notes[0] as Note

  // If user shares an annotation/reaction link, preview the root note instead.
  if (rawNote.mentioned_note_id) {
    const rootNoteId = rawNote.parent_note_id ?? rawNote.mentioned_note_id
    if (rootNoteId) {
      const canonical = `${base}/notes/${encodeURIComponent(rootNoteId)}`
      return { alternates: { canonical } }
    }
  }

  if (rawNote.deleted_at) {
    return { alternates: { canonical: url } }
  }

  const authorName =
    rawNote.author_profiles?.find((p) => p?.id === rawNote.owner_account_id)?.name ||
    rawNote.author_profiles?.[0]?.name ||
    'Someone'

  const content = normalizeNoteText(rawNote.text || '')
  const noteTitle = (rawNote.metadata as any)?.title
  const hasTitle = typeof noteTitle === 'string' && noteTitle.trim().length > 0

  const title = hasTitle
    ? `${authorName}: ${noteTitle.trim()}`
    : `A note from ${authorName}: ${excerpt(content, 80)}`

  const description = excerpt(content, 140)

  const ogImageUrl = `${base}/notes/${encodeURIComponent(noteId)}/opengraph-image`

  // The og image endpoint handles: first image ref -> cover, else url ref -> link icon, else fallback.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'article',
      url,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default async function NotePage({ params }: NotePageProps) {
  const supabase = await createClient()
  
  // Get user if authenticated, but don't require it (notes are publicly viewable)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get the note (allow deleted notes initially so we can handle annotation redirects)
  const noteResult = await getNoteById(params.id, true) // Include deleted to check if referenced note is deleted
  if (!noteResult.success || !noteResult.notes || noteResult.notes.length === 0) {
    notFound()
  }

  const rawNote = noteResult.notes[0] as Note

  const isAnnotationOrReaction = !!rawNote.mentioned_note_id

  if (isAnnotationOrReaction) {
    // For annotations and reactions, parent_note_id should be the root note of the thread.
    // Fallback to mentioned_note_id if parent_note_id is missing for older data.
    const rootNoteId = rawNote.parent_note_id ?? rawNote.mentioned_note_id!

    redirect(`/notes/${rootNoteId}#annotation-${rawNote.id}`)
  }

  let note: Note = rawNote
  let initialAnnotationId: string | null = null

  // If primary note is deleted, show 404 (can't view deleted notes directly)
  if (note.deleted_at) {
    notFound()
  }

  // Get all portfolios assigned to this note
  const portfolioIds = note.assigned_portfolios || []
  
  // Fetch data in parallel for better performance
  // Note: Annotations are loaded dynamically client-side for better performance
  const [
    referencedNoteResult,
    portfoliosData
  ] = await Promise.all([
    // Check if referenced note is deleted (only if this is an annotation)
    note.mentioned_note_id 
      ? getNoteById(note.mentioned_note_id, true)
      : Promise.resolve({ success: false, notes: [] }),
    // Fetch portfolios
    portfolioIds.length > 0
      ? supabase.from('portfolios').select('*').in('id', portfolioIds)
      : Promise.resolve({ data: null, error: null })
  ])

  // Process referenced note result
  let referencedNoteDeleted = false
  if (note.mentioned_note_id && referencedNoteResult.success && referencedNoteResult.notes && referencedNoteResult.notes.length > 0) {
    referencedNoteDeleted = referencedNoteResult.notes[0].deleted_at !== null
  }

  // Annotations will be loaded dynamically client-side
  const annotations: Note[] = []

  // Process portfolios
  const portfolios = portfoliosData.data

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

  // Fetch human portfolios and check annotation permissions in parallel
  const [
    humanPortfoliosResult,
    canAnnotateResult
  ] = await Promise.all([
    // Fetch all human portfolios for creators
    creatorUserIds.size > 0
      ? supabase
          .from('portfolios')
          .select('*')
          .eq('type', 'human')
          .in('user_id', Array.from(creatorUserIds))
      : Promise.resolve({ data: null, error: null }),
    // Check if user can annotate based on note's annotation_privacy (everyone / friends / authors)
    // Default: treat missing annotation_privacy as 'everyone'
    user
      ? canAnnotateNote(note, portfolios || [], user.id)
      : Promise.resolve(false)
  ])

  const humanPortfolios = humanPortfoliosResult.data
  const canAnnotate = canAnnotateResult

  // Get the first portfolio for annotate link (or use the first one)
  const firstPortfolio = portfolios && portfolios.length > 0 ? portfolios[0] : null

  return (
    <NotePageClient
      noteId={note.id}
      serverNote={note}
      annotations={annotations}
      portfolios={portfolios || []}
      humanPortfolios={humanPortfolios || []}
      currentUserId={user?.id}
      canAnnotate={canAnnotate}
      annotatePortfolioId={firstPortfolio?.id}
      referencedNoteDeleted={referencedNoteDeleted}
      initialAnnotationId={initialAnnotationId}
    />
  )
}

