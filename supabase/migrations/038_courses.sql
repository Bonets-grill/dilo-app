-- ============================================
-- Courses: contenido formativo de pago dentro de DILO
-- (Empieza con "Claude de 0 a 100" — 659 páginas PDF)
-- ============================================

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,            -- "claude-de-cero-a-cien"
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  cover_emoji TEXT DEFAULT '📘',
  price_eur NUMERIC(6,2) NOT NULL,      -- 9.99
  currency TEXT NOT NULL DEFAULT 'EUR',
  file_path TEXT NOT NULL,              -- "courses/claude-de-cero-a-cien.pdf" en Storage
  file_size_bytes BIGINT,
  pages INT,
  published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug) WHERE published = TRUE;

-- Public catalog: anyone logged in can see what's available. Purchase check
-- lives at app level via user_skills.
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courses_select_published" ON courses
  FOR SELECT USING (published = TRUE);

-- Seed the first course. INSERT ON CONFLICT so re-running is idempotent.
INSERT INTO courses (slug, title, subtitle, description, cover_emoji, price_eur, file_path, file_size_bytes, pages)
VALUES (
  'claude-de-cero-a-cien',
  'Claude de 0 a 100',
  'Curso completo paso a paso',
  'Aprende Claude desde cero hasta dominarlo. 659 páginas de contenido práctico: Claude Code, Claude Agent SDK, Claude API, prompts, skills, hooks, MCP servers, deployment en producción.',
  '📘',
  49.00,
  'courses/claude-de-cero-a-cien.pdf',
  4117037,
  659
) ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description,
  price_eur = EXCLUDED.price_eur,
  file_path = EXCLUDED.file_path,
  file_size_bytes = EXCLUDED.file_size_bytes,
  pages = EXCLUDED.pages,
  updated_at = NOW();

-- Storage bucket: private, only signed URLs. Create only if absent.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('courses', 'courses', FALSE, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policy: service role inserts (via our upload script), authenticated
-- users can only read via signed URLs generated server-side after purchase
-- check. No direct SELECT policy for authenticated → forces signed URL flow.
