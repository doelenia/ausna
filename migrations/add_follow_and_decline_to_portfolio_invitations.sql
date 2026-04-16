-- Extend portfolio_invitations for follow / pass flows
-- - invitation_type: add 'follow'
-- - status: add 'declined'
-- - store optional decline message

ALTER TABLE portfolio_invitations
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decline_message TEXT;

ALTER TABLE portfolio_invitations
  DROP CONSTRAINT IF EXISTS portfolio_invitations_invitation_type_check;

ALTER TABLE portfolio_invitations
  ADD CONSTRAINT portfolio_invitations_invitation_type_check
  CHECK (invitation_type = ANY (ARRAY['member'::text, 'manager'::text, 'follow'::text]));

ALTER TABLE portfolio_invitations
  DROP CONSTRAINT IF EXISTS portfolio_invitations_status_check;

ALTER TABLE portfolio_invitations
  ADD CONSTRAINT portfolio_invitations_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'cancelled'::text, 'declined'::text]));

-- Tighten and extend invitee UPDATE policies:
-- - separate accept vs decline checks (invitee can only set final status)
DROP POLICY IF EXISTS "Users can accept invitations" ON portfolio_invitations;

CREATE POLICY "Invitees can accept invitations"
  ON portfolio_invitations FOR UPDATE
  USING (auth.uid() = invitee_id AND status = 'pending')
  WITH CHECK (auth.uid() = invitee_id AND status = 'accepted');

CREATE POLICY "Invitees can decline invitations"
  ON portfolio_invitations FOR UPDATE
  USING (auth.uid() = invitee_id AND status = 'pending')
  WITH CHECK (auth.uid() = invitee_id AND status = 'declined');

