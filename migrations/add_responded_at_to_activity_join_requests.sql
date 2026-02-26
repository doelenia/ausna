-- Add responded_at to activity_join_requests so we can mark when owner/manager
-- has sent a message to the applicant (without approving/rejecting).
-- Unprocessed = status = 'pending' AND responded_at IS NULL.

ALTER TABLE activity_join_requests
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;
