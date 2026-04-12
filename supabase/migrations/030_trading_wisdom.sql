-- Trading Wisdom: condensed actionable insights per symbol
-- Generated weekly by discover-patterns cron from raw signal data
-- Read by Strategy + Sniper agents before making decisions

CREATE TABLE IF NOT EXISTS trading_wisdom (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT,                    -- NULL = global rule
  market_type TEXT DEFAULT 'stocks', -- stocks, forex, gold
  category TEXT NOT NULL,         -- pattern, avoid, timing, correlation, regime
  insight TEXT NOT NULL,          -- "AAPL: 72% WR martes London con bullish OB"
  confidence REAL DEFAULT 50,    -- 0-100, based on sample size
  sample_size INT DEFAULT 0,     -- how many signals back this up
  confidence_adjustment REAL DEFAULT 0, -- how much to adjust signal confidence
  metadata JSONB DEFAULT '{}',   -- extra data (best_hour, best_day, avg_pnl, etc)
  last_verified DATE,            -- last time this was confirmed still true
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by symbol (Strategy/Sniper query this)
CREATE INDEX IF NOT EXISTS idx_wisdom_symbol ON trading_wisdom(symbol, active);
CREATE INDEX IF NOT EXISTS idx_wisdom_category ON trading_wisdom(category, active);

-- Unique constraint: one wisdom entry per symbol+category+insight_hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_wisdom_unique
  ON trading_wisdom(symbol, market_type, category, md5(insight))
  WHERE active = true;

-- RLS
ALTER TABLE trading_wisdom ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on trading_wisdom" ON trading_wisdom
  FOR ALL USING (true) WITH CHECK (true);
