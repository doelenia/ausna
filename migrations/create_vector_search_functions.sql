-- Create RPC function for topic similarity search
CREATE OR REPLACE FUNCTION match_topics(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  description_vector vector(1536),
  mention_count integer,
  mentions uuid[],
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    topics.id,
    topics.name,
    topics.description,
    topics.description_vector,
    topics.mention_count,
    topics.mentions,
    topics.created_at,
    topics.updated_at,
    1 - (topics.description_vector <=> query_embedding) as similarity
  FROM topics
  WHERE topics.description_vector IS NOT NULL
    AND 1 - (topics.description_vector <=> query_embedding) >= match_threshold
  ORDER BY topics.description_vector <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create RPC function for intention similarity search
CREATE OR REPLACE FUNCTION match_intentions(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  description_vector vector(1536),
  mention_count integer,
  mentions uuid[],
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    intentions.id,
    intentions.name,
    intentions.description,
    intentions.description_vector,
    intentions.mention_count,
    intentions.mentions,
    intentions.created_at,
    intentions.updated_at,
    1 - (intentions.description_vector <=> query_embedding) as similarity
  FROM intentions
  WHERE intentions.description_vector IS NOT NULL
    AND 1 - (intentions.description_vector <=> query_embedding) >= match_threshold
  ORDER BY intentions.description_vector <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create RPC function to store note vectors (handles vector type conversion)
CREATE OR REPLACE FUNCTION store_note_vectors(
  p_note_id uuid,
  p_summary_vector float[],
  p_compound_text_vector float[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO note_vectors (note_id, summary_vector, compound_text_vector)
  VALUES (
    p_note_id,
    CASE WHEN p_summary_vector IS NOT NULL THEN p_summary_vector::vector(1536) ELSE NULL END,
    CASE WHEN p_compound_text_vector IS NOT NULL THEN p_compound_text_vector::vector(1536) ELSE NULL END
  )
  ON CONFLICT (note_id) DO UPDATE
  SET
    summary_vector = EXCLUDED.summary_vector,
    compound_text_vector = EXCLUDED.compound_text_vector,
    updated_at = NOW();
END;
$$;

-- Create RPC function to store atomic knowledge with vector
CREATE OR REPLACE FUNCTION store_atomic_knowledge(
  p_note_id uuid,
  p_knowledge_texts text[],
  p_knowledge_vectors float[][]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  i int;
BEGIN
  FOR i IN 1..array_length(p_knowledge_texts, 1) LOOP
    INSERT INTO atomic_knowledge (note_id, knowledge_text, knowledge_vector)
    VALUES (
      p_note_id,
      p_knowledge_texts[i],
      p_knowledge_vectors[i]::vector(1536)
    );
  END LOOP;
END;
$$;

-- Create RPC function to create/update topic with vector
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
BEGIN
  -- Find similar topic (80% similarity threshold = 0.2 cosine distance)
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
      mentions = array_append(mentions, p_note_id)
    WHERE id = v_similar_topic_id;
    RETURN v_similar_topic_id;
  ELSE
    -- Create new topic
    INSERT INTO topics (name, description, description_vector, mention_count, mentions)
    VALUES (
      p_name,
      p_description,
      p_description_vector::vector(1536),
      1,
      ARRAY[p_note_id]
    )
    RETURNING id INTO v_topic_id;
    RETURN v_topic_id;
  END IF;
END;
$$;

-- Create RPC function to create/update intention with vector
CREATE OR REPLACE FUNCTION create_or_update_intention(
  p_name text,
  p_description text,
  p_description_vector float[],
  p_note_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_intention_id uuid;
  v_similar_intention_id uuid;
  v_similarity float;
BEGIN
  -- Find similar intention (70% similarity threshold = 0.3 cosine distance)
  SELECT id, 1 - (description_vector <=> p_description_vector::vector(1536)) as sim
  INTO v_similar_intention_id, v_similarity
  FROM intentions
  WHERE description_vector IS NOT NULL
    AND 1 - (description_vector <=> p_description_vector::vector(1536)) >= 0.7
  ORDER BY description_vector <=> p_description_vector::vector(1536)
  LIMIT 1;

  IF v_similar_intention_id IS NOT NULL THEN
    -- Update existing intention
    UPDATE intentions
    SET
      mention_count = mention_count + 1,
      mentions = array_append(mentions, p_note_id)
    WHERE id = v_similar_intention_id;
    RETURN v_similar_intention_id;
  ELSE
    -- Create new intention
    INSERT INTO intentions (name, description, description_vector, mention_count, mentions)
    VALUES (
      p_name,
      p_description,
      p_description_vector::vector(1536),
      1,
      ARRAY[p_note_id]
    )
    RETURNING id INTO v_intention_id;
    RETURN v_intention_id;
  END IF;
END;
$$;

