-- Update create_or_update_topic to check topic names in addition to description similarity
-- This prevents duplicate topics with the same name but different descriptions

-- Drop the existing function first (required when function signature changes)
DROP FUNCTION IF EXISTS create_or_update_topic(text, text, double precision[], uuid);

-- Create the updated function
CREATE OR REPLACE FUNCTION create_or_update_topic(
  p_name text,
  p_description text,
  p_description_vector float[],
  p_note_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_topic_id uuid;
  v_similar_topic_id uuid;
  v_similarity float;
  v_name_match_topic_id uuid;
BEGIN
  -- First, check for exact or similar name match (case-insensitive)
  -- Try exact match first (most common case)
  SELECT id INTO v_name_match_topic_id
  FROM topics
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(p_name))
  LIMIT 1;

  -- If exact match not found, try fuzzy name matching using ILIKE
  -- This handles cases like "Machine Learning" vs "machine learning" or partial matches
  IF v_name_match_topic_id IS NULL THEN
    -- Use ILIKE for case-insensitive pattern matching
    -- Check if the new name contains the existing name or vice versa
    SELECT id INTO v_name_match_topic_id
    FROM topics
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(p_name))
       OR LOWER(name) LIKE '%' || LOWER(TRIM(p_name)) || '%'
       OR LOWER(TRIM(p_name)) LIKE '%' || LOWER(name) || '%'
    ORDER BY 
      CASE WHEN LOWER(TRIM(name)) = LOWER(TRIM(p_name)) THEN 1 ELSE 2 END,
      LENGTH(name) -- Prefer shorter names (more specific)
    LIMIT 1;
  END IF;

  -- If name match found, use that topic
  IF v_name_match_topic_id IS NOT NULL THEN
    -- Update existing topic
    UPDATE topics
    SET
      mention_count = mention_count + 1,
      mentions = CASE 
        WHEN p_note_id IS NOT NULL AND p_note_id != '00000000-0000-0000-0000-000000000000'::uuid
        THEN array_append(mentions, p_note_id)
        ELSE mentions
      END
    WHERE id = v_name_match_topic_id;
    RETURN v_name_match_topic_id;
  END IF;

  -- No name match found, check description similarity (80% similarity threshold = 0.2 cosine distance)
  SELECT id, 1 - (description_vector <=> p_description_vector::vector(1536)) as sim
  INTO v_similar_topic_id, v_similarity
  FROM topics
  WHERE description_vector IS NOT NULL
    AND 1 - (description_vector <=> p_description_vector::vector(1536)) >= 0.8
  ORDER BY description_vector <=> p_description_vector::vector(1536)
  LIMIT 1;

  IF v_similar_topic_id IS NOT NULL THEN
    -- Update existing topic
    UPDATE topics
    SET
      mention_count = mention_count + 1,
      mentions = CASE 
        WHEN p_note_id IS NOT NULL AND p_note_id != '00000000-0000-0000-0000-000000000000'::uuid
        THEN array_append(mentions, p_note_id)
        ELSE mentions
      END
    WHERE id = v_similar_topic_id;
    RETURN v_similar_topic_id;
  ELSE
    -- Create new topic (no name match and no description similarity match)
    INSERT INTO topics (name, description, description_vector, mention_count, mentions)
    VALUES (
      p_name,
      p_description,
      p_description_vector::vector(1536),
      1,
      CASE 
        WHEN p_note_id IS NOT NULL AND p_note_id != '00000000-0000-0000-0000-000000000000'::uuid
        THEN ARRAY[p_note_id]
        ELSE ARRAY[]::uuid[]
      END
    )
    RETURNING id INTO v_topic_id;
    RETURN v_topic_id;
  END IF;
END;
$$;

