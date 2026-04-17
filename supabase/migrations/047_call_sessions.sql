-- ============================================
-- Llamadas P2P (walkie-talkie) entre contactos DILO.
-- Session lifecycle: ringing → accepted → ended (ó declined / missed).
-- La señalización WebRTC sigue pasando por /api/rtc/signal; esta tabla
-- es la "presencia" de la llamada (quién llama a quién, cuándo, resultado).
-- ============================================

CREATE TABLE IF NOT EXISTS public.call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'accepted', 'declined', 'missed', 'ended')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_callee_status
  ON public.call_sessions(callee_id, status)
  WHERE status = 'ringing';

CREATE INDEX IF NOT EXISTS idx_call_sessions_parties_created
  ON public.call_sessions(caller_id, callee_id, created_at DESC);

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calls_self" ON public.call_sessions
  FOR ALL USING (caller_id = auth.uid() OR callee_id = auth.uid())
  WITH CHECK (caller_id = auth.uid() OR callee_id = auth.uid());

-- Realtime para que el callee reciba "ringing" instantáneo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'call_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
  END IF;
END $$;
