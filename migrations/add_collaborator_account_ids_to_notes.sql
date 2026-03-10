-- Add collaborator_account_ids column to notes table (list of user IDs who are collaborators)
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS collaborator_account_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- Index for filtering notes by collaborator (e.g. feed / human portfolio)
CREATE INDEX IF NOT EXISTS idx_notes_collaborator_account_ids ON notes USING GIN (collaborator_account_ids);

COMMENT ON COLUMN notes.collaborator_account_ids IS 'User IDs of collaborators; they can pin to portfolio and leave, shown as creator in feed and human portfolio.';

-- Allow collaborators to update (app restricts to pin/leave only). Replace existing update policy.
DROP POLICY IF EXISTS "Users can update their own notes (approved and not blocked)" ON notes;
CREATE POLICY "Users can update own or collaborated notes (approved and not blocked)"
  ON notes FOR UPDATE
  USING (
    (auth.uid() = owner_account_id OR auth.uid() = ANY(collaborator_account_ids))
    AND NOT is_current_user_blocked()
    AND is_current_user_approved()
  )
  WITH CHECK (
    (auth.uid() = owner_account_id OR auth.uid() = ANY(collaborator_account_ids))
    AND NOT is_current_user_blocked()
    AND is_current_user_approved()
  );
