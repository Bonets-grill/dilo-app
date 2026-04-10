-- Referral system — invite friends, earn premium
-- Each user gets a unique referral code
-- Track: link created, clicked, signed up

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who invited
  referrer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,

  -- Tracking
  clicks INT DEFAULT 0,
  signups INT DEFAULT 0,

  -- Reward
  reward_granted BOOLEAN DEFAULT false,
  reward_granted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);

-- Track individual referral events (who clicked, who signed up)
CREATE TABLE IF NOT EXISTS public.referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  referral_code TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'click', 'signup'

  -- Who signed up (null for clicks)
  new_user_id UUID REFERENCES public.users(id),

  -- Context
  source TEXT, -- 'whatsapp', 'telegram', 'twitter', 'facebook', 'copy', 'qr'
  ip_hash TEXT, -- hashed IP for dedup, never raw
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_code ON public.referral_events(referral_code);

-- Add referred_by to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by TEXT;
