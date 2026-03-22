import { getSiteUrl } from '@/lib/email/resend'
import {
  createEmailUnsubscribeToken,
  type EmailUnsubscribeChannel,
} from '@/lib/email/unsubscribeToken'

export function buildEmailUnsubscribeUrl(
  userId: string,
  channel: EmailUnsubscribeChannel
): string {
  const token = createEmailUnsubscribeToken(userId, channel)
  const siteUrl = getSiteUrl().replace(/\/$/, '')
  return `${siteUrl}/api/unsubscribe/email?token=${encodeURIComponent(token)}`
}
