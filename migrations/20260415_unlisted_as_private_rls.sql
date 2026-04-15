-- Migration: Treat unlisted like private for RLS/listing,
-- while allowing direct-link access via service-role lookups in the app.

-- 1) Portfolios SELECT policy:
-- - Public: visible to everyone (subject to pseudo/blocked)
-- - Unlisted + Private: visible only to owner/admin/members/managers
DROP POLICY IF EXISTS "Portfolios are viewable by everyone except blocked users, pseudo portfolios, and visibility" ON portfolios;

CREATE POLICY "Portfolios are viewable by everyone except blocked users, pseudo portfolios, and visibility"
  ON portfolios FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (
      is_current_user_admin()
      OR (
        COALESCE(is_pseudo, false) = false
        AND (
          -- Public portfolios visible to everyone
          visibility = 'public'
          -- Owner can always see
          OR user_id = auth.uid()
          -- Members/managers can see private/unlisted portfolios they belong to
          OR (
            visibility IN ('private', 'unlisted')
            AND auth.uid() IS NOT NULL
            AND (
              (metadata->>'managers')::jsonb ? auth.uid()::text
              OR (metadata->>'members')::jsonb ? auth.uid()::text
            )
          )
        )
      )
    )
  );

-- 2) Notes SELECT policy: hide notes assigned to unlisted portfolios user can't see.
-- This follows the existing "private portfolios hide notes" logic, extended to unlisted.
DROP POLICY IF EXISTS "Notes are viewable by everyone except blocked users, respecting visibility" ON notes;

CREATE POLICY "Notes are viewable by everyone except blocked users, respecting visibility"
  ON notes FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (
      is_current_user_admin()
      OR owner_account_id = auth.uid()
      OR (
        visibility = 'public'
      )
      OR (
        visibility = 'friends'
        AND auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM friends f
          WHERE f.status = 'accepted'
            AND (
              (f.user_id = notes.owner_account_id AND f.friend_id = auth.uid())
              OR (f.friend_id = notes.owner_account_id AND f.user_id = auth.uid())
            )
        )
      )
      OR (
        visibility = 'members'
        AND auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM portfolios p
          WHERE p.id::text = ANY(notes.assigned_portfolios)
            AND (
              p.user_id = auth.uid()
              OR (p.metadata->>'managers')::jsonb ? auth.uid()::text
              OR (p.metadata->>'members')::jsonb ? auth.uid()::text
              OR is_current_user_admin()
            )
        )
      )
    )
    AND (
      -- If note is assigned to any private/unlisted portfolio that the user cannot see, hide the note.
      NOT EXISTS (
        SELECT 1
        FROM portfolios p
        WHERE p.id::text = ANY(notes.assigned_portfolios)
          AND p.visibility IN ('private', 'unlisted')
          AND NOT (
            is_current_user_admin()
            OR p.user_id = auth.uid()
            OR (
              auth.uid() IS NOT NULL
              AND (
                (p.metadata->>'managers')::jsonb ? auth.uid()::text
                OR (p.metadata->>'members')::jsonb ? auth.uid()::text
              )
            )
          )
      )
    )
  );

