-- Create subscriptions table
-- Users can subscribe to any portfolio they meet
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure a user can only subscribe once to a portfolio
  CONSTRAINT unique_user_portfolio_subscription UNIQUE (user_id, portfolio_id)
);

-- Create indexes for performance
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_portfolio_id ON subscriptions(portfolio_id);
CREATE INDEX idx_subscriptions_created_at ON subscriptions(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can view subscriptions for portfolios they own
-- (to see subscriber count, etc.)
CREATE POLICY "Portfolio owners can view subscriptions"
  ON subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolios
      WHERE portfolios.id = subscriptions.portfolio_id
      AND portfolios.user_id = auth.uid()
    )
  );

-- Policy: Users can create their own subscriptions
CREATE POLICY "Users can create their own subscriptions"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own subscriptions
CREATE POLICY "Users can delete their own subscriptions"
  ON subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE subscriptions IS 'User subscriptions to portfolios';
COMMENT ON COLUMN subscriptions.user_id IS 'The user who is subscribing';
COMMENT ON COLUMN subscriptions.portfolio_id IS 'The portfolio being subscribed to';

