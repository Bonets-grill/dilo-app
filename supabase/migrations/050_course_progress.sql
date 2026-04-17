-- 050_course_progress.sql
-- Progreso cross-device de cursos. Una fila por (user_id, course_slug).
-- El estado completo (secciones vistas, quizzes, tareas) vive en JSONB
-- para no acoplar la DB al schema interno del store Zustand.

CREATE TABLE IF NOT EXISTS public.course_progress (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_slug  TEXT NOT NULL,
  state        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, course_slug)
);

CREATE INDEX IF NOT EXISTS idx_course_progress_user ON public.course_progress(user_id, updated_at DESC);

ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'course_progress' AND policyname = 'course_progress_own') THEN
    CREATE POLICY course_progress_own ON public.course_progress FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END$$;

-- Touch updated_at on modify
CREATE OR REPLACE FUNCTION public.touch_course_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_course_progress_touch ON public.course_progress;
CREATE TRIGGER trg_course_progress_touch
  BEFORE UPDATE ON public.course_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_course_progress_updated_at();
