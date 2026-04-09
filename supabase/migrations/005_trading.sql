-- ══════════════════════════════════════════════
-- TRADING COPILOT — Risk management, journal, snapshots
-- ══════════════════════════════════════════════

-- TRADING RULES (risk management settings per user)
CREATE TABLE IF NOT EXISTS public.trading_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  max_trades_per_day INT,
  max_loss_per_day DECIMAL,
  max_position_size_pct DECIMAL,
  max_portfolio_loss_pct DECIMAL,
  blocked_symbols TEXT[],
  no_trading_hours TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- TRADE JOURNAL (imported trades + user annotations)
CREATE TABLE IF NOT EXISTS public.trade_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  alpaca_order_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  qty DECIMAL NOT NULL,
  price DECIMAL NOT NULL,
  total_amount DECIMAL NOT NULL,
  filled_at TIMESTAMPTZ NOT NULL,
  pnl DECIMAL,
  pnl_pct DECIMAL,
  notes TEXT,
  tags TEXT[],
  emotion TEXT,
  setup TEXT,
  ai_analysis TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TRADE SNAPSHOTS (daily portfolio snapshots for performance tracking)
CREATE TABLE IF NOT EXISTS public.trade_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  portfolio_value DECIMAL NOT NULL,
  cash DECIMAL NOT NULL,
  day_pnl DECIMAL,
  day_pnl_pct DECIMAL,
  positions_count INT,
  trades_count INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trade_journal_user ON public.trade_journal(user_id, filled_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_journal_symbol ON public.trade_journal(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_trade_journal_order ON public.trade_journal(alpaca_order_id);
CREATE INDEX IF NOT EXISTS idx_trade_snapshots_user ON public.trade_snapshots(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_trading_rules_user ON public.trading_rules(user_id);
