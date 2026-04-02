/**
 * Space portfolios can declare parent "host" spaces via legacy column + metadata.
 * Matches logic used by hosted-spaces API and portfolio editors.
 */
export function getDeclaredHostSpaceIds(row: {
  id?: string
  host_project_id?: string | null
  metadata?: unknown
}): string[] {
  const props = ((row.metadata as { properties?: Record<string, unknown> } | null)?.properties ||
    {}) as Record<string, unknown>
  const hostProjectIds = Array.isArray(props.host_project_ids) ? props.host_project_ids : []
  const hostCommunityIds = Array.isArray(props.host_community_ids) ? props.host_community_ids : []
  const legacy = row.host_project_id ? [row.host_project_id] : []
  const merged = [...hostProjectIds, ...hostCommunityIds, ...legacy]
    .map((id) => (typeof id === 'string' ? id : String(id)))
    .filter(Boolean)
  const out = Array.from(new Set(merged))
  if (row.id) {
    return out.filter((hid) => hid !== row.id)
  }
  return out
}
