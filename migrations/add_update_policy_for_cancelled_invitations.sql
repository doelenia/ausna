-- Add UPDATE policy for cancelling invitations
-- Allows inviters to update invitation status to 'cancelled' instead of deleting
CREATE POLICY "Users can cancel invitations by updating status"
  ON portfolio_invitations FOR UPDATE
  USING (auth.uid() = inviter_id AND status = 'pending')
  WITH CHECK (auth.uid() = inviter_id AND status = 'cancelled');




