-- Migration: Allow notes to be assigned to multiple spaces
--
-- Existing constraint (from update_note_visibility_friends_members.sql) enforced:
-- - Unassigned: public | friends | private
-- - Assigned (exactly one): public | members
--
-- We now allow:
-- - Unassigned: public | friends | private
-- - Assigned (one or more): public | members

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
      cardinality(COALESCE(assigned_portfolios, ARRAY[]::text[])) >= 1
      AND visibility IN ('public', 'members')
    )
  );

