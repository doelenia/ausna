-- Migration: Centralize "discoverability" for portfolios (Option 1)
--
-- Goal:
-- - Keep UI/DB `visibility` as: public | unlisted | private
-- - Access control (RLS SELECT):
--   - public + unlisted: accessible by direct link (SELECT allowed)
--   - private: only owner/admin/members/managers
-- - Discoverability (directory/search/feed list surfaces):
--   - only "listed" portfolios show up by default (public),
--   - unlisted/private appear in lists only for owner/admin/members/managers
--
-- Implementation:
-- - Create `portfolios_directory` view that encodes discoverability rules.
-- - Re-create portfolios SELECT RLS policy so unlisted behaves like public for SELECT.
-- - Update notes SELECT policy so unlisted portfolios do NOT hide assigned notes
--   (unlisted is not a privacy boundary; it’s a discoverability toggle).

-- 1) Central directory view (use this for list surfaces)
DROP VIEW IF EXISTS portfolios_directory;

CREATE VIEW portfolios_directory
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  p.*
FROM portfolios p
WHERE
  -- Listed/discoverable for everyone:
  COALESCE(p.visibility, 'public') = 'public'
  -- Otherwise only show in list surfaces to authenticated members/managers/owner/admin:
  OR (
    auth.uid() IS NOT NULL
    AND (
      is_current_user_admin()
      OR p.user_id = auth.uid()
      OR (p.metadata->>'managers')::jsonb ? auth.uid()::text
      OR (p.metadata->>'members')::jsonb ? auth.uid()::text
    )
  );

-- 2) Portfolios SELECT policy: allow direct-link access for unlisted
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
          COALESCE(visibility, 'public') IN ('public', 'unlisted')
          OR user_id = auth.uid()
          OR (
            COALESCE(visibility, 'public') = 'private'
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

-- 3) Notes SELECT policy: only private portfolios can hide assigned notes
-- (unlisted is discoverability-only, so it should not hide notes on direct access)
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
      -- If note is assigned to any *private* portfolio that the user cannot see, hide the note.
      NOT EXISTS (
        SELECT 1
        FROM portfolios p
        WHERE p.id::text = ANY(notes.assigned_portfolios)
          AND COALESCE(p.visibility, 'public') = 'private'
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

