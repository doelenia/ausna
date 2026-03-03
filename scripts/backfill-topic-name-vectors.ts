/**
 * Backfill topics.name_vector from existing topic names.
 *
 * Usage (from project root):
 *   npx ts-node scripts/backfill-topic-name-vectors.ts
 */

import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

import { createServiceClient } from '../lib/supabase/service'
import { generateEmbedding } from '../lib/indexing/vectors'

async function main() {
  const supabase = createServiceClient()

  const pageSize = 50
  let processed = 0

  // Loop until no more topics without name_vector
  // We page by created_at so updates don't disturb iteration
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: topics, error } = await supabase
      .from('topics')
      .select('id, name')
      .is('name_vector', null)
      .order('created_at', { ascending: true })
      .limit(pageSize)

    if (error) {
      console.error('Failed to fetch topics without name_vector:', error)
      process.exit(1)
    }

    if (!topics || topics.length === 0) {
      break
    }

    console.log(`Processing batch of ${topics.length} topics...`)

    for (const topic of topics) {
      const id = (topic as { id: string }).id
      const name = (topic as { name: string }).name
      if (!id || !name || !name.trim()) {
        continue
      }

      try {
        const embedding = await generateEmbedding(name)
        const vectorText = `[${embedding.join(',')}]`

        const { error: updateError } = await supabase
          .from('topics')
          .update({ name_vector: vectorText as any })
          .eq('id', id)

        if (updateError) {
          console.error(`  FAIL update name_vector for topic ${id}:`, updateError)
        } else {
          processed++
          if (processed % 50 === 0) {
            console.log(`  Updated ${processed} topics so far...`)
          }
        }
      } catch (e) {
        console.error(`  ERROR generating embedding for topic ${id} (${name}):`, e)
      }
    }
  }

  console.log(`Done backfilling name_vector for topics. Total updated: ${processed}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

