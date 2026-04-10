-- Add market_type to trading_signal_log to distinguish stocks vs forex vs gold
ALTER TABLE public.trading_signal_log ADD COLUMN IF NOT EXISTS market_type TEXT DEFAULT 'stocks';
-- Values: 'stocks', 'forex', 'gold', 'indices', 'crypto'

CREATE INDEX IF NOT EXISTS idx_signal_market_type ON public.trading_signal_log(market_type);
