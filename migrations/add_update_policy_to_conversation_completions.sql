-- Add UPDATE policy for conversation_completions table
-- This is needed for upsert operations to work correctly

-- Policy: Users can update their own conversation completions
CREATE POLICY "Users can update their own conversation completions"
  ON conversation_completions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

