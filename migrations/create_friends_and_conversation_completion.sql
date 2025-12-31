-- Create friends table
-- Friendships are bidirectional, but we store both directions for easier querying
CREATE TABLE friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  accepted_at TIMESTAMPTZ,
  
  -- Ensure user_id and friend_id are different
  CONSTRAINT different_users CHECK (user_id != friend_id),
  -- Ensure unique friendship pairs (bidirectional)
  CONSTRAINT unique_friendship UNIQUE (user_id, friend_id)
);

-- Create indexes for performance
CREATE INDEX idx_friends_user_id ON friends(user_id);
CREATE INDEX idx_friends_friend_id ON friends(friend_id);
CREATE INDEX idx_friends_status ON friends(status);
CREATE INDEX idx_friends_user_status ON friends(user_id, status);

-- Enable Row Level Security (RLS)
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own friendships
CREATE POLICY "Users can view their own friendships"
  ON friends FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Policy: Users can create friend requests (as user_id)
CREATE POLICY "Users can create friend requests"
  ON friends FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can accept friend requests (where they are friend_id)
CREATE POLICY "Users can accept friend requests"
  ON friends FOR UPDATE
  USING (auth.uid() = friend_id AND status = 'pending')
  WITH CHECK (auth.uid() = friend_id);

-- Policy: Users can delete their own friendships
CREATE POLICY "Users can delete their own friendships"
  ON friends FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Add comment to table
COMMENT ON TABLE friends IS 'Friend relationships between users. Status: pending (request sent), accepted (mutual friends)';
COMMENT ON COLUMN friends.user_id IS 'The user who sent the friend request';
COMMENT ON COLUMN friends.friend_id IS 'The user who received the friend request';
COMMENT ON COLUMN friends.status IS 'pending: request sent but not accepted, accepted: mutual friends';

-- Create conversation_completions table
-- Tracks when a user marks a conversation as complete
CREATE TABLE conversation_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure user_id and partner_id are different
  CONSTRAINT different_users CHECK (user_id != partner_id),
  -- One completion record per user-partner pair
  CONSTRAINT unique_completion UNIQUE (user_id, partner_id)
);

-- Create indexes for performance
CREATE INDEX idx_conversation_completions_user_id ON conversation_completions(user_id);
CREATE INDEX idx_conversation_completions_partner_id ON conversation_completions(partner_id);
CREATE INDEX idx_conversation_completions_completed_at ON conversation_completions(completed_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE conversation_completions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own conversation completions
CREATE POLICY "Users can view their own conversation completions"
  ON conversation_completions FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own conversation completions
CREATE POLICY "Users can create their own conversation completions"
  ON conversation_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own conversation completions
CREATE POLICY "Users can delete their own conversation completions"
  ON conversation_completions FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE conversation_completions IS 'Tracks when users mark conversations as complete. When completed, non-friend messages go back to invitations tab.';
COMMENT ON COLUMN conversation_completions.user_id IS 'The user who marked the conversation as complete';
COMMENT ON COLUMN conversation_completions.partner_id IS 'The conversation partner';

