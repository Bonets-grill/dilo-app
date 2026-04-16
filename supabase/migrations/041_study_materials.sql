-- ============================================
-- Materiales de estudio — fotos de libros, tareas, apuntes
-- El hijo sube una foto → OCR → DILO tutoriza sobre eso exacto.
-- El padre ve qué materiales estudió.
-- ============================================

CREATE TABLE IF NOT EXISTS public.study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  image_url TEXT,                        -- base64 o URL (no persistimos largo plazo, solo sesión)
  ocr_text TEXT,                         -- texto extraído por OCR
  summary TEXT,                          -- resumen corto del contenido (para reporte al padre)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_materials_session ON public.study_materials(session_id);

ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_own" ON public.study_materials
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "materials_parent_view" ON public.study_materials
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND u.parent_user_id = auth.uid())
  );
