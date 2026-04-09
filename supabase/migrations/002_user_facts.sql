-- ============================================================
-- DILO — User Facts (Living Profile)
-- The system that learns about the user over time
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  fact TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  times_observed INT NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'inferred',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_category CHECK (category IN (
    'identity',      -- nombre, edad, género, ubicación
    'routine',        -- horarios, hábitos diarios
    'preferences',    -- gustos, preferencias, estilo
    'relationships',  -- familia, amigos, pareja
    'work',           -- trabajo, proyectos, negocio
    'finance',        -- patrones de gasto, ingresos
    'health',         -- ejercicio, sueño, alimentación
    'dates',          -- cumpleaños, aniversarios, eventos
    'general'         -- todo lo demás
  )),
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT valid_source CHECK (source IN ('explicit', 'inferred'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_facts_user ON public.user_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_facts_category ON public.user_facts(user_id, category);
CREATE INDEX IF NOT EXISTS idx_user_facts_confidence ON public.user_facts(user_id, confidence DESC);

-- RLS
ALTER TABLE public.user_facts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see own facts" ON public.user_facts
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages facts" ON public.user_facts
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Prevent duplicate facts per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_facts_unique
  ON public.user_facts(user_id, fact) WHERE confidence > 0;
