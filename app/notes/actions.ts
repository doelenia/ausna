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
    const collectionIds = formData.get('collection_ids') as string | null

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

    // Validate: must have exactly one portfolio assigned
    if (portfolioIds.length !== 1) {
      return {
        success: false,
        error: 'Note must be assigned to exactly one project',
      }
    }

    const portfolioId = portfolioIds[0]

    // Validate that the assigned portfolio is a project (not human or community)
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('type')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return {
        success: false,
        error: 'Assigned portfolio not found',
      }
    }

    if (portfolio.type !== 'projects') {
      return {
        success: false,
        error: 'Note must be assigned to a project (not human or community portfolio)',
      }
    }

    // Validate that user can create notes in the assigned project (must be a member)
    const canCreate = await canCreateNoteInPortfolio(portfolioId, user.id)
    if (!canCreate) {
      return {
        success: false,
        error: 'You must be a member of the project to create notes',
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
      deleted_at: null,
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

    // Assign note to collections if provided
    if (collectionIds) {
      try {
        let collectionIdArray: string[] = []
        try {
          collectionIdArray = JSON.parse(collectionIds)
        } catch {
          // If not JSON, try comma-separated
          collectionIdArray = collectionIds.split(',').map((id) => id.trim()).filter(Boolean)
        }

        if (collectionIdArray.length > 0) {
          const insertData = collectionIdArray.map((collectionId: string) => ({
            note_id: note.id,
            collection_id: collectionId,
          }))

          const { error: collectionError } = await supabase
            .from('note_collections')
            .insert(insertData)

          if (collectionError) {
            console.error('Failed to assign note to collections:', collectionError)
            // Don't fail the entire operation, just log the error
          }
        }
      } catch (error: any) {
        console.error('Error assigning note to collections:', error)
        // Don't fail the entire operation, just log the error
      }
    }

    // Auto-add note to eligible portfolios' pinned lists
    // Only add to portfolios where user is owner and pinned list is not full
    try {
      const { addToPinned } = await import('@/app/portfolio/[type]/[id]/actions')
      const { isPortfolioOwner, getPinnedItemsCount } = await import('@/lib/portfolio/helpers')

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

    // Trigger background indexing (fire-and-forget)
    try {
      // Use absolute URL - in server actions, we need the full URL
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      
      // Use fetch without await - fire and forget
      fetch(`${baseUrl}/api/index-note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ noteId: note.id }),
      }).catch((error) => {
        // Log error but don't fail note creation
        console.error('Failed to trigger background indexing:', error)
      })
    } catch (error) {
      // Don't fail note creation if indexing trigger fails
      console.error('Error triggering background indexing:', error)
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

    // Get note's topics and intentions before deletion
    const { data: noteData } = await supabase
      .from('notes')
      .select('topics, intentions')
      .eq('id', noteId)
      .single()

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

    // Cleanup indexing data
    try {
      // 1. Delete atomic knowledge entries
      await supabase.from('atomic_knowledge').delete().eq('note_id', noteId)

      // 2. Delete note vectors
      await supabase.from('note_vectors').delete().eq('note_id', noteId)

      // 3. Update topics: decrement mention_count and remove note from mentions
      if (noteData?.topics && Array.isArray(noteData.topics) && noteData.topics.length > 0) {
        for (const topicId of noteData.topics) {
          const { data: topic } = await supabase
            .from('topics')
            .select('mention_count, mentions')
            .eq('id', topicId)
            .single()

          if (topic) {
            const updatedMentions = (topic.mentions || []).filter((id: string) => id !== noteId)
            const newCount = Math.max(0, (topic.mention_count || 0) - 1)

            if (newCount === 0) {
              // Delete topic if no mentions left
              await supabase.from('topics').delete().eq('id', topicId)
            } else {
              // Update topic
              await supabase
                .from('topics')
                .update({
                  mention_count: newCount,
                  mentions: updatedMentions,
                })
                .eq('id', topicId)
            }
          }
        }
      }

      // 4. Update intentions: decrement mention_count and remove note from mentions
      if (
        noteData?.intentions &&
        Array.isArray(noteData.intentions) &&
        noteData.intentions.length > 0
      ) {
        for (const intentionId of noteData.intentions) {
          const { data: intention } = await supabase
            .from('intentions')
            .select('mention_count, mentions')
            .eq('id', intentionId)
            .single()

          if (intention) {
            const updatedMentions = (intention.mentions || []).filter(
              (id: string) => id !== noteId
            )
            const newCount = Math.max(0, (intention.mention_count || 0) - 1)

            if (newCount === 0) {
              // Delete intention if no mentions left
              await supabase.from('intentions').delete().eq('id', intentionId)
            } else {
              // Update intention
              await supabase
                .from('intentions')
                .update({
                  mention_count: newCount,
                  mentions: updatedMentions,
                })
                .eq('id', intentionId)
            }
          }
        }
      }
    } catch (cleanupError) {
      // Log but don't fail deletion if cleanup fails
      console.error('Failed to cleanup indexing data:', cleanupError)
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

    // Validate: notes must be assigned to exactly one project
    if (assignedPortfolios.length > 0) {
      return {
        success: false,
        error: 'Note is already assigned to a project. Notes can only be assigned to one project.',
      }
    }

    // Validate the portfolio is a project
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select('type')
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return {
        success: false,
        error: 'Portfolio not found',
      }
    }

    if (portfolio.type !== 'projects') {
      return {
        success: false,
        error: 'Note must be assigned to a project (not human or community portfolio)',
      }
    }

    // Add portfolio to assigned list (only one project allowed)
    const updatedPortfolios = [portfolioId]

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
    const updatedPortfolios = assignedPortfolios.filter((id: string) => id !== portfolioId)

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

interface GetNotesByPortfolioPaginatedResult {
  success: boolean
  notes?: Note[]
  hasMore?: boolean
  error?: string
}

/**
 * Get notes assigned to a portfolio with pagination (including annotations)
 */
export async function getNotesByPortfolioPaginated(
  portfolioId: string,
  offset: number = 0,
  limit: number = 20
): Promise<GetNotesByPortfolioPaginatedResult> {
  try {
    const supabase = await createClient()

    // Query notes using RPC function to properly handle 'references' reserved keyword
    const { data: notes, error } = await supabase.rpc('get_notes_by_portfolio_with_refs', {
      portfolio_id_param: portfolioId,
      offset_val: offset,
      limit_val: limit
    })

    // Log the initial response immediately after the RPC call
    console.log('[getNotesByPortfolioPaginated] Initial RPC response:', {
      error,
      notesCount: notes?.length || 0,
      notes: notes?.map((note: any) => ({
        id: note.id,
        textPreview: note.text?.substring(0, 50),
        hasReferences: 'references' in note,
        referencesValue: note.references,
        referencesType: typeof note.references,
        referencesIsArray: Array.isArray(note.references),
        referencesLength: Array.isArray(note.references) ? note.references.length : 'N/A',
        allKeys: Object.keys(note),
      })) || [],
      rawResponse: JSON.stringify(notes, null, 2).substring(0, 2000), // First 2000 chars
    })

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to fetch notes',
      }
    }

    // Debug: log raw data from database - always log, even if references is null/empty
    if (notes && notes.length > 0) {
      notes.forEach((note: any) => {
        // Check all possible ways references might be stored (case variations, etc.)
        const refs = note.references || note.References || note['references'] || note['References']
        console.log('[getNotesByPortfolioPaginated] Raw DB data:', {
          noteId: note.id,
          hasReferences: 'references' in note,
          referencesRaw: note.references,
          referencesAlt: refs,
          referencesType: typeof note.references,
          referencesIsNull: note.references === null,
          referencesIsUndefined: note.references === undefined,
          isArray: Array.isArray(note.references),
          allNoteKeys: Object.keys(note),
          allNoteEntries: Object.entries(note).slice(0, 10).map(([k, v]) => [k, typeof v, Array.isArray(v) ? `array(${Array.isArray(v) ? (v as any[]).length : 0})` : 'not-array']),
          fullNote: JSON.stringify(note, null, 2).substring(0, 500), // First 500 chars
        })
      })
    }

    // Ensure references is an array for all notes (handle null/undefined cases)
    const notesWithReferences: Note[] = (notes || []).map((note: any) => {
      // Handle case where references might be a JSON string
      let references = note.references
      
      // Debug: log before normalization
      console.log('[getNotesByPortfolioPaginated] Before normalization:', {
        noteId: note.id,
        referencesBefore: references,
        referencesType: typeof references,
        isArray: Array.isArray(references),
        noteKeys: Object.keys(note),
      })
      
      if (typeof references === 'string') {
        try {
          references = JSON.parse(references)
        } catch (e) {
          console.error('Failed to parse references as JSON:', e)
          references = []
        }
      }
      
      // Preserve references if they exist and are valid
      const finalReferences = Array.isArray(references) 
        ? references 
        : (references !== null && references !== undefined ? [references] : [])
      
      // Debug: log after normalization
      console.log('[getNotesByPortfolioPaginated] After normalization:', {
        noteId: note.id,
        referencesAfter: finalReferences,
        referencesLength: finalReferences.length,
        noteWithRefs: {
          ...note,
          references: finalReferences,
        },
      })
      
      // Explicitly construct the note object to ensure references are included
      const normalizedNote: Note = {
        id: note.id,
        owner_account_id: note.owner_account_id,
        text: note.text,
        references: finalReferences, // Explicitly set references
        assigned_portfolios: note.assigned_portfolios || [],
        mentioned_note_id: note.mentioned_note_id,
        created_at: note.created_at,
        updated_at: note.updated_at,
        deleted_at: note.deleted_at,
        summary: note.summary || null,
        compound_text: note.compound_text || null,
        topics: note.topics || [],
        intentions: note.intentions || [],
        indexing_status: note.indexing_status || null,
      }
      
      // Final check - ensure references are preserved
      console.log('[getNotesByPortfolioPaginated] Final note:', {
        noteId: normalizedNote.id,
        finalReferences: normalizedNote.references,
        finalReferencesLength: Array.isArray(normalizedNote.references) ? normalizedNote.references.length : 'not-array',
        normalizedNoteStringified: JSON.stringify(normalizedNote).substring(0, 500),
      })
      
      return normalizedNote
    })

    // Check if there are more notes
    const { count } = await supabase
      .from('notes')
      .select('*', { count: 'exact', head: true })
      .contains('assigned_portfolios', [portfolioId])
      .is('deleted_at', null)

    const hasMore = count ? offset + notesWithReferences.length < count : false

    // Debug: log what we're returning
    console.log('[getNotesByPortfolioPaginated] Returning:', {
      notesCount: notesWithReferences.length,
      firstNoteRefs: notesWithReferences[0]?.references,
      firstNoteRefsLength: Array.isArray(notesWithReferences[0]?.references) ? notesWithReferences[0]?.references.length : 'N/A',
      firstNoteStringified: JSON.stringify(notesWithReferences[0] || {}).substring(0, 500),
    })

    // Force proper serialization by using JSON to ensure plain objects
    // Next.js server actions require plain serializable objects
    const serializedNotes = notesWithReferences.map((note, index) => {
      // Debug: log what we have before serialization
      console.log(`[getNotesByPortfolioPaginated] Before serialization [${index}]:`, {
        noteId: note.id,
        noteReferences: note.references,
        noteReferencesType: typeof note.references,
        noteReferencesIsArray: Array.isArray(note.references),
        noteReferencesLength: Array.isArray(note.references) ? note.references.length : 'N/A',
      })
      
      // Get references directly from the note object
      const refs = note.references || []
      
      // Build a plain object that's guaranteed to be serializable
      const plainNote = {
        id: String(note.id),
        owner_account_id: String(note.owner_account_id),
        text: String(note.text || ''),
        references: Array.isArray(refs) && refs.length > 0
          ? refs.map((ref: any) => {
              if (!ref || !ref.type || !ref.url) {
                console.warn(`[getNotesByPortfolioPaginated] Invalid ref in note ${note.id}:`, ref)
                return null
              }
              const plainRef: any = {
                type: String(ref.type),
                url: String(ref.url),
              }
              if (ref.type === 'url') {
                if (ref.hostIcon) plainRef.hostIcon = String(ref.hostIcon)
                if (ref.hostName) plainRef.hostName = String(ref.hostName)
                if (ref.title) plainRef.title = String(ref.title)
                if (ref.headerImage) plainRef.headerImage = String(ref.headerImage)
                if (ref.description) plainRef.description = String(ref.description)
              }
              return plainRef
            }).filter((ref: any) => ref !== null)
          : [],
        assigned_portfolios: Array.isArray(note.assigned_portfolios) 
          ? note.assigned_portfolios.map(String)
          : [],
        mentioned_note_id: note.mentioned_note_id ? String(note.mentioned_note_id) : null,
        created_at: String(note.created_at),
        updated_at: String(note.updated_at),
        deleted_at: note.deleted_at ? String(note.deleted_at) : null,
        summary: note.summary ? String(note.summary) : null,
        compound_text: note.compound_text ? String(note.compound_text) : null,
        topics: Array.isArray(note.topics) ? note.topics.map(String) : [],
        intentions: Array.isArray(note.intentions) ? note.intentions.map(String) : [],
        indexing_status: note.indexing_status || null,
      }
      
      // Debug: log what we're about to serialize
      console.log(`[getNotesByPortfolioPaginated] About to serialize [${index}]:`, {
        noteId: plainNote.id,
        referencesInPlainNote: plainNote.references,
        referencesLength: plainNote.references.length,
        plainNoteStringified: JSON.stringify(plainNote).substring(0, 500),
      })
      
      // Force serialization through JSON to ensure it's a plain object
      const serialized = JSON.parse(JSON.stringify(plainNote))
      
      // Debug: log after serialization
      console.log(`[getNotesByPortfolioPaginated] After serialization [${index}]:`, {
        noteId: serialized.id,
        referencesInSerialized: serialized.references,
        referencesLength: serialized.references.length,
        serializedStringified: JSON.stringify(serialized).substring(0, 500),
      })
      
      return serialized
    })

    // Final check before return
    console.log('[getNotesByPortfolioPaginated] Serialized notes check:', {
      firstNoteId: serializedNotes[0]?.id,
      firstNoteRefs: serializedNotes[0]?.references,
      firstNoteRefsLength: Array.isArray(serializedNotes[0]?.references) ? serializedNotes[0]?.references.length : 'N/A',
      firstNoteRefsStringified: JSON.stringify(serializedNotes[0]?.references || []),
    })

    return {
      success: true,
      notes: serializedNotes,
      hasMore,
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
    const targetNotePortfolios = targetNote.assigned_portfolios || []

    // Validate target note has exactly one project assigned
    if (targetNotePortfolios.length !== 1) {
      return {
        success: false,
        error: 'Cannot annotate: target note must be assigned to exactly one project',
      }
    }

    const targetProjectId = targetNotePortfolios[0]

    // Validate the target project exists and is a project type
    const { data: targetProject, error: projectError } = await supabase
      .from('portfolios')
      .select('type')
      .eq('id', targetProjectId)
      .single()

    if (projectError || !targetProject) {
      return {
        success: false,
        error: 'Target project not found',
      }
    }

    if (targetProject.type !== 'projects') {
      return {
        success: false,
        error: 'Target note must be assigned to a project',
      }
    }

    // If portfolio is provided, validate it matches the target note's project
    if (portfolioId && portfolioId !== targetProjectId) {
      return {
        success: false,
        error: 'Annotation must be assigned to the same project as the target note',
      }
    }

    // Validate user can create notes in the target project
    const canCreate = await canCreateNoteInPortfolio(targetProjectId, user.id)
    if (!canCreate) {
      return {
        success: false,
        error: 'You must be a member of the project to create annotations',
      }
    }

    // Set mentioned_note_id and assigned_portfolios (exactly one project)
    formData.append('mentioned_note_id', noteId)
    formData.append('assigned_portfolios', JSON.stringify([targetProjectId]))

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

