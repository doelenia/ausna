-- Add deleted_at column for soft delete
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create index for filtering out deleted notes
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);

-- Add comment
COMMENT ON COLUMN notes.deleted_at IS 'Timestamp when note was deleted (soft delete). NULL means note is active.';

