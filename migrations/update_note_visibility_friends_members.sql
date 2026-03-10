-- Migration: Expand note visibility to support friends + portfolio members
--
-- Requirements:
-- - Notes/open calls WITHOUT assigned portfolio: visibility choices are public, friends, private
-- - Notes/open calls WITH assigned portfolio: visibility choices are public, members
-- - Enforce via RLS (and a DB constraint) so visibility cannot be bypassed

-- 1) Create a dedicated enum for note visibility (do NOT reuse portfolio visibility enum)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'note_visibility_type'
  ) THEN
    CREATE TYPE note_visibility_type AS ENUM ('public', 'friends', 'private', 'members');
  END IF;
END;
$$;

-- 2) Migrate notes.visibility from visibility_type -> note_visibility_type
-- Existing values are 'public'|'private' and can be cast safely.
ALTER TABLE notes
  ALTER COLUMN visibility DROP DEFAULT;

ALTER TABLE notes
  ALTER COLUMN visibility TYPE note_visibility_type
  USING (visibility::text::note_visibility_type);

ALTER TABLE notes
  ALTER COLUMN visibility SET DEFAULT 'public';

COMMENT ON COLUMN notes.visibility IS
  'Visibility of the note: public (everyone), friends (only friends of owner), private (only owner), members (members of the assigned portfolio).';

-- 3) Backfill: notes assigned to a portfolio should not remain "private" under the new two-option model.
-- Map them to "members" so they are visible to portfolio members.
UPDATE notes
SET visibility = 'members'
WHERE visibility = 'private'
  AND cardinality(COALESCE(assigned_portfolios, ARRAY[]::text[])) > 0;

-- 4) Enforce the allowed visibility set depending on whether the note is assigned
-- - Unassigned: public | friends | private
-- - Assigned (exactly one portfolio): public | members
ALTER TABLE notes
  DROP CONSTRAINT IF EXISTS notes_visibility_assignment_check;

ALTER TABLE notes
  ADD CONSTRAINT notes_visibility_assignment_check
  CHECK (
    (
      cardinality(COALESCE(assigned_portfolios, ARRAY[]::text[])) = 0
      AND visibility IN ('public', 'friends', 'private')
    )
    OR (
      cardinality(COALESCE(assigned_portfolios, ARRAY[]::text[])) = 1
      AND visibility IN ('public', 'members')
    )
  );

-- 5) Update portfolios SELECT RLS policy to allow members/managers to view private portfolios
-- so "members" notes can be read by portfolio members.
DROP POLICY IF EXISTS "Portfolios are viewable by everyone except blocked users, pseudo portfolios, and visibility" ON portfolios;

CREATE POLICY "Portfolios are viewable by everyone except blocked users, pseudo portfolios, and visibility"
  ON portfolios FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (
      -- Admins can see all portfolios regardless of pseudo/visibility
      is_current_user_admin()
      OR (
        COALESCE(is_pseudo, false) = false
        AND (
          -- Public portfolios visible to everyone
          visibility = 'public'
          -- Owner can always see
          OR user_id = auth.uid()
          -- Members/managers can see private portfolios they belong to
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

-- 6) Replace notes SELECT policy to respect new note visibility + portfolio membership + portfolio visibility
DROP POLICY IF EXISTS "Notes are viewable by everyone except blocked users, respecting visibility" ON notes;

CREATE POLICY "Notes are viewable by everyone except blocked users, respecting visibility"
  ON notes FOR SELECT
  USING (
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (
      -- Admins can see all notes regardless of visibility
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
      -- If note is assigned to any private portfolio that the user cannot see, hide the note.
      NOT EXISTS (
        SELECT 1
        FROM portfolios p
        WHERE p.id::text = ANY(notes.assigned_portfolios)
          AND p.visibility = 'private'
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

