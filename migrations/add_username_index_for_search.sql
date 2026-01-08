-- Add index for username search on human portfolios
-- This enables fast prefix matching for username searches
CREATE INDEX IF NOT EXISTS idx_portfolios_username 
ON portfolios USING btree ((metadata->>'username')) 
WHERE type = 'human' AND metadata->>'username' IS NOT NULL;

-- Add comment
COMMENT ON INDEX idx_portfolios_username IS 'Index for fast username search on human portfolios';

