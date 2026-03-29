-- Allow portfolio creators and managers to view all invitations for portfolios they manage
-- (so the members page can list outgoing invites regardless of which manager sent them)

CREATE POLICY "Portfolio creators and managers can view portfolio invitations"
  ON portfolio_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = portfolio_invitations.portfolio_id
        AND p.type <> 'human'
        AND (
          p.user_id = auth.uid()
          OR coalesce(p.metadata->'managers', '[]'::jsonb) @> jsonb_build_array(auth.uid()::text)
        )
    )
  );
