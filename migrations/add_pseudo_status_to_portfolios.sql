-- Migration: Add is_pseudo status to portfolios table
-- This allows portfolios to be hidden from customer search while remaining visible to admins

-- Add is_pseudo column to portfolios table
ALTER TABLE portfolios 
ADD COLUMN is_pseudo BOOLEAN NOT NULL DEFAULT false;

-- Add index for performance (filtering pseudo portfolios)
-- Partial index only includes rows where is_pseudo = true for efficiency
CREATE INDEX idx_portfolios_is_pseudo ON portfolios(is_pseudo) 
WHERE is_pseudo = true;

-- Add comment
COMMENT ON COLUMN portfolios.is_pseudo IS 
  'If true, portfolio is hidden from customer search but visible to admins';

