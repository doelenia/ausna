-- Create notes table
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  references JSONB DEFAULT '[]'::jsonb,
  assigned_portfolios TEXT[] DEFAULT ARRAY[]::TEXT[],
  mentioned_note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_notes_owner_account_id ON notes(owner_account_id);
CREATE INDEX idx_notes_assigned_portfolios ON notes USING GIN(assigned_portfolios);
CREATE INDEX idx_notes_created_at ON notes(created_at DESC);
CREATE INDEX idx_notes_mentioned_note_id ON notes(mentioned_note_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_notes_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Policy: Notes are viewable by everyone
CREATE POLICY "Notes are viewable by everyone"
  ON notes FOR SELECT
  USING (true);

-- Policy: Authenticated users can create their own notes
CREATE POLICY "Users can create their own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.uid() = owner_account_id);

-- Policy: Users can update their own notes
CREATE POLICY "Users can update their own notes"
  ON notes FOR UPDATE
  USING (auth.uid() = owner_account_id)
  WITH CHECK (auth.uid() = owner_account_id);

-- Policy: Users can delete their own notes
CREATE POLICY "Users can delete their own notes"
  ON notes FOR DELETE
  USING (auth.uid() = owner_account_id);

-- Add comment to table
COMMENT ON TABLE notes IS 'Notes created by users, can be assigned to portfolios';
COMMENT ON COLUMN notes.references IS 'Array of reference objects (images or URLs) stored as JSONB';
COMMENT ON COLUMN notes.assigned_portfolios IS 'Array of portfolio IDs where this note is assigned';




