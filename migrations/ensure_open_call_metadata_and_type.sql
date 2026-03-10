-- Ensure notes supports open calls
-- - Adds notes.metadata (JSONB) if missing
-- - Updates notes.type check constraint to include 'open_call'

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE notes
  DROP CONSTRAINT IF EXISTS notes_type_check;

ALTER TABLE notes
  ADD CONSTRAINT notes_type_check
  CHECK (type IN ('post', 'annotation', 'reaction', 'open_call'));

