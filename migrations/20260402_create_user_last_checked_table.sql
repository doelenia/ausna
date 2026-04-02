-- Create user_last_checked table
-- Stores per-user checkpoints for "last checked" across different targets (friends/spaces)
CREATE TABLE user_last_checked (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('friend', 'joined_space', 'subscribed_space')),
  target_id UUID NOT NULL,
  last_checked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT user_last_checked_pk PRIMARY KEY (user_id, target_type, target_id)
);

-- Create indexes for performance
CREATE INDEX idx_user_last_checked_user_type ON user_last_checked(user_id, target_type);
CREATE INDEX idx_user_last_checked_user_last_checked_at ON user_last_checked(user_id, last_checked_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE user_last_checked ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own checkpoints
CREATE POLICY "Users can view their own last-checked checkpoints"
  ON user_last_checked FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own checkpoints
CREATE POLICY "Users can create their own last-checked checkpoints"
  ON user_last_checked FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own checkpoints
CREATE POLICY "Users can update their own last-checked checkpoints"
  ON user_last_checked FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own checkpoints
CREATE POLICY "Users can delete their own last-checked checkpoints"
  ON user_last_checked FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE user_last_checked IS 'Per-user checkpoints for last time they checked friends and spaces (joined/subscribed)';
COMMENT ON COLUMN user_last_checked.user_id IS 'The user who owns these checkpoints';
COMMENT ON COLUMN user_last_checked.target_type IS 'friend | joined_space | subscribed_space';
COMMENT ON COLUMN user_last_checked.target_id IS 'UUID of friend user (auth.users.id) or space portfolio id';
COMMENT ON COLUMN user_last_checked.last_checked_at IS 'Timestamp of last time the user checked this target';
