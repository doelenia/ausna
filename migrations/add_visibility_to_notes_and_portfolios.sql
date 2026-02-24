-- Migration: Add visibility (public/private) to portfolios and notes
-- and update RLS policies to respect visibility while keeping existing
-- pseudo status and approval logic intact.

-- 1) Create shared enum type for visibility
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'visibility_type'
  ) THEN
    CREATE TYPE visibility_type AS ENUM ('public', 'private');
  END IF;
END;
$$;

-- 2) Add visibility column to portfolios
ALTER TABLE portfolios
ADD COLUMN IF NOT EXISTS visibility visibility_type NOT NULL DEFAULT 'public';

COMMENT ON COLUMN portfolios.visibility IS
  'Visibility of the portfolio: public (everyone can see, subject to pseudo/RLS) or private (only owner and admins can see).';

-- 3) Add visibility column to notes
ALTER TABLE notes
ADD COLUMN IF NOT EXISTS visibility visibility_type NOT NULL DEFAULT 'public';

COMMENT ON COLUMN notes.visibility IS
  'Visibility of the note: public (everyone can see, subject to RLS) or private (only owner and admins can see).';

-- 4) Update portfolios SELECT RLS policy to respect visibility
-- Existing behavior:
-- - Exclude blocked users via is_current_user_blocked()
-- - Hide pseudo portfolios (is_pseudo = true) from non-admins
-- New behavior:
-- - Non-admins can see only:
--     * non-pseudo portfolios with visibility = 'public', or
--     * their own portfolios (user_id = auth.uid()), regardless of visibility
-- - Admins can see all portfolios, including pseudo and private

DROP POLICY IF EXISTS "Portfolios are viewable by everyone except blocked users and pseudo portfolios" ON portfolios;

CREATE POLICY "Portfolios are viewable by everyone except blocked users, pseudo portfolios, and visibility"
  ON portfolios FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (
      -- Admins can see all portfolios regardless of pseudo/visibility
      is_current_user_admin()
      OR (
        -- Non-admins must satisfy both non-pseudo AND visibility rules
        COALESCE(is_pseudo, false) = false
        AND (
          visibility = 'public'
          OR user_id = auth.uid()
        )
      )
    )
  );

-- 5) Update notes SELECT RLS policy to respect visibility
-- Existing behavior (from relax_is_approved_select_policies.sql):
-- - Notes are viewable by everyone except blocked users
-- New behavior:
-- - For non-blocked users:
--     * visibility = 'public' notes are viewable
--     * visibility = 'private' notes are viewable only to their owner
-- - Admins can see all notes regardless of visibility

DROP POLICY IF EXISTS "Notes are viewable by everyone except blocked users" ON notes;

CREATE POLICY "Notes are viewable by everyone except blocked users, respecting visibility"
  ON notes FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (
      visibility = 'public'
      OR owner_account_id = auth.uid()
      OR is_current_user_admin()
    )
  );

