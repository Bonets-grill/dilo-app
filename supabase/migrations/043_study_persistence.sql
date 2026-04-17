-- ============================================
-- Persistencia pedagógica: mensajes del chat del maestro y progreso por tema.
-- El maestro ya no pierde la memoria entre sesiones: recuerda qué se enseñó,
-- qué le costó al alumno, y puede abrir la siguiente clase con check-in.
-- ============================================

-- ──────────────────────────────────────────────
-- Mensajes del chat del maestro.
-- Uno por turno (user / assistant). Persistidos por (user_id, subject) para
-- que el maestro cargue contexto al reabrir la app días después.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  session_id UUID REFERENCES public.study_sessions(id) ON DELETE SET NULL,
  topic_idx INT,                                 -- tema del syllabus al que pertenece este turno
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_messages_user_subject
  ON public.study_messages(user_id, subject, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_messages_session
  ON public.study_messages(session_id);

-- ──────────────────────────────────────────────
-- Progreso pedagógico por tema del plan.
-- Una fila por (user, subject, topic_idx). Se actualiza al cerrar un tema con
-- summary generado por IA y lista de conceptos que costaron al alumno.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_topic_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  topic_idx INT NOT NULL,
  topic_name TEXT,                               -- snapshot del nombre en el momento de completar
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('pending','in_progress','completed')),
  summary TEXT,                                  -- 2-3 frases: qué se enseñó, qué entendió
  struggled JSONB NOT NULL DEFAULT '[]',         -- ["fracciones equivalentes", "suma con llevadas"]
  last_studied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject, topic_idx)
);

CREATE INDEX IF NOT EXISTS idx_study_topic_progress_user
  ON public.study_topic_progress(user_id, subject);

-- ──────────────────────────────────────────────
-- RLS: propio del alumno; el padre puede leer (no escribir).
-- ──────────────────────────────────────────────
ALTER TABLE public.study_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_topic_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_messages_own" ON public.study_messages
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "study_messages_parent_view" ON public.study_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_id AND u.parent_user_id = auth.uid()
    )
  );

CREATE POLICY "study_topic_progress_own" ON public.study_topic_progress
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "study_topic_progress_parent_view" ON public.study_topic_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_id AND u.parent_user_id = auth.uid()
    )
  );
