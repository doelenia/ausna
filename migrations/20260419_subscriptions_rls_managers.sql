-- Allow portfolio managers to list subscriptions for spaces they manage (SELECT),
-- and allow portfolio creators + managers to remove any follower row (DELETE).

CREATE POLICY "Portfolio managers can view subscriptions for managed portfolios"
  ON subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = subscriptions.portfolio_id
        AND (p.metadata->'managers') ? (auth.uid()::text)
    )
  );

CREATE POLICY "Portfolio creators and managers can delete portfolio subscriptions"
  ON subscriptions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = subscriptions.portfolio_id
        AND (
          p.user_id = auth.uid()
          OR (p.metadata->'managers') ? (auth.uid()::text)
        )
    )
  );
