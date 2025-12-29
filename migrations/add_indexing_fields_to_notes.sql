-- Add indexing-related fields to notes table
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS compound_text TEXT,
  ADD COLUMN IF NOT EXISTS topics UUID[] DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS intentions UUID[] DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS indexing_status TEXT DEFAULT 'pending';

-- Create index for indexing_status for querying pending/processing notes
CREATE INDEX IF NOT EXISTS idx_notes_indexing_status ON notes(indexing_status);

-- Create GIN index for topics array
CREATE INDEX IF NOT EXISTS idx_notes_topics ON notes USING GIN(topics);

-- Create GIN index for intentions array
CREATE INDEX IF NOT EXISTS idx_notes_intentions ON notes USING GIN(intentions);

-- Add full-text search index for compound_text (keyword indexing)
CREATE INDEX IF NOT EXISTS idx_notes_compound_text_search ON notes USING GIN(to_tsvector('english', coalesce(compound_text, '')));

-- Add comment
COMMENT ON COLUMN notes.summary IS 'One-sentence summary of the note';
COMMENT ON COLUMN notes.compound_text IS 'Combined text from annotated note, references, and note text';
COMMENT ON COLUMN notes.topics IS 'Array of topic IDs associated with this note';
COMMENT ON COLUMN notes.intentions IS 'Array of intention IDs associated with this note';
COMMENT ON COLUMN notes.indexing_status IS 'Status of vector indexing: pending, processing, completed, failed';

