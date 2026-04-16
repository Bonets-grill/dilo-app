-- ============================================
-- Family plan: padres invitan a hijos, hijos tienen modo estudio,
-- padres reciben reportes de adherencia y materias.
-- ============================================

-- Columnas en users para el vínculo padre-hijo.
-- family_role: 'adult' (default), 'parent', 'kid'
-- parent_user_id: si es kid, apunta al user del padre
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS family_role TEXT NOT NULL DEFAULT 'adult'
    CHECK (family_role IN ('adult','parent','kid')),
  ADD COLUMN IF NOT EXISTS parent_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_parent ON public.users(parent_user_id) WHERE parent_user_id IS NOT NULL;

-- ──────────────────────────────────────────────
-- Invitaciones familiares
-- El padre genera un código; el hijo lo redime al registrarse o en settings.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.family_invites (
  code TEXT PRIMARY KEY,                         -- 6-char ej "FAM3K9"
  parent_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kid_nickname TEXT,                             -- opcional, para que el padre identifique el invite
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_family_invites_parent ON public.family_invites(parent_user_id);

-- ──────────────────────────────────────────────
-- Sesiones de estudio
-- Una por cada "arranque de estudio" del hijo. Heartbeat cada 30s mientras
-- hay interacción. Cron cierra las que llevan >3 min sin heartbeat.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,                         -- "Matemáticas", "Historia", libre
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,                          -- NULL mientras está activa
  active_seconds INT NOT NULL DEFAULT 0,         -- tiempo con interacción real (no solo app abierta)
  wall_seconds INT NOT NULL DEFAULT 0,           -- tiempo total con app abierta (distinción para el padre)
  llm_summary TEXT,                              -- qué estudió, generado al cerrar
  homework_count INT DEFAULT 0,                  -- tareas resueltas/revisadas durante la sesión
  homework_score NUMERIC(4,1),                   -- 0-10, promedio de tareas de la sesión
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user ON public.study_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_sessions_open ON public.study_sessions(user_id) WHERE ended_at IS NULL;

-- ──────────────────────────────────────────────
-- RLS: padre puede ver sesiones del hijo; hijo las suyas.
-- ──────────────────────────────────────────────
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

-- Invites: el padre ve los suyos, el hijo ve cuando está siendo invitado
CREATE POLICY "invites_parent_select" ON public.family_invites
  FOR SELECT USING (parent_user_id = auth.uid());

CREATE POLICY "invites_parent_insert" ON public.family_invites
  FOR INSERT WITH CHECK (parent_user_id = auth.uid());

-- Study sessions: el hijo las suyas; el padre las de sus hijos
CREATE POLICY "study_self_select" ON public.study_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "study_parent_select" ON public.study_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND u.parent_user_id = auth.uid())
  );

CREATE POLICY "study_self_insert" ON public.study_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "study_self_update" ON public.study_sessions
  FOR UPDATE USING (user_id = auth.uid());
