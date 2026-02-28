-- Unified join requests for activities, community, and (later) projects.
-- Replaces activity_join_requests; same pattern as portfolio_invitations.

CREATE TABLE portfolio_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  applicant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_accepted')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  prompt_answer TEXT,
  responded_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  -- Activity-only (nullable for community/projects)
  activity_role TEXT,
  role_option_id TEXT
);

-- One pending request per (portfolio, applicant)
CREATE UNIQUE INDEX idx_unique_pending_portfolio_join_request
  ON portfolio_join_requests(portfolio_id, applicant_user_id)
  WHERE status = 'pending';

CREATE INDEX idx_portfolio_join_requests_portfolio_id ON portfolio_join_requests(portfolio_id);
CREATE INDEX idx_portfolio_join_requests_applicant_user_id ON portfolio_join_requests(applicant_user_id);
CREATE INDEX idx_portfolio_join_requests_status ON portfolio_join_requests(status);

COMMENT ON TABLE portfolio_join_requests IS 'Join requests for activities, community, and projects. Replaces activity_join_requests.';
COMMENT ON COLUMN portfolio_join_requests.portfolio_id IS 'Portfolio being requested (type in portfolios.type)';
COMMENT ON COLUMN portfolio_join_requests.applicant_user_id IS 'User who requested to join';
COMMENT ON COLUMN portfolio_join_requests.activity_role IS 'Used for activities only (e.g. member, manager)';
COMMENT ON COLUMN portfolio_join_requests.role_option_id IS 'Used for activities only (call-to-join role option)';

-- Migrate from activity_join_requests if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_join_requests'
  ) THEN
    INSERT INTO portfolio_join_requests (
      id,
      portfolio_id,
      applicant_user_id,
      status,
      created_at,
      prompt_answer,
      responded_at,
      rejected_by,
      rejected_at,
      rejection_reason,
      approved_by,
      approved_at,
      activity_role,
      role_option_id
    )
    SELECT
      id,
      activity_portfolio_id,
      applicant_user_id,
      status,
      created_at,
      prompt_answer,
      responded_at,
      rejected_by,
      rejected_at,
      rejection_reason,
      approved_by,
      approved_at,
      activity_role,
      role_option_id
    FROM activity_join_requests;

    DROP TABLE activity_join_requests;
  END IF;
END $$;

-- RLS
ALTER TABLE portfolio_join_requests ENABLE ROW LEVEL SECURITY;

-- Applicants can see and insert their own requests
CREATE POLICY "Users can view own join requests"
  ON portfolio_join_requests FOR SELECT
  USING (auth.uid() = applicant_user_id);

CREATE POLICY "Users can insert own join requests"
  ON portfolio_join_requests FOR INSERT
  WITH CHECK (auth.uid() = applicant_user_id);

-- Portfolio owner and managers can view and update requests for their portfolio
CREATE POLICY "Portfolio owner and managers can view join requests"
  ON portfolio_join_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = portfolio_join_requests.portfolio_id
        AND (
          p.user_id = auth.uid()
          OR (p.metadata->'managers') @> to_jsonb(auth.uid()::text)
        )
    )
  );

CREATE POLICY "Portfolio owner and managers can update join requests"
  ON portfolio_join_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = portfolio_join_requests.portfolio_id
        AND (
          p.user_id = auth.uid()
          OR (p.metadata->'managers') @> to_jsonb(auth.uid()::text)
        )
    )
  );
