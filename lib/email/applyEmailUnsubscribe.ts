import { createServiceClient } from '@/lib/supabase/service'
import type { EmailUnsubscribeChannel } from '@/lib/email/unsubscribeToken'

/**
 * Set the appropriate portfolio.metadata.properties.*.unsubscribed flag for one-click unsubscribe.
 */
export async function applyEmailUnsubscribe(
  userId: string,
  channel: EmailUnsubscribeChannel
): Promise<boolean> {
  const supabase = createServiceClient()
  const { data: row, error: fetchError } = await supabase
    .from('portfolios')
    .select('id, metadata')
    .eq('type', 'human')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (fetchError || !row) return false

  const metadata = ((row as any).metadata || {}) as Record<string, any>
  const properties = { ...(metadata.properties || {}) }

  if (channel === 'messages_digest') {
    const cur = properties.message_digest || {}
    properties.message_digest = { ...cur, unsubscribed: true }
  } else if (channel === 'feed_digest') {
    const cur = properties.feed_digest || {}
    properties.feed_digest = { ...cur, unsubscribed: true }
  } else if (channel === 'open_call_digest') {
    const cur = properties.open_call_digest || {}
    properties.open_call_digest = { ...cur, unsubscribed: true }
  } else if (channel === 'daily_match') {
    const cur = properties.daily_explore_match || {}
    properties.daily_explore_match = { ...cur, unsubscribed: true }
  }

  const updatedMeta = { ...metadata, properties }

  const { error: updateError } = await supabase
    .from('portfolios')
    .update({ metadata: updatedMeta })
    .eq('id', (row as any).id)

  return !updateError
}

export function channelUnsubscribeDescription(channel: EmailUnsubscribeChannel): string {
  switch (channel) {
    case 'messages_digest':
      return 'message summary emails'
    case 'feed_digest':
      return 'feed digest emails'
    case 'open_call_digest':
      return 'open call digest emails'
    case 'daily_match':
      return 'daily activity match emails'
    default:
      return 'these emails'
  }
}
