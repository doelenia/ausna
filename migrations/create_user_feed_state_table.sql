-- Create user_feed_state table
-- Stores bloom filter data for tracking seen posts in user feeds
CREATE TABLE user_feed_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bloom_filter_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_updated TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for performance
CREATE INDEX idx_user_feed_state_user_id ON user_feed_state(user_id);
CREATE INDEX idx_user_feed_state_last_updated ON user_feed_state(last_updated DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE user_feed_state ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own feed state
CREATE POLICY "Users can view their own feed state"
  ON user_feed_state FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own feed state
CREATE POLICY "Users can create their own feed state"
  ON user_feed_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own feed state
CREATE POLICY "Users can update their own feed state"
  ON user_feed_state FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own feed state
CREATE POLICY "Users can delete their own feed state"
  ON user_feed_state FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE user_feed_state IS 'Stores bloom filter data for tracking seen posts in user feeds';
COMMENT ON COLUMN user_feed_state.user_id IS 'The user this feed state belongs to';
COMMENT ON COLUMN user_feed_state.bloom_filter_data IS 'Serialized bloom filter data as JSONB';
COMMENT ON COLUMN user_feed_state.last_updated IS 'Timestamp of last update to the bloom filter';




