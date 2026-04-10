-- ══════════════════════════════════════════════
-- DILO JOURNAL — Personal growth & learning system
-- ══════════════════════════════════════════════

-- Journal entries — conversations with DILO mentor
CREATE TABLE IF NOT EXISTS public.user_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  dilo_response TEXT,
  extracted_lessons JSONB DEFAULT '[]',
  extracted_goals JSONB DEFAULT '[]',
  extracted_decisions JSONB DEFAULT '[]',
  mood TEXT CHECK (mood IN ('positive', 'negative', 'neutral', 'mixed')),
  category TEXT CHECK (category IN ('personal', 'professional', 'financial', 'health', 'relationship', 'general')),
  follow_up_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lessons learned — extracted from journal entries
CREATE TABLE IF NOT EXISTS public.user_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lesson TEXT NOT NULL,
  source_journal_id UUID REFERENCES public.user_journal(id) ON DELETE SET NULL,
  times_relevant INT DEFAULT 0,
  category TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Goals — tracked with check-ins
CREATE TABLE IF NOT EXISTS public.user_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  progress_pct INT DEFAULT 0,
  check_in_interval TEXT DEFAULT 'weekly' CHECK (check_in_interval IN ('daily', 'weekly', 'monthly')),
  next_check_in DATE,
  notes TEXT,
  source_journal_id UUID REFERENCES public.user_journal(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Consent log — tracks every consent given/withdrawn (legal requirement)
CREATE TABLE IF NOT EXISTS public.consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL, -- privacy_policy, terms, trading, whatsapp, location, voice, photos, journal
  version TEXT NOT NULL, -- version of the policy accepted
  granted BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_journal_user ON public.user_journal(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_mood ON public.user_journal(user_id, mood, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_followup ON public.user_journal(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lessons_user ON public.user_lessons(user_id, active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.user_goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_checkin ON public.user_goals(next_check_in, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_consent_user ON public.consent_log(user_id, consent_type, created_at DESC);

-- RLS
ALTER TABLE public.user_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY journal_own ON public.user_journal FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY lessons_own ON public.user_lessons FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY goals_own ON public.user_goals FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY consent_own ON public.consent_log FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
