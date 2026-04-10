-- ══════════════════════════════════════════════
-- SYMBOL PROFILES — Historical intelligence per asset
-- Auto-updated monthly by cron with DILO's own data
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.symbol_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,

  -- Historical behavior
  avg_earnings_move_pct DECIMAL,         -- Average % move on earnings day
  earnings_beat_rate DECIMAL,            -- % of times company beats estimates
  best_timeframe TEXT,                   -- Which timeframe gives best signals (1d, 4h, 1h)
  worst_timeframe TEXT,                  -- Avoid signals on this timeframe

  -- Seasonality
  best_months INT[],                     -- e.g. {1,4,10,11,12} = Jan, Apr, Q4
  worst_months INT[],                    -- e.g. {9} = September
  seasonality_notes TEXT,                -- "Historically strong in Q4 holiday season"

  -- Correlation & regime
  correlation_spy DECIMAL,               -- Rolling 60-day correlation with SPY
  avg_daily_range_pct DECIMAL,           -- Average daily range as % of price (volatility)
  beta DECIMAL,                          -- Beta vs S&P 500

  -- SMC-specific (from DILO's own analysis)
  smc_win_rate DECIMAL,                  -- DILO's win rate on SMC signals for this symbol
  smc_best_setup TEXT,                   -- Which SMC setup works best (OB, FVG, sweep)
  smc_avg_rr DECIMAL,                    -- Average R:R on winning trades
  total_signals_analyzed INT DEFAULT 0,  -- How many signals DILO has data for

  -- Regime behavior
  trending_win_rate DECIMAL,             -- Win rate in trending markets
  ranging_win_rate DECIMAL,              -- Win rate in ranging markets
  high_vol_win_rate DECIMAL,             -- Win rate in high volatility
  low_vol_win_rate DECIMAL,              -- Win rate in low volatility

  -- Insider & institutional
  recent_insider_buys INT DEFAULT 0,     -- Insider buys in last 90 days
  institutional_sentiment TEXT,          -- bullish/bearish/neutral from analyst consensus

  -- Metadata
  sector TEXT,
  market_cap_tier TEXT,                  -- mega, large, mid, small
  notes TEXT,                            -- Free-form intelligence notes

  -- Auto-update tracking
  last_auto_update DATE,                 -- When cron last updated this
  data_source TEXT DEFAULT 'manual',     -- manual, finnhub, dilo_signals

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_symbol_profiles_symbol ON public.symbol_profiles(symbol);

-- Seed with initial data for the watchlist
INSERT INTO public.symbol_profiles (symbol, sector, market_cap_tier, avg_earnings_move_pct, best_months, worst_months, seasonality_notes, notes, data_source) VALUES
  ('AAPL', 'Technology', 'mega', 4.5, '{1,10,11,12}', '{9}', 'Strong in Q4 (iPhone launch + holidays). September historically weakest.', 'Most liquid stock. Earnings typically in late Jan/Apr/Jul/Oct. Low beta, defensive tech.', 'manual'),
  ('NVDA', 'Technology', 'mega', 12.0, '{1,2,5,11}', '{9}', 'Massive earnings moves (8-15%). AI narrative drives momentum.', 'Highest earnings volatility in mega-cap. Options expensive around earnings. SMC works well on daily.', 'manual'),
  ('TSLA', 'Automotive', 'mega', 10.0, '{1,3,11}', '{5,9}', 'Unpredictable. Elon tweets move price. Delivery numbers matter more than earnings.', 'Most volatile mega-cap. Wide stops required. Sweep detection valuable — lots of manipulation.', 'manual'),
  ('AMZN', 'Technology', 'mega', 5.0, '{1,7,10,11,12}', '{9}', 'Prime Day (July) and Q4 holiday season are catalysts.', 'AWS revenue growth is the real driver. Retail is noise. Cloud competition from MSFT/GOOGL.', 'manual'),
  ('MSFT', 'Technology', 'mega', 4.0, '{1,4,10,11}', '{9}', 'Steady grower. Azure cloud + AI copilot narrative.', 'Defensive mega-cap. Lower volatility than NVDA/TSLA. Good for swing trades. Correlates highly with SPY.', 'manual'),
  ('META', 'Technology', 'mega', 8.0, '{1,2,4,10}', '{9}', 'Ad revenue seasonal: Q4 best (holiday ads). Reality Labs is a drag.', 'High earnings volatility. Short interest often elevated. Metaverse spending creates uncertainty.', 'manual'),
  ('GOOGL', 'Technology', 'mega', 5.5, '{1,4,7,10}', '{9}', 'Ad revenue + cloud growth. Antitrust risk is ongoing overhang.', 'Search monopoly provides stability. YouTube and Cloud are growth drivers. Lower vol than META.', 'manual'),
  ('SPY', 'Index', 'index', 1.5, '{1,4,7,11,12}', '{9}', 'January effect + Santa rally (Dec). Sell in May partially true. September worst month historically.', 'S&P 500 ETF. The benchmark. VIX >30 = fear = buy opportunity. VIX <15 = complacency = caution.', 'manual'),
  ('QQQ', 'Index', 'index', 2.0, '{1,4,11,12}', '{9}', 'Tech-heavy index. Amplifies SPY moves by ~1.3x.', 'NASDAQ 100. Higher beta than SPY. More sensitive to interest rates. Growth vs value rotation matters.', 'manual')
ON CONFLICT (symbol) DO NOTHING;
