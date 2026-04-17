-- ============================================
-- Citas/eventos en Supabase: alternativa interna a Google Calendar.
-- DILO puede crear, listar, actualizar y cancelar citas sin depender de APIs
-- externas. Cuando el usuario habilite Google Calendar, podemos sincronizar.
-- ============================================

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                           -- "Cita dentista de Sebas"
  start_at TIMESTAMPTZ NOT NULL,                 -- ISO 8601 con TZ
  end_at TIMESTAMPTZ,                            -- opcional; si null, duración default 1h
  location TEXT,                                 -- "Clínica Roble, Madrid"
  notes TEXT,                                    -- detalles libres
  attendees JSONB NOT NULL DEFAULT '[]',         -- ["Sebas","Mario"]
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','cancelled')),
  google_event_id TEXT,                          -- si en el futuro se sincroniza a Google Calendar
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_user_start
  ON public.appointments(user_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_user_status
  ON public.appointments(user_id, status);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments_own" ON public.appointments
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Parent de un kid puede ver sus citas (igual patrón que study_*)
CREATE POLICY "appointments_parent_view" ON public.appointments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_id AND u.parent_user_id = auth.uid()
    )
  );
