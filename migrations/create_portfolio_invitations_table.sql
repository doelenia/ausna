-- Create portfolio_invitations table
-- Tracks pending invitations to join projects and communities
CREATE TABLE portfolio_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  accepted_at TIMESTAMPTZ,
  
  -- Ensure inviter and invitee are different
  CONSTRAINT different_users CHECK (inviter_id != invitee_id)
);

-- Partial unique index: only one pending invitation per portfolio-invitee pair
CREATE UNIQUE INDEX idx_unique_pending_invitation 
ON portfolio_invitations(portfolio_id, invitee_id) 
WHERE status = 'pending';

-- Create indexes for performance
CREATE INDEX idx_portfolio_invitations_portfolio_id ON portfolio_invitations(portfolio_id);
CREATE INDEX idx_portfolio_invitations_inviter_id ON portfolio_invitations(inviter_id);
CREATE INDEX idx_portfolio_invitations_invitee_id ON portfolio_invitations(invitee_id);
CREATE INDEX idx_portfolio_invitations_status ON portfolio_invitations(status);
CREATE INDEX idx_portfolio_invitations_invitee_status ON portfolio_invitations(invitee_id, status);

-- Enable Row Level Security (RLS)
ALTER TABLE portfolio_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view invitations they sent or received
CREATE POLICY "Users can view their invitations"
  ON portfolio_invitations FOR SELECT
  USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

-- Policy: Users can create invitations (as inviter)
CREATE POLICY "Users can create invitations"
  ON portfolio_invitations FOR INSERT
  WITH CHECK (auth.uid() = inviter_id);

-- Policy: Users can accept invitations (where they are invitee)
CREATE POLICY "Users can accept invitations"
  ON portfolio_invitations FOR UPDATE
  USING (auth.uid() = invitee_id AND status = 'pending')
  WITH CHECK (auth.uid() = invitee_id);

-- Policy: Users can cancel invitations they sent
CREATE POLICY "Users can cancel invitations"
  ON portfolio_invitations FOR DELETE
  USING (auth.uid() = inviter_id);

-- Add comment to table
COMMENT ON TABLE portfolio_invitations IS 'Tracks invitations to join project and community portfolios. Status: pending (invitation sent), accepted (user joined), cancelled (invitation cancelled)';
COMMENT ON COLUMN portfolio_invitations.portfolio_id IS 'The portfolio being invited to';
COMMENT ON COLUMN portfolio_invitations.inviter_id IS 'The user who sent the invitation';
COMMENT ON COLUMN portfolio_invitations.invitee_id IS 'The user who received the invitation';
COMMENT ON COLUMN portfolio_invitations.status IS 'pending: invitation sent but not accepted, accepted: user joined, cancelled: invitation cancelled';

