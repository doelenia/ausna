-- Create portfolio_type enum
CREATE TYPE portfolio_type AS ENUM ('human', 'projects', 'community');

-- Create portfolios table
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type portfolio_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Type-specific data stored as JSONB
  metadata JSONB NOT NULL DEFAULT '{}',
  
  -- Constraints
  CONSTRAINT unique_slug_per_type UNIQUE (type, slug)
);

-- Enforce one human portfolio per user using a partial unique index
-- This ensures each user can only have one portfolio of type 'human'
CREATE UNIQUE INDEX idx_unique_human_portfolio_per_user 
ON portfolios(user_id) 
WHERE type = 'human';

-- Create indexes for performance
CREATE INDEX idx_portfolios_type ON portfolios(type);
CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX idx_portfolios_slug ON portfolios(slug);
CREATE INDEX idx_portfolios_created_at ON portfolios(created_at DESC);
CREATE INDEX idx_portfolios_updated_at ON portfolios(updated_at DESC);

-- GIN index for JSONB metadata (enables efficient querying of nested JSON)
CREATE INDEX idx_portfolios_metadata ON portfolios USING GIN(metadata);

-- Full-text search index (PostgreSQL)
-- This enables fast text search across title, description, and metadata
CREATE INDEX idx_portfolios_search ON portfolios USING GIN(
  to_tsvector('english', 
    coalesce(title, '') || ' ' || 
    coalesce(description, '') || ' ' || 
    coalesce(metadata::text, '')
  )
);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

-- RLS Policies (adjust based on your access requirements)
-- Policy: Users can view all portfolios
CREATE POLICY "Portfolios are viewable by everyone"
  ON portfolios FOR SELECT
  USING (true);

-- Policy: Users can create their own portfolios
CREATE POLICY "Users can create their own portfolios"
  ON portfolios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own portfolios
CREATE POLICY "Users can update their own portfolios"
  ON portfolios FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own portfolios
CREATE POLICY "Users can delete their own portfolios"
  ON portfolios FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE portfolios IS 'Unified table for all portfolio types (human, projects, community)';
COMMENT ON COLUMN portfolios.type IS 'Type discriminator for portfolio type';
COMMENT ON COLUMN portfolios.metadata IS 'Type-specific data stored as JSONB';

