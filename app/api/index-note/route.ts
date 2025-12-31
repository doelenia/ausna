import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildCompoundText } from '@/lib/indexing/compound-text'
import { extractFromCompoundText } from '@/lib/indexing/extraction'
import {
  generateEmbedding,
  storeNoteVectors,
  storeAtomicKnowledge,
  createOrUpdateTopic,
  createOrUpdateIntention,
} from '@/lib/indexing/vectors'

/**
 * Background API route for indexing notes
 * Called asynchronously after note creation
 */
export async function POST(request: NextRequest) {
  try {
    const { noteId } = await request.json()

    if (!noteId) {
      return NextResponse.json({ error: 'noteId is required' }, { status: 400 })
    }

    // Use service client for background indexing operations (bypasses RLS)
    const supabase = createServiceClient()

    // Update status to processing
    await supabase
      .from('notes')
      .update({ indexing_status: 'processing' })
      .eq('id', noteId)

    // Fetch the note with all its data
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single()

    if (noteError || !note) {
      await supabase
        .from('notes')
        .update({ indexing_status: 'failed' })
        .eq('id', noteId)
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    try {
      // 1. Build compound text
      const compoundText = await buildCompoundText(note)

      // 2. Extract summary, atomic knowledge, topics, and intentions
      const extraction = await extractFromCompoundText(compoundText)

      // 3. Generate embeddings
      const summaryVector = extraction.summary
        ? await generateEmbedding(extraction.summary)
        : null
      const compoundTextVector = await generateEmbedding(compoundText)

      // 4. Store note vectors
      await storeNoteVectors(noteId, summaryVector, compoundTextVector)

      // 5. Store atomic knowledge
      if (extraction.atomicKnowledge && extraction.atomicKnowledge.length > 0) {
        await storeAtomicKnowledge(noteId, extraction.atomicKnowledge)
      }

      // 6. Process topics
      const topicIds: string[] = []
      if (extraction.topics && extraction.topics.length > 0) {
        for (const topic of extraction.topics) {
          try {
            const topicId = await createOrUpdateTopic(topic.name, topic.description, noteId)
            topicIds.push(topicId)
          } catch (error) {
            console.error(`Failed to process topic ${topic.name}:`, error)
            // Continue with other topics
          }
        }
      }

      // 7. Process intentions
      const intentionIds: string[] = []
      if (extraction.intentions && extraction.intentions.length > 0) {
        for (const intention of extraction.intentions) {
          try {
            const intentionId = await createOrUpdateIntention(
              intention.name,
              intention.description,
              noteId
            )
            intentionIds.push(intentionId)
          } catch (error) {
            console.error(`Failed to process intention ${intention.name}:`, error)
            // Continue with other intentions
          }
        }
      }

      // 8. Update note with summary, compound_text, topics, intentions, and status
      const { error: updateError } = await supabase
        .from('notes')
        .update({
          summary: extraction.summary || null,
          compound_text: compoundText,
          topics: topicIds,
          intentions: intentionIds,
          indexing_status: 'completed',
        })
        .eq('id', noteId)

      if (updateError) {
        throw new Error(`Failed to update note: ${updateError.message}`)
      }

      // 9. Process interest tracking for note topics
      if (topicIds.length > 0) {
        try {
          const { updateUserInterests } = await import('@/lib/indexing/interest-tracking')
          // Get note owner
          const { data: noteData } = await supabase
            .from('notes')
            .select('owner_account_id')
            .eq('id', noteId)
            .single()

          if (noteData?.owner_account_id) {
            // Update user interests with weight 0.1 for posting a note
            await updateUserInterests(noteData.owner_account_id, topicIds, 0.1)
          }
        } catch (interestError: any) {
          // Log error but don't fail indexing
          console.error('Failed to process interest tracking for note:', interestError)
        }
      }

      return NextResponse.json({ success: true, noteId })
    } catch (error: any) {
      console.error('Indexing error:', error)

      // Update status to failed
      await supabase
        .from('notes')
        .update({ indexing_status: 'failed' })
        .eq('id', noteId)

      return NextResponse.json(
        { error: error.message || 'Indexing failed' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

