-- Add filters_applied column to trading_signal_log
-- Tracks which intelligence filters were applied to each signal
-- Used to measure impact of each filter on win rate after 30 days
ALTER TABLE public.trading_signal_log ADD COLUMN IF NOT EXISTS filters_applied TEXT[] DEFAULT '{}';

-- Index for filter analysis queries
CREATE INDEX IF NOT EXISTS idx_signal_filters ON public.trading_signal_log USING GIN (filters_applied);
