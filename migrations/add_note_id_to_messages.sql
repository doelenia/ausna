-- Add note_id column to messages table
ALTER TABLE messages
ADD COLUMN note_id UUID REFERENCES notes(id) ON DELETE SET NULL;

-- Create index for note_id lookups
CREATE INDEX idx_messages_note_id ON messages(note_id);

-- Add comment
COMMENT ON COLUMN messages.note_id IS 'Optional reference to a note that was shared in this message. NULL if message does not contain a note.';



