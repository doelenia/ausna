import { Note, NoteReference, UrlReference, ImageReference } from '@/types/note'
import { createServiceClient } from '@/lib/supabase/service'
import { describeImage } from './image-description'

/**
 * Build compound text from note, its annotations, and references
 */
export async function buildCompoundText(note: Note): Promise<string> {
  const parts: string[] = []

  // 1. Add annotated note summary if this note mentions another note
  if (note.mentioned_note_id) {
    const supabase = createServiceClient()
    const { data: mentionedNote } = await supabase
      .from('notes')
      .select('summary, text')
      .eq('id', note.mentioned_note_id)
      .single()

    if (mentionedNote) {
      // Use summary if available, otherwise use text
      const annotatedText = mentionedNote.summary || mentionedNote.text || ''
      if (annotatedText) {
        parts.push(`[Annotated Note: ${annotatedText}]`)
      }
    }
  }

  // 2. Process references (images and URLs)
  const references = (note.references || []) as NoteReference[]
  
  // Get note text for context (will be used for image descriptions)
  const noteText = note.text || ''
  
  for (const ref of references) {
    if (ref.type === 'image') {
      const imageRef = ref as ImageReference
      try {
        // Get image description using ChatGPT vision API with note text as context
        const description = await describeImage(imageRef.url, noteText)
        parts.push(`[Image: ${description}]`)
      } catch (error) {
        console.error('Failed to describe image:', error)
        parts.push(`[Image: ${imageRef.url}]`)
      }
    } else if (ref.type === 'url') {
      const urlRef = ref as UrlReference
      const urlParts: string[] = []
      
      if (urlRef.hostName) {
        urlParts.push(`Host: ${urlRef.hostName}`)
      }
      if (urlRef.title) {
        urlParts.push(`Title: ${urlRef.title}`)
      }
      if (urlRef.url) {
        urlParts.push(`URL: ${urlRef.url}`)
      }
      if (urlRef.description) {
        urlParts.push(`Description: ${urlRef.description}`)
      }
      
      if (urlParts.length > 0) {
        parts.push(`[URL Reference: ${urlParts.join(', ')}]`)
      } else {
        parts.push(`[URL Reference: ${urlRef.url}]`)
      }
    }
  }

  // 3. Add note text
  if (note.text) {
    parts.push(note.text)
  }

  return parts.join('\n\n')
}

