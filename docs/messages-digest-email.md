## Messages digest email

The messages digest email is a batched notification that summarizes **unread messages in active conversations** and sends users back to the main Messages page.

### Triggering and frequency

- **Source**: Vercel Cron hitting `/api/cron/messages-digest`.
- **Schedule**: Every 10 minutes (`"*/10 * * * *"` in `vercel.json`).
- **Authorization**: The cron route requires `CRON_SECRET` and validates either:
  - `Authorization: Bearer <CRON_SECRET>` header, or
  - `?secret=<CRON_SECRET>` query parameter.

### Which users receive the digest

On each run the cron handler:

1. Pages through non-pseudo human portfolios from `portfolios` (`type = 'human'`, `is_pseudo = false`).
2. For each portfolio:
   - Reads `metadata.properties.message_digest` for per-user state.
   - Skips users where `message_digest.unsubscribed === true` (reserved for future preference toggles).
   - Enforces a **10-minute cooldown** using `message_digest.last_sent_at`; users whose last digest was less than 10 minutes ago are skipped.
3. Uses `getConversationsForUser(userId, 'active')` from `lib/messages/conversations` to compute the same conversation summaries used by the Messages page.
4. Filters to conversations with `unread_count > 0`.
5. If there is at least one unread active conversation and the user has an auth email, a digest email is sent.

This ensures we **only send digests for unread, active conversations**, and never for archived/invitation-only threads.

### Email content and design

- **Template**: `lib/email/templates/messagesDigestEmail.ts`
  - Renders a clean list of conversation rows similar to the `/messages` UI:
    - Partner name.
    - Avatar (or neutral placeholder if not available).
    - Last message preview (truncated).
    - Unread count badge.
  - Header text: “New messages from …” (using the first partner plus “and others” when there are multiple).
  - Short body copy explaining that there are unread messages on Ausna.
  - Primary button: **“View on Ausna”**.
- **Sender**: `lib/email/messagesDigest.ts`
  - Builds `messagesUrl = getSiteUrl() + '/messages?utm_source=messages_digest_email&utm_medium=email'`.
  - Uses `renderMessagesDigestEmail` to generate HTML.
  - Sends via Resend with `from: getResendFromEmail()` and subject `New messages from Ausna`.

### Per-user state

We track digest send state in portfolio metadata:

- `metadata.properties.message_digest.last_sent_at` – ISO timestamp of the last successful digest for this user.
- `metadata.properties.message_digest.unsubscribed` – optional; reserved to support opt-out later.

The cron route updates `last_sent_at` after each successful send.

### Activity application and conversation activation

Activity and community application flows generate system messages that are now guaranteed to **activate the conversation** for the recipient:

- `applyToActivityCallToJoin`:
  - Sends “applied to join … (activity). Review: …” to the activity owner via `messages`.
- `respondToActivityJoinRequest`, `rejectActivityJoinRequest`:
  - Send follow-up messages about request responses.
- `applyToCommunityJoin`:
  - Sends “applied to join … (community). Review: …” to the community owner.

After each of these messages is inserted, the code deletes any `conversation_completions` row for:

- `user_id = recipient`, `partner_id = sender`.

This mirrors the behavior of `POST /api/messages` and ensures these conversations appear under **Active** (not just in Invites), contribute to unread counts, and are eligible for inclusion in the digest.

