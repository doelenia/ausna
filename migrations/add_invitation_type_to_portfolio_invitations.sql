-- Add invitation_type column to portfolio_invitations table
-- This allows distinguishing between member invites and manager invites
ALTER TABLE portfolio_invitations
ADD COLUMN invitation_type TEXT DEFAULT 'member' CHECK (invitation_type IN ('member', 'manager'));

-- Update comment
COMMENT ON COLUMN portfolio_invitations.invitation_type IS 'Type of invitation: member (default) or manager';

