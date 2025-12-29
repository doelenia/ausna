-- Create note_vectors table for storing vector embeddings
CREATE TABLE note_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  summary_vector vector(1536), -- OpenAI embedding dimension
  compound_text_vector vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(note_id)
);

-- Create atomic_knowledge table
CREATE TABLE atomic_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  knowledge_text TEXT NOT NULL,
  knowledge_vector vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create topics table
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  description_vector vector(1536),
  mention_count INTEGER DEFAULT 0 NOT NULL,
  mentions UUID[] DEFAULT ARRAY[]::UUID[], -- Array of note IDs
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create intentions table
CREATE TABLE intentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  description_vector vector(1536),
  mention_count INTEGER DEFAULT 0 NOT NULL,
  mentions UUID[] DEFAULT ARRAY[]::UUID[], -- Array of note IDs
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_note_vectors_note_id ON note_vectors(note_id);
CREATE INDEX idx_atomic_knowledge_note_id ON atomic_knowledge(note_id);
CREATE INDEX idx_atomic_knowledge_vector ON atomic_knowledge USING ivfflat (knowledge_vector vector_cosine_ops);

CREATE INDEX idx_topics_name ON topics(name);
CREATE INDEX idx_topics_mention_count ON topics(mention_count);
CREATE INDEX idx_topics_vector ON topics USING ivfflat (description_vector vector_cosine_ops);

CREATE INDEX idx_intentions_name ON intentions(name);
CREATE INDEX idx_intentions_mention_count ON intentions(mention_count);
CREATE INDEX idx_intentions_vector ON intentions USING ivfflat (description_vector vector_cosine_ops);

-- Function to automatically update updated_at timestamp for note_vectors
CREATE OR REPLACE FUNCTION update_note_vectors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for note_vectors
CREATE TRIGGER update_note_vectors_updated_at
  BEFORE UPDATE ON note_vectors
  FOR EACH ROW
  EXECUTE FUNCTION update_note_vectors_updated_at();

-- Function to automatically update updated_at timestamp for topics
CREATE OR REPLACE FUNCTION update_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for topics
CREATE TRIGGER update_topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW
  EXECUTE FUNCTION update_topics_updated_at();

-- Function to automatically update updated_at timestamp for intentions
CREATE OR REPLACE FUNCTION update_intentions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for intentions
CREATE TRIGGER update_intentions_updated_at
  BEFORE UPDATE ON intentions
  FOR EACH ROW
  EXECUTE FUNCTION update_intentions_updated_at();

-- Enable Row Level Security
ALTER TABLE note_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE atomic_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE intentions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: All indexing data is viewable by everyone (same as notes)
CREATE POLICY "Note vectors are viewable by everyone"
  ON note_vectors FOR SELECT
  USING (true);

CREATE POLICY "Atomic knowledge is viewable by everyone"
  ON atomic_knowledge FOR SELECT
  USING (true);

CREATE POLICY "Topics are viewable by everyone"
  ON topics FOR SELECT
  USING (true);

CREATE POLICY "Intentions are viewable by everyone"
  ON intentions FOR SELECT
  USING (true);

-- RLS Policies: Only system can insert/update/delete (via service role)
-- These will be managed by server-side code with service role
-- For now, allow authenticated users to insert/update (will be restricted by application logic)
CREATE POLICY "Authenticated users can manage note vectors"
  ON note_vectors FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage atomic knowledge"
  ON atomic_knowledge FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage topics"
  ON topics FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage intentions"
  ON intentions FOR ALL
  USING (auth.role() = 'authenticated');

-- Add comments
COMMENT ON TABLE note_vectors IS 'Vector embeddings for notes (summary and compound text)';
COMMENT ON TABLE atomic_knowledge IS 'Atomic knowledge points extracted from notes';
COMMENT ON TABLE topics IS 'Topics extracted from notes with similarity matching';
COMMENT ON TABLE intentions IS 'Intentions detected in notes with similarity matching';

