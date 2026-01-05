-- Fix RLS policy for conversation_completions to allow users to see completions
-- where they are either the user_id (they completed) or partner_id (partner completed)

-- Drop the old policy
DROP POLICY IF EXISTS "Users can view their own conversation completions" ON conversation_completions;

-- Create new policy that allows viewing completions where user is either user_id or partner_id
CREATE POLICY "Users can view their own conversation completions"
  ON conversation_completions FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = partner_id);


