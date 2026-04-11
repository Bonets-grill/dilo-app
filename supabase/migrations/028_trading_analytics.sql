-- Trading Analytics — Weekly/monthly correlation reports
CREATE TABLE IF NOT EXISTS public.trading_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  period TEXT NOT NULL,
  period_start DATE NOT NULL,
  analytics_type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, period, period_start, analytics_type)
);

CREATE INDEX IF NOT EXISTS idx_trading_analytics_lookup
  ON public.trading_analytics(user_id, period_start DESC);
