-- Create RPC function to decrement topic mention counts
-- Used when portfolio descriptions change and old topics are removed
CREATE OR REPLACE FUNCTION decrement_topic_mention_counts(
  topic_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  topic_id uuid;
BEGIN
  FOREACH topic_id IN ARRAY topic_ids
  LOOP
    UPDATE topics
    SET mention_count = GREATEST(0, mention_count - 1)
    WHERE id = topic_id;
  END LOOP;
END;
$$;

-- Create RPC function to decay user memory scores
-- Subtracts decay_amount from all topics with positive memory_score for a user
CREATE OR REPLACE FUNCTION decay_user_memory_scores(
  p_user_id uuid,
  p_decay_amount numeric
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_interests
  SET memory_score = memory_score - p_decay_amount
  WHERE user_id = p_user_id
    AND memory_score > 0;
END;
$$;


