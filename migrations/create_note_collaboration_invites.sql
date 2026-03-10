-- Note collaboration invites: owner sends invite, invitee accepts then is added to note
CREATE TABLE IF NOT EXISTS note_collaboration_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(note_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_note_collab_invites_note_id ON note_collaboration_invites(note_id);
CREATE INDEX IF NOT EXISTS idx_note_collab_invites_invitee_id ON note_collaboration_invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_note_collab_invites_status ON note_collaboration_invites(status);

ALTER TABLE note_collaboration_invites ENABLE ROW LEVEL SECURITY;

-- Inviter (note owner) can read invites for their note; invitee can read their own
CREATE POLICY "Note collaboration invites readable by inviter and invitee"
  ON note_collaboration_invites FOR SELECT
  USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

-- Only note owner can insert (invite)
CREATE POLICY "Note owner can create collaboration invites"
  ON note_collaboration_invites FOR INSERT
  WITH CHECK (
    auth.uid() = inviter_id
    AND EXISTS (
      SELECT 1 FROM notes n
      WHERE n.id = note_id AND n.owner_account_id = auth.uid()
    )
  );

-- Inviter can update (cancel); invitee can update to accept/reject
CREATE POLICY "Inviter or invitee can update invite"
  ON note_collaboration_invites FOR UPDATE
  USING (auth.uid() = inviter_id OR auth.uid() = invitee_id)
  WITH CHECK (auth.uid() = inviter_id OR auth.uid() = invitee_id);
