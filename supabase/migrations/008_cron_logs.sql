-- ══════════════════════════════════════════════
-- CRON LOGS — Internal monitoring for all crons
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cron_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
  duration_ms INT,
  metrics JSONB DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_logs_name_date ON public.cron_logs(cron_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_logs_date ON public.cron_logs(created_at DESC);
