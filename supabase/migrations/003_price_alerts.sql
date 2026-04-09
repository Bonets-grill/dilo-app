-- ============================================================
-- DILO — Price Alerts (track prices over time)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  target_price REAL,
  current_price REAL,
  lowest_price REAL,
  source TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_checked TIMESTAMPTZ DEFAULT now(),
  triggered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON public.price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON public.price_alerts(status) WHERE status = 'active';

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see own alerts" ON public.price_alerts
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages alerts" ON public.price_alerts
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
