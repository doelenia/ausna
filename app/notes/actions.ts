'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { Note, CreateNoteInput, NoteReference, UrlReference } from '@/types/note'
import { uploadNoteImage } from '@/lib/storage/note-images-server'
import { fetchUrlMetadata } from '@/lib/notes/url-metadata'
import { canCreateNoteInPortfolio, canRemoveNoteFromPortfolio } from '@/lib/notes/helpers'
import { getHostnameFromUrl, getFaviconUrl } from '@/lib/notes/url-helpers'
import { isHumanPortfolio, Portfolio } from '@/types/portfolio'

interface CreateNoteResult {
  success: boolean
  noteId?: string
  error?: string
}

interface DeleteNoteResult {
  success: boolean
  error?: string
}

interface AddNoteToPortfolioResult {
  success: boolean
  error?: string
}

interface RemoveNoteFromPortfolioResult {
  success: boolean
  error?: string
}

interface GetNotesResult {
  success: boolean
  notes?: Note[]
  error?: string
}

/**
 * Create a new note
 */
export async function createNote(formData: FormData): Promise<CreateNoteResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    const text = formData.get('text') as string
    const assignedPortfolios = formData.get('assigned_portfolios') as string | null
    const mentionedNoteId = formData.get('mentioned_note_id') as string | null
    const url = formData.get('url') as string | null

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'Note text is required',
      }
    }

    // Parse assigned portfolios
    let portfolioIds: string[] = []
    if (assignedPortfolios) {
      try {
        portfolioIds = JSON.parse(assignedPortfolios)
      } catch {
        // If not JSON, try comma-separated
        portfolioIds = assignedPortfolios.split(',').map((id) => id.trim()).filter(Boolean)
      }
    }

    // Validate that user can create notes in all assigned portfolios
    for (const portfolioId of portfolioIds) {
      const canCreate = await canCreateNoteInPortfolio(portfolioId, user.id)
      if (!canCreate) {
        return {
          success: false,
          error: `You do not have permission to create notes in portfolio ${portfolioId}`,
        }
      }
    }

    // Process image uploads
    const imageFiles: File[] = []
    
    // Get all image files from formData
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('image_') && value instanceof File && value.size > 0) {
        imageFiles.push(value)
      }
    }
    
    console.log(`Found ${imageFiles.length} image files to upload`)

    // Create note first (we need the ID for image uploads)
    const noteData: Omit<Note, 'id' | 'created_at' | 'updated_at'> = {
      owner_account_id: user.id,
      text: text.trim(),
      references: [],
      assigned_portfolios: portfolioIds,
      mentioned_note_id: mentionedNoteId || null,
    }

    const { data: note, error: noteError } = await supabase
      .from('notes')
      .insert(noteData)
      .select()
      .single()

    if (noteError || !note) {
      return {
        success: false,
        error: noteError?.message || 'Failed to create note',
      }
    }

    // Upload images and update references
    const uploadedImageReferences: NoteReference[] = []
    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i]
      if (imageFile.size > 0) {
        try {
          console.log(`Uploading image ${i + 1}/${imageFiles.length} for note ${note.id}`)
          const uploadResult = await uploadNoteImage(note.id, imageFile)
          console.log('Image upload result:', uploadResult)
          uploadedImageReferences.push({
            type: 'image',
            url: uploadResult.url,
          })
          console.log(`Successfully uploaded image ${i + 1}, URL: ${uploadResult.url}`)
        } catch (error: any) {
          console.error(`Failed to upload image ${i + 1}:`, error)
          console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            noteId: note.id,
            fileName: imageFile.name,
            fileSize: imageFile.size,
          })
          // Continue with other images even if one fails
        }
      }
    }
    
    console.log(`Successfully uploaded ${uploadedImageReferences.length} out of ${imageFiles.length} images`)

    // Process URL reference if provided
    let urlReference: UrlReference | null = null
    if (url && url.trim().length > 0) {
      console.log(`Processing URL reference: ${url.trim()}`)
      try {
        // Fetch URL metadata and store images
        urlReference = await fetchUrlMetadata(url.trim(), note.id, true)
        console.log('URL metadata fetched successfully:', urlReference)
      } catch (error: any) {
        console.error('Failed to fetch URL metadata:', error)
        // Create basic URL reference with host name and icon (always ensure these are set)
        // Normalize URL to ensure it has a protocol
        let normalizedUrl = url.trim()
        if (!normalizedUrl.match(/^https?:\/\//i)) {
          normalizedUrl = `https://${normalizedUrl}`
        }
        const hostName = getHostnameFromUrl(normalizedUrl)
        const hostIcon = getFaviconUrl(hostName)
        urlReference = {
          type: 'url',
          url: normalizedUrl,
          hostName,
          hostIcon,
        }
      }
    }

    // Combine all references
    const allReferences: NoteReference[] = [
      ...uploadedImageReferences,
      ...(urlReference ? [urlReference] : []),
    ]

    console.log(`Total references to save: ${allReferences.length}`, allReferences)

    // Update note with references (only if we have any)
    if (allReferences.length > 0) {
      console.log(`Updating note ${note.id} with ${allReferences.length} references:`, JSON.stringify(allReferences, null, 2))
      const { data: updatedNote, error: updateError } = await supabase
        .from('notes')
        .update({ references: allReferences })
        .eq('id', note.id)
        .select('references')
        .single()

      if (updateError) {
        console.error('Failed to update note with references:', updateError)
        console.error('Update error details:', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
        })
        // Return error so user knows references weren't saved
        return {
          success: false,
          error: `Note created but failed to save references: ${updateError.message}`,
        }
      }
      
      console.log('References saved successfully. Updated note:', updatedNote)
      
      // Verify the references were saved correctly
      if (updatedNote && Array.isArray(updatedNote.references)) {
        console.log(`Verified: Note now has ${updatedNote.references.length} references`)
      } else {
        console.warn('Warning: References may not have been saved correctly. Updated note:', updatedNote)
      }
    } else {
      console.log('No references to save')
    }

    // Auto-add note to eligible portfolios' pinned lists
    // Only add to portfolios where user is owner and pinned list is not full
    try {
      const { addToPinned } = await import('@/app/portfolio/[type]/[id]/actions')
      const { isPortfolioOwner, getPinnedItemsCount } = await import('@/lib/portfolio/helpers')
      const { Portfolio } = await import('@/types/portfolio')

      // Get all assigned portfolios
      for (const portfolioId of portfolioIds) {
        try {
          // Check if user is owner
          const isOwner = await isPortfolioOwner(portfolioId, user.id)
          if (!isOwner) {
            continue
          }

          // Get portfolio to check pinned count
          const { data: portfolio } = await supabase
            .from('portfolios')
            .select('*')
            .eq('id', portfolioId)
            .single()

          if (!portfolio) {
            continue
          }

          const portfolioData = portfolio as Portfolio
          const pinnedCount = getPinnedItemsCount(portfolioData)

          // Only add if pinned list is not full (max 9 items)
          if (pinnedCount < 9) {
            // Check if note is already pinned
            const metadata = portfolioData.metadata as any
            const pinned = metadata?.pinned || []
            const isAlreadyPinned = Array.isArray(pinned) && pinned.some(
              (item: any) => item.type === 'note' && item.id === note.id
            )

            if (!isAlreadyPinned) {
              // Add to pinned list
              await addToPinned(portfolioId, 'note', note.id)
            }
          }
        } catch (err) {
          // Continue with other portfolios even if one fails
          console.error(`Failed to auto-pin note to portfolio ${portfolioId}:`, err)
        }
      }
    } catch (err) {
      // Don't fail note creation if auto-pinning fails
      console.error('Failed to auto-pin note:', err)
    }

    return {
      success: true,
      noteId: note.id,
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Delete a note
 */
export async function deleteNote(noteId: string): Promise<DeleteNoteResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Check ownership
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('owner_account_id, references')
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return {
        success: false,
        error: 'Note not found',
      }
    }

    if (note.owner_account_id !== user.id) {
      return {
        success: false,
        error: 'You do not have permission to delete this note',
      }
    }

    // Soft delete: Set deleted_at timestamp instead of actually deleting
    // This preserves the note and its relationships so annotations can show a placeholder
    // Delete all associated images from storage
    // This includes:
    // 1. Direct image uploads (ref.type === 'image')
    // 2. URL reference images (headerImage, hostIcon)
    // 3. All files in the note's folder (notes/{noteId}/)
    try {
      const { deleteAllNoteImages } = await import('@/lib/storage/note-images-server')
      await deleteAllNoteImages(noteId)
      console.log(`Successfully deleted all images for note ${noteId}`)
    } catch (error: any) {
      console.error('Failed to delete note images:', error)
      // Continue with note deletion even if image deletion fails
      // Individual image cleanup is best-effort
      
      // Fallback: Try to delete individual images from references
      const references = (note.references || []) as NoteReference[]
      for (const ref of references) {
        if (ref.type === 'image') {
          try {
            const { deleteNoteImage } = await import('@/lib/storage/note-images-server')
            await deleteNoteImage(ref.url)
          } catch (err) {
            console.error('Failed to delete individual note image:', err)
          }
        } else if (ref.type === 'url') {
          const urlRef = ref as UrlReference
          // Delete header image if it's stored in our bucket
          if (urlRef.headerImage && urlRef.headerImage.includes('/note-images/')) {
            try {
              const { deleteNoteImage } = await import('@/lib/storage/note-images-server')
              await deleteNoteImage(urlRef.headerImage)
            } catch (err) {
              console.error('Failed to delete URL header image:', err)
            }
          }
          // Delete host icon if it's stored in our bucket
          if (urlRef.hostIcon && urlRef.hostIcon.includes('/note-images/')) {
            try {
              const { deleteNoteImage } = await import('@/lib/storage/note-images-server')
              await deleteNoteImage(urlRef.hostIcon!)
            } catch (err) {
              console.error('Failed to delete URL host icon:', err)
            }
          }
        }
      }
    }

    // Soft delete: Set deleted_at timestamp
    const { error: deleteError } = await supabase
      .from('notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', noteId)

    if (deleteError) {
      return {
        success: false,
        error: deleteError.message || 'Failed to delete note',
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Add a note to a portfolio
 */
export async function addNoteToPortfolio(
  noteId: string,
  portfolioId: string
): Promise<AddNoteToPortfolioResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Check note ownership
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('owner_account_id, assigned_portfolios')
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return {
        success: false,
        error: 'Note not found',
      }
    }

    if (note.owner_account_id !== user.id) {
      return {
        success: false,
        error: 'You can only add your own notes to portfolios',
      }
    }

    // Check permission to add to portfolio
    const canCreate = await canCreateNoteInPortfolio(portfolioId, user.id)
    if (!canCreate) {
      return {
        success: false,
        error: 'You do not have permission to add notes to this portfolio',
      }
    }

    // Check if already assigned
    const assignedPortfolios = note.assigned_portfolios || []
    if (assignedPortfolios.includes(portfolioId)) {
      return {
        success: false,
        error: 'Note is already assigned to this portfolio',
      }
    }

    // Add portfolio to assigned list
    const updatedPortfolios = [...assignedPortfolios, portfolioId]

    const { error: updateError } = await supabase
      .from('notes')
      .update({ assigned_portfolios: updatedPortfolios })
      .eq('id', noteId)

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to add note to portfolio',
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Remove a note from a portfolio
 */
export async function removeNoteFromPortfolio(
  noteId: string,
  portfolioId: string
): Promise<RemoveNoteFromPortfolioResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Get note and portfolio info
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('owner_account_id, assigned_portfolios')
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      return {
        success: false,
        error: 'Note not found',
      }
    }

    // Get portfolio to check if it's a human portfolio
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('user_id, type')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    // Check permission
    const canRemove = await canRemoveNoteFromPortfolio(noteId, portfolioId, user.id)
    if (!canRemove) {
      return {
        success: false,
        error: 'You do not have permission to remove this note from this portfolio',
      }
    }

    // Remove portfolio from assigned list
    const assignedPortfolios = note.assigned_portfolios || []
    const updatedPortfolios = assignedPortfolios.filter((id) => id !== portfolioId)

    const { error: updateError } = await supabase
      .from('notes')
      .update({ assigned_portfolios: updatedPortfolios })
      .eq('id', noteId)

    if (updateError) {
      return {
        success: false,
        error: updateError.message || 'Failed to remove note from portfolio',
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Get notes assigned to a portfolio (including annotations)
 */
export async function getNotesByPortfolio(portfolioId: string): Promise<GetNotesResult> {
  try {
    const supabase = await createClient()

    const { data: notes, error } = await supabase
      .from('notes')
      .select('*')
      .contains('assigned_portfolios', [portfolioId])
      .is('deleted_at', null) // Only fetch non-deleted notes
      // Include both top-level notes and annotations
      .order('created_at', { ascending: false })

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to fetch notes',
      }
    }

    // Ensure references is an array for all notes (handle null/undefined cases)
    const notesWithReferences: Note[] = (notes || []).map((note: any) => ({
      ...note,
      references: Array.isArray(note.references) ? note.references : [],
    }))

    return {
      success: true,
      notes: notesWithReferences,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Get a note by ID (including deleted notes, for viewing annotations individually)
 */
export async function getNoteById(noteId: string, includeDeleted: boolean = false): Promise<GetNotesResult> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('notes')
      .select('*')
      .eq('id', noteId)
    
    if (!includeDeleted) {
      query = query.is('deleted_at', null) // Only fetch non-deleted notes by default
    }
    
    const { data: note, error } = await query.single()

    if (error || !note) {
      return {
        success: false,
        error: 'Note not found',
      }
    }

    // Ensure references is an array (handle null/undefined cases)
    const noteWithReferences: Note = {
      ...note,
      references: Array.isArray(note.references) ? note.references : [],
    }

    console.log('Note fetched:', {
      id: noteWithReferences.id,
      referencesCount: noteWithReferences.references?.length || 0,
      references: noteWithReferences.references,
    })

    return {
      success: true,
      notes: [noteWithReferences],
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Get user portfolios for note creation
 */
export async function getUserPortfoliosForNotes(): Promise<{
  success: boolean
  portfolios?: Portfolio[]
  error?: string
}> {
  try {
    const { user } = await requireAuth()
    const { getUserPortfolios } = await import('@/lib/notes/helpers')
    const portfolios = await getUserPortfolios(user.id)
    
    return {
      success: true,
      portfolios,
    }
  } catch (error: any) {
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Get annotations for a note (notes that mention this note)
 * Filters out annotations where the referenced note (the note being annotated) is deleted
 * When viewing a note, hide annotations if the note they reference is deleted
 */
export async function getAnnotationsByNote(noteId: string): Promise<GetNotesResult> {
  try {
    const supabase = await createClient()

    // Get all annotations (notes that mention this note)
    const { data: annotations, error: annotationsError } = await supabase
      .from('notes')
      .select('*')
      .eq('mentioned_note_id', noteId)
      .is('deleted_at', null) // Only get non-deleted annotations
      .order('created_at', { ascending: true })

    if (annotationsError) {
      return {
        success: false,
        error: annotationsError.message || 'Failed to fetch annotations',
      }
    }

    // Check if the note being annotated (noteId) is deleted
    // If it is, filter out these annotations when viewing under the note
    // (since user already sees the annotation content at the top when viewing individually)
    const { data: referencedNote } = await supabase
      .from('notes')
      .select('id, deleted_at')
      .eq('id', noteId)
      .single()

    // If the referenced note is deleted, filter out annotations
    // (hide them when viewing under the note, but show them when viewing individually)
    if (referencedNote && referencedNote.deleted_at) {
      return {
        success: true,
        notes: [], // Hide annotations when referenced note is deleted
      }
    }

    return {
      success: true,
      notes: (annotations || []) as Note[],
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

/**
 * Create an annotation (note that mentions another note)
 */
export async function createAnnotation(
  noteId: string,
  formData: FormData
): Promise<CreateNoteResult> {
  try {
    const { user } = await requireAuth()
    const supabase = await createClient()

    // Verify the note being annotated exists
    const { data: targetNote, error: noteError } = await supabase
      .from('notes')
      .select('assigned_portfolios')
      .eq('id', noteId)
      .single()

    if (noteError || !targetNote) {
      return {
        success: false,
        error: 'Note not found',
      }
    }

    // Get portfolio from query param or use target note's portfolios
    const portfolioId = formData.get('portfolio_id') as string | null
    const assignedPortfolios = targetNote.assigned_portfolios || []

    // If portfolio is provided, check permission and add to assigned portfolios
    if (portfolioId) {
      const canCreate = await canCreateNoteInPortfolio(portfolioId, user.id)
      if (!canCreate) {
        return {
          success: false,
          error: 'You do not have permission to annotate notes in this portfolio',
        }
      }
      // Add portfolio if not already assigned
      if (!assignedPortfolios.includes(portfolioId)) {
        assignedPortfolios.push(portfolioId)
      }
    }

    // Set mentioned_note_id and assigned_portfolios
    formData.append('mentioned_note_id', noteId)
    formData.append('assigned_portfolios', JSON.stringify(assignedPortfolios))

    // Use createNote with the modified formData
    return await createNote(formData)
  } catch (error: any) {
    if (error && typeof error === 'object' && ('digest' in error || 'message' in error)) {
      const digest = (error as any).digest || ''
      if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
        throw error
      }
    }
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    }
  }
}

