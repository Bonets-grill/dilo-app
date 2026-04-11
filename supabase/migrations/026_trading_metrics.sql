-- Trading Metrics — Professional signal resolution with MFE/MAE/R-Multiple
-- Adds columns to existing trading_signal_log for deeper analytics

ALTER TABLE public.trading_signal_log
  ADD COLUMN IF NOT EXISTS mfe DECIMAL,              -- Maximum Favorable Excursion (best price reached)
  ADD COLUMN IF NOT EXISTS mae DECIMAL,              -- Maximum Adverse Excursion (worst price reached)
  ADD COLUMN IF NOT EXISTS r_multiple DECIMAL,       -- P&L in units of risk (pnl / risk_per_share)
  ADD COLUMN IF NOT EXISTS hold_time_hours DECIMAL,  -- Time between entry and resolution
  ADD COLUMN IF NOT EXISTS entry_hour_utc INT,       -- Hour of signal creation (0-23)
  ADD COLUMN IF NOT EXISTS entry_day_of_week INT,    -- Day of week (0=Sun, 6=Sat)
  ADD COLUMN IF NOT EXISTS regime_at_entry TEXT;      -- Market regime when signal was created

-- Session metrics (aggregated per trading day)
CREATE TABLE IF NOT EXISTS public.trading_session_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,  -- NULL = system signals
  session_date DATE NOT NULL,
  total_trades INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  expired INT DEFAULT 0,
  win_rate DECIMAL,
  total_pnl DECIMAL DEFAULT 0,
  avg_r_multiple DECIMAL,
  best_trade_pnl DECIMAL,
  worst_trade_pnl DECIMAL,
  avg_hold_time_hours DECIMAL,
  avg_mfe DECIMAL,
  avg_mae DECIMAL,
  trades_in_killzone INT DEFAULT 0,
  trades_outside_killzone INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_session_metrics_date
  ON public.trading_session_metrics(session_date DESC);
