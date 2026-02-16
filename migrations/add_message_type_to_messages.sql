-- Add message_type column to messages table
ALTER TABLE messages
ADD COLUMN message_type TEXT DEFAULT 'text' NOT NULL;

-- Add CHECK constraint to ensure valid values
ALTER TABLE messages
ADD CONSTRAINT message_type_check 
CHECK (message_type IN ('text', 'comment_preview'));

-- Create index for filtering by message_type
CREATE INDEX idx_messages_message_type ON messages(message_type);

-- Add comment
COMMENT ON COLUMN messages.message_type IS 'Type of message: text (regular text message), comment_preview (comment notification with preview of comment note)';

