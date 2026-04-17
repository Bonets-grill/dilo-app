-- ============================================
-- Ocultar conversaciones de la vista del usuario sin perder la memoria.
-- El agente sigue leyendo public.messages para facts/contexto; el usuario ya
-- no las ve en el panel de historial. Soft-hide, no hard-delete.
-- ============================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS hidden_from_user BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_user_visible
  ON public.conversations(user_id, updated_at DESC)
  WHERE hidden_from_user = FALSE;
