-- ============================================
-- Fecha de nacimiento obligatoria + almacenamiento de horóscopos diarios.
-- Cada usuario pasa por un gate que pide birthdate (y opcionalmente hora y
-- ciudad de nacimiento para la carta astral). El cron diario genera texto
-- + audio y lo persiste aquí.
-- ============================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS birthdate DATE,
  ADD COLUMN IF NOT EXISTS birth_time TIME,
  ADD COLUMN IF NOT EXISTS birth_place TEXT,
  ADD COLUMN IF NOT EXISTS zodiac_sign TEXT;

CREATE INDEX IF NOT EXISTS idx_users_birthdate ON public.users(birthdate) WHERE birthdate IS NOT NULL;

-- Horóscopos diarios generados por el cron
CREATE TABLE IF NOT EXISTS public.horoscopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  for_date DATE NOT NULL,
  zodiac_sign TEXT NOT NULL,
  text TEXT NOT NULL,                      -- markdown largo
  audio_url TEXT,                          -- data URL o URL pública del TTS
  meta JSONB DEFAULT '{}',                 -- { luckyColor, luckyNumber, compatibility, moonPhase, ... }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, for_date)
);

CREATE INDEX IF NOT EXISTS idx_horoscopes_user_date
  ON public.horoscopes(user_id, for_date DESC);

ALTER TABLE public.horoscopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "horoscopes_own" ON public.horoscopes
  FOR SELECT USING (user_id = auth.uid());
