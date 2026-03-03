/**
 * Backfill project description_topics from existing atomic_knowledge rows.
 *
 * Fetches atomic_knowledge rows with non-null source_info and parses source_info in JS
 * (handles double-encoded JSON: column value can be "{\"source_type\":\"...\",\"source_id\":\"...\"}").
 * Collects distinct topic IDs per project where source_type is project_description OR
 * project_property, then sets metadata.description_topics.
 *
 * Usage (from project root):
 *   npx tsx scripts/backfill-project-description-topics.ts
 */

import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

import { createServiceClient } from '../lib/supabase/service'

/** Parse source_info from DB: may be object or double-encoded JSON string. */
function parseSourceInfo(raw: unknown): { source_type?: string; source_id?: string } | null {
  if (raw == null) return null
  let obj: unknown
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as unknown
      if (typeof obj === 'string') obj = JSON.parse(obj) as unknown
    } catch {
      return null
    }
  } else if (typeof raw === 'object') {
    obj = raw
  } else {
    return null
  }
  if (obj && typeof obj === 'object' && 'source_type' in obj && 'source_id' in obj) {
    return obj as { source_type: string; source_id: string }
  }
  return null
}

async function main() {
  const supabase = createServiceClient()

  const { data: projects, error: projectsError } = await supabase
    .from('portfolios')
    .select('id, metadata')
    .eq('type', 'projects')

  if (projectsError || !projects?.length) {
    if (projectsError) console.error('Failed to fetch projects:', projectsError)
    else console.log('No project portfolios found.')
    return
  }

  const projectIds = new Set(projects.map((p) => p.id))
  console.log(`Found ${projects.length} project(s). Fetching atomic_knowledge with source_info...`)

  // Fetch all atomic_knowledge rows that have source_info (no JSONB filter; we parse in JS)
  const { data: rows, error } = await supabase
    .from('atomic_knowledge')
    .select('topics, source_info')
    .not('source_info', 'is', null)

  if (error) {
    console.error('Failed to fetch atomic_knowledge:', error)
    process.exit(1)
  }

  const topicIdsByProjectId = new Map<string, Set<string>>()
  for (const project of projects) {
    topicIdsByProjectId.set(project.id, new Set())
  }

  const allowedTypes = new Set(['project_description', 'project_property'])
  for (const row of rows || []) {
    const parsed = parseSourceInfo((row as { source_info?: unknown }).source_info)
    const sourceType = parsed?.source_type
    const sourceId = parsed?.source_id
    if (!parsed || !sourceType || !allowedTypes.has(sourceType) || !sourceId || !projectIds.has(sourceId)) continue

    const set = topicIdsByProjectId.get(sourceId)
    if (!set) continue

    const t = (row as { topics?: string[] }).topics
    if (Array.isArray(t)) {
      t.forEach((id) => typeof id === 'string' && set.add(id))
    }
  }

  let updated = 0
  let skipped = 0
  let fail = 0

  for (const project of projects) {
    const topicIds = Array.from(topicIdsByProjectId.get(project.id) || [])
    if (topicIds.length === 0) {
      skipped++
      continue
    }

    const metadata = (project.metadata as Record<string, unknown>) || {}
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({
        metadata: { ...metadata, description_topics: topicIds },
      })
      .eq('id', project.id)

    if (updateError) {
      console.error(`  FAIL update: ${project.id}`, updateError)
      fail++
    } else {
      updated++
      console.log(`  OK: ${project.id} (${topicIds.length} topics)`)
    }
  }

  console.log(`Done. Updated: ${updated}, Skipped (no topics): ${skipped}, Failed: ${fail}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
