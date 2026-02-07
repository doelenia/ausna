-- Optimize nested reply queries with composite index
-- This index covers the common query pattern: 
-- WHERE mentioned_note_id IN (...) AND deleted_at IS NULL ORDER BY created_at

CREATE INDEX IF NOT EXISTS idx_notes_mentioned_note_id_deleted_created 
ON notes(mentioned_note_id, deleted_at, created_at ASC)
WHERE deleted_at IS NULL;

-- Add comment explaining the index purpose
COMMENT ON INDEX idx_notes_mentioned_note_id_deleted_created IS 
'Composite index for efficiently querying nested replies: filters by mentioned_note_id, excludes deleted notes, and orders by created_at. Optimizes recursive annotation/reply queries.';


