-- DILO Trader Memory — Patterns discovered from own trading data
-- Auto-populated by weekly cron. Never edited manually.
-- This is what makes DILO Trader learn and improve over time.

-- Discovered patterns (what works and what doesn't)
CREATE TABLE IF NOT EXISTS public.trading_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pattern definition (unique combination)
  symbol TEXT NOT NULL,
  setup_type TEXT NOT NULL,
  market_type TEXT NOT NULL,
  regime TEXT,
  timeframe TEXT,
  kill_zone TEXT,

  -- Performance stats (auto-calculated)
  total_signals INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  expired INT DEFAULT 0,
  win_rate DECIMAL,
  avg_pnl DECIMAL,
  avg_pnl_pct DECIMAL,
  best_pnl DECIMAL,
  worst_pnl DECIMAL,
  avg_confidence DECIMAL,

  -- Classification
  pattern_type TEXT DEFAULT 'neutral',
  confidence_adjustment INT DEFAULT 0,

  -- Metadata
  first_seen DATE,
  last_updated DATE,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(symbol, setup_type, market_type, regime)
);

CREATE INDEX IF NOT EXISTS idx_trading_patterns_lookup
  ON public.trading_patterns(symbol, setup_type, market_type);

CREATE INDEX IF NOT EXISTS idx_trading_patterns_type
  ON public.trading_patterns(pattern_type);

-- Trading insights (weekly auto-generated observations)
CREATE TABLE IF NOT EXISTS public.trading_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  week_start DATE NOT NULL,
  insight_type TEXT NOT NULL,

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  data JSONB,

  actionable BOOLEAN DEFAULT true,
  applied BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_insights_week
  ON public.trading_insights(week_start DESC);
