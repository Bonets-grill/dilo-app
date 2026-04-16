-- ============================================
-- Dynamic experts — created on the fly when the embedding router fails
-- to match any of the 437 pre-loaded experts with enough confidence.
-- ============================================

CREATE TABLE IF NOT EXISTS dynamic_experts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🧠',
  system_prompt TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  usage_count INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dynamic_experts_embedding
  ON dynamic_experts USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_dynamic_experts_usage
  ON dynamic_experts(usage_count DESC, created_at DESC);

-- Globally readable (any user can benefit from an expert created by another,
-- the prompts are generic domain knowledge). Writes restricted to service-role.
ALTER TABLE dynamic_experts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dynamic_experts_select_all" ON dynamic_experts
  FOR SELECT USING (true);

-- Retrieval helper
CREATE OR REPLACE FUNCTION retrieve_dynamic_experts(
  p_query_embedding VECTOR(1024),
  p_limit INT DEFAULT 3,
  p_min_similarity REAL DEFAULT 0.5
)
RETURNS TABLE (
  slug TEXT,
  name TEXT,
  description TEXT,
  category TEXT,
  emoji TEXT,
  system_prompt TEXT,
  similarity REAL
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    d.slug, d.name, d.description, d.category, d.emoji, d.system_prompt,
    1 - (d.embedding <=> p_query_embedding) AS similarity
  FROM dynamic_experts d
  WHERE d.embedding IS NOT NULL
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;
