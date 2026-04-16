-- ============================================
-- Mem0-inspired memory system for DILO
-- Replaces the basic user_facts table with a semantic + temporal memory.
--
-- - Semantic retrieval via pgvector (text-embedding-3-small, 1024 dims)
-- - Temporal tracking (valid_from / valid_to + superseded_by chain)
-- - Category-tagged for analytics + filtering
-- - RLS per user
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'identity', 'preferences', 'goals', 'relationships',
    'health', 'finance', 'work', 'location', 'interests', 'routines'
  )),
  confidence REAL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT,                               -- 'chat' | 'manual' | 'migration'
  source_message_id UUID,                    -- link to messages table when from chat
  embedding VECTOR(1024),
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_to TIMESTAMPTZ,                      -- NULL = currently valid
  superseded_by UUID REFERENCES memory_facts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active facts (valid_to IS NULL) per user — main retrieval path
CREATE INDEX IF NOT EXISTS idx_memory_facts_user_active
  ON memory_facts(user_id) WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_memory_facts_user_category
  ON memory_facts(user_id, category) WHERE valid_to IS NULL;

-- Vector similarity index. ivfflat is good for medium-scale retrieval;
-- can switch to HNSW later if we outgrow it.
CREATE INDEX IF NOT EXISTS idx_memory_facts_embedding
  ON memory_facts USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RLS: per-user isolation (same pattern as the rest of the app)
ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memory_facts_select_own" ON memory_facts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "memory_facts_insert_own" ON memory_facts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "memory_facts_update_own" ON memory_facts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "memory_facts_delete_own" ON memory_facts
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_memory_facts_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_memory_facts_touch ON memory_facts;
CREATE TRIGGER trg_memory_facts_touch
  BEFORE UPDATE ON memory_facts
  FOR EACH ROW EXECUTE FUNCTION touch_memory_facts_updated_at();

-- Retrieval helper: top-K facts by semantic similarity to a query embedding.
-- Filters out expired facts and matches only the calling user.
CREATE OR REPLACE FUNCTION retrieve_memory_facts(
  p_user_id UUID,
  p_query_embedding VECTOR(1024),
  p_limit INT DEFAULT 8,
  p_min_similarity REAL DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  fact TEXT,
  category TEXT,
  confidence REAL,
  similarity REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    m.id,
    m.fact,
    m.category,
    m.confidence,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM memory_facts m
  WHERE m.user_id = p_user_id
    AND m.valid_to IS NULL
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;
