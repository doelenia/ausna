import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildCompoundText } from '@/lib/indexing/compound-text'
import { extractFromCompoundText } from '@/lib/indexing/extraction'
import {
  generateEmbedding,
  storeNoteVectors,
  storeAtomicKnowledge,
  createOrUpdateTopic,
  extractAdditionalTopicsFromAsks,
} from '@/lib/indexing/vectors'
import { cleanupPropertyIndexes } from '@/lib/indexing/property-processing'

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
      // 1. Cleanup existing indexes for this note
      await cleanupPropertyIndexes('note', noteId)

      // 2. Build compound text
      const compoundText = await buildCompoundText(note)

      // 3. Extract summary, atomic knowledge, topics, and asks
      const extraction = await extractFromCompoundText(compoundText)

      // 4. Generate embeddings
      const summaryVector = extraction.summary
        ? await generateEmbedding(extraction.summary)
        : null
      const compoundTextVector = await generateEmbedding(compoundText)

      // 5. Store note vectors
      await storeNoteVectors(noteId, summaryVector, compoundTextVector)

      // 6. Get assigned projects and human portfolio
      const assignedPortfolios = note.assigned_portfolios || []
      
      // Filter to only project portfolios
      const { data: portfolios } = await supabase
        .from('portfolios')
        .select('id, type')
        .in('id', assignedPortfolios)
      
      const assignedProjectIds = (portfolios || [])
        .filter((p) => p.type === 'projects')
        .map((p) => p.id)

      // Get human portfolio of note owner
      const { data: humanPortfolio } = await supabase
        .from('portfolios')
        .select('id')
        .eq('type', 'human')
        .eq('user_id', note.owner_account_id)
        .single()

      const humanPortfolioId = humanPortfolio?.id

      // 7. Process topics
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

      // 8. Store atomic knowledge (not asks)
      const allKnowledge = extraction.atomicKnowledge || []
      if (allKnowledge.length > 0) {
        await storeAtomicKnowledge(allKnowledge, {
          noteId,
          isAsks: new Array(allKnowledge.length).fill(false),
          assignedHuman: humanPortfolioId ? [humanPortfolioId] : [],
          assignedProjects: assignedProjectIds,
          topics: topicIds,
          sourceInfo: {
            source_type: 'note',
            source_id: noteId,
          },
        })
      }

      // 9. Store asks
      const allAsks = extraction.asks || []
      if (allAsks.length > 0) {
        // First, extract additional topics from asks
        const asksWithTopics = allAsks.map((ask) => ({
          ask,
          topics: extraction.topics || [],
        }))

        let additionalTopics: Array<{ name: string; description: string }> = []
        try {
          additionalTopics = await extractAdditionalTopicsFromAsks(asksWithTopics)
        } catch (error) {
          console.error('Failed to extract additional topics from asks:', error)
          // Continue without additional topics
        }

        // Process additional topics
        const additionalTopicIds: string[] = []
        for (const topic of additionalTopics) {
          try {
            const topicId = await createOrUpdateTopic(topic.name, topic.description, noteId)
            additionalTopicIds.push(topicId)
          } catch (error) {
            console.error(`Failed to process additional topic ${topic.name}:`, error)
            // Continue with other topics
          }
        }

        // Combine original topics with additional topics
        const allTopicIds = [...topicIds, ...additionalTopicIds]

        await storeAtomicKnowledge(allAsks, {
          noteId,
          isAsks: new Array(allAsks.length).fill(true),
          assignedHuman: humanPortfolioId ? [humanPortfolioId] : [],
          assignedProjects: assignedProjectIds,
          topics: allTopicIds,
          sourceInfo: {
            source_type: 'note',
            source_id: noteId,
          },
        })
      }

      // 10. Update note with summary, compound_text, topics, and status
      const { error: updateError } = await supabase
        .from('notes')
        .update({
          summary: extraction.summary || null,
          compound_text: compoundText,
          topics: topicIds,
          indexing_status: 'completed',
        })
        .eq('id', noteId)

      if (updateError) {
        throw new Error(`Failed to update note: ${updateError.message}`)
      }

      // 11. Process interest tracking for note topics
      if (topicIds.length > 0) {
        try {
          const { updateUserInterests } = await import('@/lib/indexing/interest-tracking')
          // Update user interests with weight 0.1 for posting a note
          await updateUserInterests(note.owner_account_id, topicIds, 0.1)
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

