-- ══════════════════════════════════════════════
-- TRADING KNOWLEDGE — DILO's learning system
-- ══════════════════════════════════════════════

-- Knowledge base: what DILO learns each day about markets
CREATE TABLE IF NOT EXISTS public.trading_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  category TEXT NOT NULL,  -- market_scan, signal_result, pattern, insight
  symbol TEXT,
  data JSONB NOT NULL,
  confidence INT DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Signal tracking: every signal DILO generates + outcome
CREATE TABLE IF NOT EXISTS public.trading_signal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price DECIMAL NOT NULL,
  stop_loss DECIMAL NOT NULL,
  take_profit DECIMAL NOT NULL,
  setup_type TEXT,
  confidence INT,
  reasoning TEXT[],

  -- Outcome (filled after trade closes or next day)
  outcome TEXT,  -- win, loss, expired, cancelled
  exit_price DECIMAL,
  pnl DECIMAL,
  pnl_pct DECIMAL,
  hit_tp BOOLEAN,
  hit_sl BOOLEAN,

  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Learning stats: aggregated metrics
CREATE TABLE IF NOT EXISTS public.trading_learning_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  total_signals INT DEFAULT 0,
  signals_won INT DEFAULT 0,
  signals_lost INT DEFAULT 0,
  win_rate DECIMAL,
  total_knowledge_entries INT DEFAULT 0,
  markets_analyzed INT DEFAULT 0,
  patterns_detected INT DEFAULT 0,
  data_points_processed INT DEFAULT 0,
  learning_score INT DEFAULT 0,  -- 0-100, the progress bar value
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_date ON public.trading_knowledge(date DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON public.trading_knowledge(category, date DESC);
CREATE INDEX IF NOT EXISTS idx_signal_log_user ON public.trading_signal_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_log_outcome ON public.trading_signal_log(outcome);
CREATE INDEX IF NOT EXISTS idx_learning_stats_date ON public.trading_learning_stats(date DESC);
