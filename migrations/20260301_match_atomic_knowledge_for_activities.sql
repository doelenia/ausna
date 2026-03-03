-- RPC to match atomic knowledge restricted to activity_description source for activity explore ranking.
-- Handles source_info as jsonb object or double-encoded string.
-- Returns source_id (activity portfolio id) and created_at for time decay in app.

CREATE OR REPLACE FUNCTION match_atomic_knowledge_for_activities(
  query_embedding vector(1536),
  activity_portfolio_ids uuid[],
  is_asks_filter boolean,
  match_count int
)
RETURNS TABLE (
  id uuid,
  knowledge_text text,
  similarity float,
  source_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH ak_filtered AS (
    SELECT
      ak.id,
      ak.knowledge_text,
      ak.knowledge_vector,
      ak.created_at,
      CASE
        WHEN jsonb_typeof(ak.source_info) = 'string'
        THEN (ak.source_info#>>'{}')::jsonb
        ELSE ak.source_info
      END AS effective_si
    FROM atomic_knowledge ak
    WHERE ak.knowledge_vector IS NOT NULL
      AND ak.is_asks = is_asks_filter
      AND ak.source_info IS NOT NULL
      AND activity_portfolio_ids IS NOT NULL
      AND array_length(activity_portfolio_ids, 1) > 0
  )
  SELECT
    ak_filtered.id,
    ak_filtered.knowledge_text,
    1 - (ak_filtered.knowledge_vector <=> query_embedding)::float AS similarity,
    (ak_filtered.effective_si->>'source_id')::uuid AS source_id,
    ak_filtered.created_at
  FROM ak_filtered
  WHERE ak_filtered.effective_si->>'source_type' = 'activity_description'
    AND (ak_filtered.effective_si->>'source_id')::uuid = ANY(activity_portfolio_ids)
  ORDER BY ak_filtered.knowledge_vector <=> query_embedding
  LIMIT match_count;
END;
$$;
