-- Extend match_atomic_knowledge to support topic filtering and return atomic knowledge topics
-- filter_topic_ids: optional list of topic IDs; when provided, matched atomic knowledge must share at least one topic

CREATE OR REPLACE FUNCTION match_atomic_knowledge(
  query_embedding vector(1536),
  exclude_human_portfolio_ids uuid[],
  is_asks_filter boolean,
  match_count int,
  filter_topic_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  knowledge_text text,
  assigned_human uuid[],
  assigned_projects uuid[],
  topics uuid[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ak.id,
    ak.knowledge_text,
    ak.assigned_human,
    ak.assigned_projects,
    ak.topics,
    1 - (ak.knowledge_vector <=> query_embedding) as similarity
  FROM atomic_knowledge ak
  WHERE ak.knowledge_vector IS NOT NULL
    AND ak.is_asks = is_asks_filter
    AND (exclude_human_portfolio_ids IS NULL OR NOT (ak.assigned_human && exclude_human_portfolio_ids))
    AND (
      filter_topic_ids IS NULL
      OR COALESCE(ak.topics, ARRAY[]::uuid[]) && filter_topic_ids
    )
  ORDER BY ak.knowledge_vector <=> query_embedding
  LIMIT match_count;
END;
$$;



