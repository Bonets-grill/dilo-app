-- ══════════════════════════════════════════════
-- PROACTIVE INSIGHTS + EMERGENCY SYSTEM
-- ══════════════════════════════════════════════

-- Proactive insights — log what DILO sent to avoid repeating
CREATE TABLE IF NOT EXISTS public.proactive_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL, -- spending_velocity, category_overspend, unanswered_msgs, commitment, birthday, subscription, pattern, etc.
  content TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 5, -- 1-10, only send if >=6
  delivered_via TEXT, -- push, whatsapp, briefing, insights
  dismissed BOOLEAN DEFAULT false, -- user ignored/dismissed
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Emergency contacts per user
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  relationship TEXT, -- madre, padre, esposa, hijo, amigo, etc.
  notify_on_fall BOOLEAN DEFAULT true,
  notify_on_battery BOOLEAN DEFAULT true,
  notify_on_offline BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Location history for Adventure Mode + emergency
CREATE TABLE IF NOT EXISTS public.location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lat DECIMAL NOT NULL,
  lng DECIMAL NOT NULL,
  accuracy DECIMAL,
  speed DECIMAL,
  altitude DECIMAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp message tracking (for intelligence features)
CREATE TABLE IF NOT EXISTS public.whatsapp_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  contact_name TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  message_preview TEXT, -- first 200 chars
  has_commitment BOOLEAN DEFAULT false, -- "te lo envío el lunes"
  commitment_text TEXT,
  commitment_date TIMESTAMPTZ,
  responded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proactive_user ON public.proactive_insights(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_type ON public.proactive_insights(user_id, insight_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_user ON public.emergency_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_location_user ON public.location_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_tracking_user ON public.whatsapp_tracking(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_tracking_unanswered ON public.whatsapp_tracking(user_id, direction, responded, created_at DESC);

-- RLS
ALTER TABLE public.proactive_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_tracking ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY proactive_own ON public.proactive_insights FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY emergency_own ON public.emergency_contacts FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY location_own ON public.location_history FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY wa_tracking_own ON public.whatsapp_tracking FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
