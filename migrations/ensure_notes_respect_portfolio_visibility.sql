-- Migration: Ensure notes respect portfolio visibility
-- 
-- Goal:
-- For a note to be visible anywhere, all of its assigned portfolios that are
-- private must also be visible to the current user.
-- 
-- Current behavior (from add_visibility_to_notes_and_portfolios.sql):
-- - Notes are viewable by everyone except blocked users, respecting note.visibility.
-- - Portfolios have their own visibility and RLS.
-- 
-- New behavior:
-- - A note remains hidden from a user if it is assigned to at least one
--   private portfolio that the user does not own (for now, "member" means
--   owner; membership roles can be added later).
-- - Admins can still see all notes.
-- - Note owners can see their own notes regardless of portfolio visibility.
-- - Notes assigned only to public portfolios (or no portfolios) behave as before.

-- Replace existing SELECT policy for notes to also enforce portfolio visibility.
DROP POLICY IF EXISTS "Notes are viewable by everyone except blocked users, respecting visibility" ON notes;

CREATE POLICY "Notes are viewable by everyone except blocked users, respecting visibility"
  ON notes FOR SELECT
  USING (
    -- User must not be blocked
    (NOT is_current_user_blocked() OR is_current_user_blocked() IS NULL)
    AND (
      -- Admins can see all notes regardless of visibility/portfolios
      is_current_user_admin()
      OR (
        -- Existing note-level visibility rules:
        -- - public notes are visible to everyone (subject to RLS)
        -- - private notes are visible only to their owner
        visibility = 'public'
        OR owner_account_id = auth.uid()
      )
    )
    AND (
      -- Enforce portfolio visibility:
      -- If the note is assigned to any private portfolio owned by someone else,
      -- then non-admin users should not see the note.
      NOT EXISTS (
        SELECT 1
        FROM portfolios p
        WHERE p.id::text = ANY(notes.assigned_portfolios)
          AND p.visibility = 'private'
          AND p.user_id <> auth.uid()
          AND NOT is_current_user_admin()
      )
    )
  );

