-- Migration: Add unlisted visibility state for portfolios
-- Unlisted portfolios are accessible by direct link, but should be excluded from
-- directory/search results in application code unless the viewer is a member.

-- 1) Extend the visibility enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'visibility_type'
  ) THEN
    -- Add enum value if missing (safe to re-run)
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'visibility_type'
        AND e.enumlabel = 'unlisted'
    ) THEN
      ALTER TYPE visibility_type ADD VALUE 'unlisted';
    END IF;
  END IF;
END;
$$;

-- 2) Update portfolios SELECT RLS policy to allow link access for unlisted
-- - Treat 'unlisted' like 'public' for SELECT eligibility
-- - Keep 'private' restricted to owner/admin/members/managers
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
          visibility IN ('public', 'unlisted')
          OR user_id = auth.uid()
          OR (
            visibility = 'private'
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

