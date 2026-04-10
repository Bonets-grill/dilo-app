-- Separate learning stats by market type
-- The stocks cron uses upsert onConflict:"date" so we keep that constraint intact
-- Forex stats go in their own rows with market_type='forex'

-- Add market_type column (default 'stocks' to match existing rows)
ALTER TABLE public.trading_learning_stats
  ADD COLUMN IF NOT EXISTS market_type TEXT DEFAULT 'stocks';

-- Index for fast per-market queries
CREATE INDEX IF NOT EXISTS idx_learning_stats_market
  ON public.trading_learning_stats(market_type, date DESC);
