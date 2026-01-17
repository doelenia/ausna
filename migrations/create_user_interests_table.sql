-- Create user_interests table for tracking user interests
CREATE TABLE user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  aggregate_score NUMERIC DEFAULT 0 NOT NULL,
  memory_score NUMERIC DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, topic_id)
);

-- Create indexes for performance
CREATE INDEX idx_user_interests_user_id ON user_interests(user_id);
CREATE INDEX idx_user_interests_topic_id ON user_interests(topic_id);
CREATE INDEX idx_user_interests_memory_score ON user_interests(memory_score);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_interests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_interests
CREATE TRIGGER update_user_interests_updated_at
  BEFORE UPDATE ON user_interests
  FOR EACH ROW
  EXECUTE FUNCTION update_user_interests_updated_at();

-- Enable Row Level Security
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view their own interests
CREATE POLICY "Users can view their own interests"
  ON user_interests FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies: Only system can insert/update (via service role)
-- These will be managed by server-side code with service role
CREATE POLICY "Authenticated users can manage their own interests"
  ON user_interests FOR ALL
  USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE user_interests IS 'User interest tracking with aggregate and memory scores';



