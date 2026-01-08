-- Create collections table
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(portfolio_id, name)
);

-- Create note_collections join table
CREATE TABLE note_collections (
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (note_id, collection_id)
);

-- Create indexes for performance
CREATE INDEX idx_collections_portfolio_id ON collections(portfolio_id);
CREATE INDEX idx_note_collections_note_id ON note_collections(note_id);
CREATE INDEX idx_note_collections_collection_id ON note_collections(collection_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW
  EXECUTE FUNCTION update_collections_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_collections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for collections
-- Policy: Collections are viewable by everyone
CREATE POLICY "Collections are viewable by everyone"
  ON collections FOR SELECT
  USING (true);

-- Policy: Authenticated users can create collections in portfolios they own or are members of
CREATE POLICY "Users can create collections in their portfolios"
  ON collections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portfolios
      WHERE portfolios.id = collections.portfolio_id
      AND (
        portfolios.user_id = auth.uid()
        OR (
          portfolios.type IN ('projects', 'community')
          AND (
            (portfolios.metadata->>'managers')::jsonb ? auth.uid()::text
            OR (portfolios.metadata->>'members')::jsonb ? auth.uid()::text
          )
        )
      )
    )
  );

-- Policy: Users can update collections in portfolios they own or are members of
CREATE POLICY "Users can update collections in their portfolios"
  ON collections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM portfolios
      WHERE portfolios.id = collections.portfolio_id
      AND (
        portfolios.user_id = auth.uid()
        OR (
          portfolios.type IN ('projects', 'community')
          AND (
            (portfolios.metadata->>'managers')::jsonb ? auth.uid()::text
            OR (portfolios.metadata->>'members')::jsonb ? auth.uid()::text
          )
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portfolios
      WHERE portfolios.id = collections.portfolio_id
      AND (
        portfolios.user_id = auth.uid()
        OR (
          portfolios.type IN ('projects', 'community')
          AND (
            (portfolios.metadata->>'managers')::jsonb ? auth.uid()::text
            OR (portfolios.metadata->>'members')::jsonb ? auth.uid()::text
          )
        )
      )
    )
  );

-- Policy: Users can delete collections in portfolios they own or are members of
CREATE POLICY "Users can delete collections in their portfolios"
  ON collections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM portfolios
      WHERE portfolios.id = collections.portfolio_id
      AND (
        portfolios.user_id = auth.uid()
        OR (
          portfolios.type IN ('projects', 'community')
          AND (
            (portfolios.metadata->>'managers')::jsonb ? auth.uid()::text
            OR (portfolios.metadata->>'members')::jsonb ? auth.uid()::text
          )
        )
      )
    )
  );

-- RLS Policies for note_collections
-- Policy: Note-collection relationships are viewable by everyone
CREATE POLICY "Note collections are viewable by everyone"
  ON note_collections FOR SELECT
  USING (true);

-- Policy: Authenticated users can assign notes to collections if they own the note or are members of the portfolio
CREATE POLICY "Users can assign notes to collections"
  ON note_collections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_collections.note_id
      AND (
        notes.owner_account_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM collections
          JOIN portfolios ON portfolios.id = collections.portfolio_id
          WHERE collections.id = note_collections.collection_id
          AND (
            portfolios.user_id = auth.uid()
            OR (
              portfolios.type IN ('projects', 'communities')
              AND (
                (portfolios.metadata->>'managers')::jsonb ? auth.uid()::text
                OR (portfolios.metadata->>'members')::jsonb ? auth.uid()::text
              )
            )
          )
        )
      )
    )
  );

-- Policy: Users can remove note-collection relationships if they own the note or are members of the portfolio
CREATE POLICY "Users can remove notes from collections"
  ON note_collections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_collections.note_id
      AND (
        notes.owner_account_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM collections
          JOIN portfolios ON portfolios.id = collections.portfolio_id
          WHERE collections.id = note_collections.collection_id
          AND (
            portfolios.user_id = auth.uid()
            OR (
              portfolios.type IN ('projects', 'communities')
              AND (
                (portfolios.metadata->>'managers')::jsonb ? auth.uid()::text
                OR (portfolios.metadata->>'members')::jsonb ? auth.uid()::text
              )
            )
          )
        )
      )
    )
  );

-- Add comments
COMMENT ON TABLE collections IS 'Collections within portfolios (projects) for organizing notes';
COMMENT ON TABLE note_collections IS 'Many-to-many relationship between notes and collections';

