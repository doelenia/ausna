/**
 * Auth user_metadata flag: set when the auth user is created by add-contact invite.
 * Cleared when the invite is completed. Used so email-first login does not treat
 * self-signup (unverified) accounts like invite placeholders.
 */
export const PENDING_CONTACT_INVITE_META_KEY = 'ausna_pending_contact_invite' as const

export function isPendingContactInviteUser(
  userMetadata: Record<string, unknown> | null | undefined
): boolean {
  return userMetadata?.[PENDING_CONTACT_INVITE_META_KEY] === true
}
