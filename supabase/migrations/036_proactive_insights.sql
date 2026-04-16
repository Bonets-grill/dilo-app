-- ============================================
-- Proactive Insights — DILO anticipa antes de que el usuario pregunte.
--
-- Table already exists from a previous iteration of the proactive cron.
-- This migration ADDITIVELY augments it with the fields the new anticipate
-- cron needs, without dropping any data.
-- ============================================

CREATE TABLE IF NOT EXISTS proactive_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Additive columns (idempotent via IF NOT EXISTS)
ALTER TABLE proactive_insights
  ADD COLUMN IF NOT EXISTS action_label TEXT,
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS source_payload JSONB,
  ADD COLUMN IF NOT EXISTS priority INT DEFAULT 2,
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- Priority range guard skipped: some pre-existing rows have priority outside
-- 1..5. Enforcement lives in the cron's INSERT values instead.

CREATE INDEX IF NOT EXISTS idx_proactive_insights_user_active
  ON proactive_insights(user_id, created_at DESC)
  WHERE dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_proactive_insights_valid
  ON proactive_insights(user_id, valid_until)
  WHERE dismissed_at IS NULL;

-- RLS (idempotent)
ALTER TABLE proactive_insights ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proactive_insights_select_own') THEN
    CREATE POLICY "proactive_insights_select_own" ON proactive_insights
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proactive_insights_update_own') THEN
    CREATE POLICY "proactive_insights_update_own" ON proactive_insights
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
