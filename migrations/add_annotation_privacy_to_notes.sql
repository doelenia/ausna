-- Add annotation_privacy column to notes table
ALTER TABLE notes
ADD COLUMN annotation_privacy TEXT DEFAULT 'everyone' NOT NULL;

-- Add CHECK constraint to ensure valid values
ALTER TABLE notes
ADD CONSTRAINT annotation_privacy_check 
CHECK (annotation_privacy IN ('authors', 'friends', 'everyone'));

-- Create index for filtering by annotation_privacy
CREATE INDEX idx_notes_annotation_privacy ON notes(annotation_privacy);

-- Add comment
COMMENT ON COLUMN notes.annotation_privacy IS 'Privacy setting for annotations: authors (only note owner and portfolio members), friends (only friends of note owner), everyone (any authenticated user)';

