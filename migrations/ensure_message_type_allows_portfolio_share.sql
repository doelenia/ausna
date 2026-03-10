-- Extend messages.message_type CHECK constraint to allow portfolio shares
-- Existing values: 'text', 'comment_preview'
-- New value: 'portfolio_share' (rich clickable portfolio module in chat)

ALTER TABLE messages
DROP CONSTRAINT IF EXISTS message_type_check;

ALTER TABLE messages
ADD CONSTRAINT message_type_check
CHECK (message_type IN ('text', 'comment_preview', 'portfolio_share'));

COMMENT ON COLUMN messages.message_type IS 'Type of message: text (regular text message), comment_preview (comment notification), portfolio_share (shared portfolio reference)';

