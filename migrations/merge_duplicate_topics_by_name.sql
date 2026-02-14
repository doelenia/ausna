-- Migration to merge duplicate topics with the same name (case-insensitive)
-- This migration safely merges topics by:
-- 1. Creating an audit log of all merges
-- 2. Updating all references in atomic_knowledge, notes, user_interests, and portfolios
-- 3. Merging mention_count and mentions arrays
-- 4. Deleting duplicate topics

-- Step 1: Create audit log table to track merges
CREATE TABLE IF NOT EXISTS topic_merge_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kept_topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  merged_topic_id UUID NOT NULL, -- No foreign key - topic will be deleted, but we keep audit record
  topic_name TEXT NOT NULL,
  merged_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  kept_mention_count INTEGER,
  merged_mention_count INTEGER,
  final_mention_count INTEGER
);

-- Fix foreign key constraint if table already exists (remove CASCADE on merged_topic_id)
DO $$
BEGIN
  -- Drop existing foreign key constraint on merged_topic_id if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'topic_merge_audit_merged_topic_id_fkey'
  ) THEN
    ALTER TABLE topic_merge_audit 
    DROP CONSTRAINT topic_merge_audit_merged_topic_id_fkey;
  END IF;
  
  -- Update kept_topic_id constraint to RESTRICT if it's CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_name = 'topic_merge_audit'
      AND tc.constraint_name = 'topic_merge_audit_kept_topic_id_fkey'
      AND rc.delete_rule = 'CASCADE'
  ) THEN
    ALTER TABLE topic_merge_audit 
    DROP CONSTRAINT topic_merge_audit_kept_topic_id_fkey,
    ADD CONSTRAINT topic_merge_audit_kept_topic_id_fkey 
      FOREIGN KEY (kept_topic_id) REFERENCES topics(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_topic_merge_audit_kept ON topic_merge_audit(kept_topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_merge_audit_merged ON topic_merge_audit(merged_topic_id);

-- Step 2: Create function to merge a single duplicate topic into the kept topic
-- This function updates ALL references to the merged topic in:
--   - atomic_knowledge.topics (UUID array)
--   - notes.topics (UUID array)
--   - user_interests.topic_id (single UUID)
--   - portfolios.metadata.description_topics (JSONB array)
-- Then merges mention_count and mentions, logs the merge, and deletes the duplicate topic
CREATE OR REPLACE FUNCTION merge_topic_into(
  p_kept_topic_id UUID,
  p_merged_topic_id UUID
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_topic_name TEXT;
  v_kept_mention_count INTEGER;
  v_merged_mention_count INTEGER;
  v_kept_mentions UUID[];
  v_merged_mentions UUID[];
BEGIN
  -- Get topic names and counts for audit
  SELECT name, mention_count, mentions INTO v_topic_name, v_kept_mention_count, v_kept_mentions
  FROM topics WHERE id = p_kept_topic_id;
  
  SELECT mention_count, mentions INTO v_merged_mention_count, v_merged_mentions
  FROM topics WHERE id = p_merged_topic_id;

  -- ============================================================
  -- Update all references to merged topic in the three main tables:
  -- 1. atomic_knowledge.topics (UUID array)
  -- 2. notes.topics (UUID array)  
  -- 3. user_interests.topic_id (single UUID)
  -- ============================================================
  
  -- 1. Update atomic_knowledge.topics arrays: replace merged_topic_id with kept_topic_id
  UPDATE atomic_knowledge
  SET topics = array_replace(topics, p_merged_topic_id, p_kept_topic_id)
  WHERE p_merged_topic_id = ANY(topics);

  -- 2. Update notes.topics arrays: replace merged_topic_id with kept_topic_id
  UPDATE notes
  SET topics = array_replace(topics, p_merged_topic_id, p_kept_topic_id)
  WHERE p_merged_topic_id = ANY(topics);

  -- 3. Update user_interests.topic_id: replace merged_topic_id with kept_topic_id
  -- Handle case where user might have interests in both topics (merge scores)
  -- First, merge scores for users who have interests in both topics
  UPDATE user_interests ui_kept
  SET 
    aggregate_score = aggregate_score + 
      COALESCE((
        SELECT aggregate_score
        FROM user_interests
        WHERE user_id = ui_kept.user_id 
          AND topic_id = p_merged_topic_id
      ), 0),
    memory_score = memory_score + 
      COALESCE((
        SELECT memory_score
        FROM user_interests
        WHERE user_id = ui_kept.user_id 
          AND topic_id = p_merged_topic_id
      ), 0)
  WHERE topic_id = p_kept_topic_id
    AND EXISTS (
      SELECT 1 FROM user_interests
      WHERE user_id = ui_kept.user_id AND topic_id = p_merged_topic_id
    );

  -- For users who only have interest in the merged topic, update to kept topic
  UPDATE user_interests
  SET topic_id = p_kept_topic_id
  WHERE topic_id = p_merged_topic_id
    AND NOT EXISTS (
      SELECT 1 FROM user_interests ui_check
      WHERE ui_check.user_id = user_interests.user_id 
        AND ui_check.topic_id = p_kept_topic_id
    );

  -- Delete duplicate interests (users who had both, now only need the kept one)
  DELETE FROM user_interests
  WHERE topic_id = p_merged_topic_id;

  -- Update portfolios.metadata.description_topics (JSONB array)
  UPDATE portfolios
  SET metadata = jsonb_set(
    metadata,
    '{description_topics}',
    (
      SELECT jsonb_agg(
        CASE 
          WHEN elem::text = '"' || p_merged_topic_id::text || '"' 
          THEN to_jsonb(p_kept_topic_id)
          ELSE elem
        END
      )
      FROM jsonb_array_elements(metadata->'description_topics') elem
    )
  )
  WHERE metadata->'description_topics' @> to_jsonb(p_merged_topic_id::text);

  -- 4. Merge mention_count and mentions array in the kept topic
  -- Note: topics.mentions contains note IDs (not topic IDs), so we just merge the arrays
  UPDATE topics
  SET 
    mention_count = mention_count + v_merged_mention_count,
    mentions = (
      SELECT array_agg(DISTINCT unnest_mentions)
      FROM (
        SELECT unnest(mentions) as unnest_mentions
        FROM topics
        WHERE id IN (p_kept_topic_id, p_merged_topic_id)
      ) subq
    )
  WHERE id = p_kept_topic_id;

  -- Log the merge
  INSERT INTO topic_merge_audit (
    kept_topic_id,
    merged_topic_id,
    topic_name,
    kept_mention_count,
    merged_mention_count,
    final_mention_count
  ) VALUES (
    p_kept_topic_id,
    p_merged_topic_id,
    v_topic_name,
    v_kept_mention_count,
    v_merged_mention_count,
    v_kept_mention_count + v_merged_mention_count
  );

  -- Delete the merged topic
  DELETE FROM topics WHERE id = p_merged_topic_id;
END;
$$;

-- Step 3: Main migration function that processes all duplicates
CREATE OR REPLACE FUNCTION merge_all_duplicate_topics()
RETURNS TABLE(
  normalized_name TEXT,
  duplicate_count BIGINT,
  kept_topic_id UUID,
  merged_topic_ids UUID[]
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_duplicate_group RECORD;
  v_kept_topic_id UUID;
  v_merged_topic_id UUID;
  v_merged_ids UUID[];
BEGIN
  -- Process each group of duplicates
  FOR v_duplicate_group IN
    SELECT 
      LOWER(TRIM(name)) as normalized_name,
      array_agg(id ORDER BY mention_count DESC, created_at DESC) as topic_ids,
      array_agg(mention_count ORDER BY mention_count DESC, created_at DESC) as mention_counts
    FROM topics
    GROUP BY LOWER(TRIM(name))
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  LOOP
    -- Keep the first topic (highest mention_count, most recent)
    v_kept_topic_id := v_duplicate_group.topic_ids[1];
    v_merged_ids := v_duplicate_group.topic_ids[2:array_length(v_duplicate_group.topic_ids, 1)];
    
    -- Merge each duplicate into the kept topic
    FOREACH v_merged_topic_id IN ARRAY v_merged_ids
    LOOP
      PERFORM merge_topic_into(v_kept_topic_id, v_merged_topic_id);
    END LOOP;
    
    -- Return info about this merge
    normalized_name := v_duplicate_group.normalized_name;
    duplicate_count := array_length(v_duplicate_group.topic_ids, 1);
    kept_topic_id := v_kept_topic_id;
    merged_topic_ids := v_merged_ids;
    
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Step 4: Create preview function to see what will be merged (dry-run)
CREATE OR REPLACE FUNCTION preview_topic_merges()
RETURNS TABLE(
  normalized_name TEXT,
  duplicate_count BIGINT,
  kept_topic_id UUID,
  kept_topic_name TEXT,
  kept_mention_count INTEGER,
  merged_topic_ids UUID[],
  merged_topic_names TEXT[],
  total_mentions_to_merge INTEGER
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    LOWER(TRIM(t.name)) as normalized_name,
    COUNT(*)::BIGINT as duplicate_count,
    (array_agg(t.id ORDER BY t.mention_count DESC, t.created_at DESC))[1] as kept_topic_id,
    (array_agg(t.name ORDER BY t.mention_count DESC, t.created_at DESC))[1] as kept_topic_name,
    (array_agg(t.mention_count ORDER BY t.mention_count DESC, t.created_at DESC))[1] as kept_mention_count,
    (array_agg(t.id ORDER BY t.mention_count DESC, t.created_at DESC))[2:] as merged_topic_ids,
    (array_agg(t.name ORDER BY t.mention_count DESC, t.created_at DESC))[2:] as merged_topic_names,
    SUM(t.mention_count)::INTEGER as total_mentions_to_merge
  FROM topics t
  GROUP BY LOWER(TRIM(t.name))
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC;
END;
$$;

-- Step 5: Execute the migration (UNCOMMENT TO RUN)
-- WARNING: This will permanently merge duplicate topics
-- Review the preview first using: SELECT * FROM preview_topic_merges();
-- 
-- DO $$
-- DECLARE
--   v_result RECORD;
--   v_total_merged INTEGER := 0;
-- BEGIN
--   -- Run the merge function and collect results
--   FOR v_result IN SELECT * FROM merge_all_duplicate_topics()
--   LOOP
--     v_total_merged := v_total_merged + v_result.duplicate_count - 1;
--     RAISE NOTICE 'Merged % duplicates for topic "%" - kept: %, merged: %', 
--       v_result.duplicate_count - 1,
--       v_result.normalized_name,
--       v_result.kept_topic_id,
--       array_length(v_result.merged_topic_ids, 1);
--   END LOOP;
--   
--   RAISE NOTICE 'Migration complete. Total topics merged: %', v_total_merged;
--   RAISE NOTICE 'Review topic_merge_audit table for detailed merge log';
-- END;
-- $$;

