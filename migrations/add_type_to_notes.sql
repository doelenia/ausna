-- Add type column to notes to distinguish between posts, annotations, and reactions
-- Valid values:
--   - 'post'       : regular top-level note
--   - 'annotation' : comment/annotation attached to another note
--   - 'reaction'   : lightweight reaction (e.g. like) attached to another note

ALTER TABLE notes
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'post';

-- Constrain type to the allowed set of values
ALTER TABLE notes
ADD CONSTRAINT IF NOT EXISTS notes_type_check
CHECK (type IN ('post', 'annotation', 'reaction'));

