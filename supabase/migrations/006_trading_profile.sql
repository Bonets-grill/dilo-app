-- ══════════════════════════════════════════════
-- TRADING PROFILE — Personalized trading mode
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trading_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Account info
  account_size DECIMAL NOT NULL,           -- e.g. 20000
  account_type TEXT NOT NULL DEFAULT 'personal', -- personal, funded, prop_firm
  currency TEXT NOT NULL DEFAULT 'EUR',

  -- Goals
  monthly_goal DECIMAL,                    -- e.g. 2300
  daily_goal DECIMAL,                      -- auto-calculated or manual

  -- Risk management
  risk_per_trade_pct DECIMAL NOT NULL DEFAULT 0.5,  -- 0.3, 0.5, 1.0
  risk_per_trade_amount DECIMAL,           -- auto-calculated
  max_rr_ratio DECIMAL NOT NULL DEFAULT 2, -- minimum risk:reward
  max_trades_per_day INT NOT NULL DEFAULT 2,
  max_daily_loss_pct DECIMAL DEFAULT 2.0,  -- stop trading if hit
  max_total_drawdown_pct DECIMAL DEFAULT 8.0,

  -- Markets
  markets TEXT[] NOT NULL DEFAULT '{"forex","indices"}',  -- forex, indices, stocks, crypto
  preferred_pairs TEXT[],                  -- GBP/JPY, EUR/GBP, US500, XAUUSD

  -- Schedule (timezone-aware)
  timezone TEXT NOT NULL DEFAULT 'Atlantic/Canary',
  sessions JSONB DEFAULT '[]',            -- [{name:"London",start:"08:00",end:"10:00",markets:["GBP/JPY"]},{name:"NY",start:"14:30",end:"16:00",markets:["US500","XAUUSD"]}]

  -- Style
  trading_style TEXT DEFAULT 'scalping',   -- scalping, swing, daytrading
  experience_level TEXT DEFAULT 'intermediate', -- beginner, intermediate, advanced

  -- State
  active BOOLEAN DEFAULT true,
  onboarding_complete BOOLEAN DEFAULT false,

  -- Daily tracking
  trades_today INT DEFAULT 0,
  pnl_today DECIMAL DEFAULT 0,
  session_closed BOOLEAN DEFAULT false,
  last_reset_date DATE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_trading_profiles_user ON public.trading_profiles(user_id);
