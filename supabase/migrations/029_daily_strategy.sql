-- Daily Strategy Plan — stores HTF analysis from the Strategy Agent
-- Used by the Sniper Agent to check alignment before entering trades

CREATE TABLE IF NOT EXISTS public.daily_strategy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  symbol TEXT NOT NULL,
  htf_bias TEXT NOT NULL DEFAULT 'neutral',  -- bullish, bearish, neutral
  trade_direction TEXT NOT NULL DEFAULT 'NO_TRADE',  -- LONG_ONLY, SHORT_ONLY, NO_TRADE
  swing_high DECIMAL,
  swing_low DECIMAL,
  equilibrium DECIMAL,
  zone TEXT,  -- premium, discount, equilibrium
  atr DECIMAL,
  key_levels JSONB DEFAULT '{}',  -- OBs, FVGs, swing levels
  news_events JSONB DEFAULT '[]',  -- high-impact events for the day
  confluence_min_score INT DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, symbol)
);

-- Index for fast lookups by date
CREATE INDEX IF NOT EXISTS idx_daily_strategy_date ON public.daily_strategy(date);
CREATE INDEX IF NOT EXISTS idx_daily_strategy_symbol ON public.daily_strategy(symbol);

-- RLS
ALTER TABLE public.daily_strategy ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (cron jobs)
CREATE POLICY "Service role full access on daily_strategy"
  ON public.daily_strategy FOR ALL
  USING (true) WITH CHECK (true);
