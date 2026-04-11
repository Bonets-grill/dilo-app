-- Trading Emotional State — FOMO, revenge, tilt, overtrading detection
CREATE TABLE IF NOT EXISTS public.trading_emotional_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tilt_score INT DEFAULT 0,
  fomo_score INT DEFAULT 0,
  revenge_score INT DEFAULT 0,
  overtrading_score INT DEFAULT 0,
  composite_score INT DEFAULT 0,
  emotional_level TEXT DEFAULT 'OK',
  circuit_breaker_active BOOLEAN DEFAULT FALSE,
  cooldown_until TIMESTAMPTZ,
  trades_today INT DEFAULT 0,
  losses_today INT DEFAULT 0,
  daily_pnl DECIMAL DEFAULT 0,
  current_loss_streak INT DEFAULT 0,
  avg_gap_minutes DECIMAL,
  size_deviation_pct DECIMAL,
  trades_outside_killzone INT DEFAULT 0,
  triggers TEXT[],
  actions_taken TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotional_state_user
  ON public.trading_emotional_state(user_id, created_at DESC);
