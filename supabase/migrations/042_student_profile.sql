-- ============================================
-- Perfil del estudiante — grado, región, asignaturas, planes de estudio
-- ============================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS grade TEXT,             -- "2° ESO", "5° Primaria", etc.
  ADD COLUMN IF NOT EXISTS school_region TEXT,      -- "ES", "MX", "CO", auto-detected
  ADD COLUMN IF NOT EXISTS subjects JSONB DEFAULT '[]';  -- ["Matemáticas", "Lengua", ...]

-- Plan de estudio: syllabus generado por IA para cada asignatura
CREATE TABLE IF NOT EXISTS public.study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  grade TEXT NOT NULL,
  region TEXT NOT NULL,
  syllabus JSONB NOT NULL DEFAULT '[]',   -- [{topic, description, completed, completed_at}]
  current_topic INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, subject)
);

CREATE INDEX IF NOT EXISTS idx_study_plans_user ON public.study_plans(user_id);

ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_own" ON public.study_plans
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "plans_parent_view" ON public.study_plans
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND u.parent_user_id = auth.uid())
  );
