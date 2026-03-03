/**
 * Backfill activity indexing: run processActivityDescription for all existing activity portfolios.
 *
 * Run once after deploying activity description indexing (e.g. for existing activities created before the feature).
 *
 * Usage (from project root):
 *   npx tsx scripts/backfill-activity-indexing.ts
 */

import { config } from 'dotenv'

// Load .env.local so Supabase and OpenAI env vars are available when run from CLI
config({ path: '.env.local' })
config({ path: '.env' })

import { createServiceClient } from '../lib/supabase/service'
import { processActivityDescription } from '../lib/indexing/property-processing'

async function main() {
  const supabase = createServiceClient()

  const { data: portfolios, error } = await supabase
    .from('portfolios')
    .select('id, user_id, metadata')
    .eq('type', 'activities')

  if (error) {
    console.error('Failed to fetch activities:', error)
    process.exit(1)
  }

  if (!portfolios || portfolios.length === 0) {
    console.log('No activity portfolios found.')
    return
  }

  console.log(`Found ${portfolios.length} activity portfolio(s). Starting backfill...`)

  let ok = 0
  let fail = 0

  for (const p of portfolios) {
    const metadata = (p.metadata as Record<string, unknown>) || {}
    const basic = (metadata.basic as Record<string, unknown>) || {}
    const properties = (metadata.properties as Record<string, unknown>) || {}
    const description = (basic.description as string) || ''
    const isExternal = properties.external === true
    const externalLink = isExternal ? (properties.external_link as string) || undefined : undefined

    try {
      await processActivityDescription(p.id, p.user_id, description || undefined, externalLink ?? undefined)
      ok++
      console.log(`  OK: ${p.id}`)
    } catch (err) {
      fail++
      console.error(`  FAIL: ${p.id}`, err)
    }
  }

  console.log(`Done. OK: ${ok}, Failed: ${fail}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
