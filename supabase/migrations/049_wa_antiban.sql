-- 049_wa_antiban.sql
-- Tracking tables for the WhatsApp anti-ban layer (src/lib/wa/anti-ban.ts).
--
-- Two concerns:
--   1. wa_send_log   — every outbound attempt (success OR blocked) so we can
--                      enforce daily caps, per-JID spacing, and audit bans.
--   2. wa_instance_state — per-instance counters: kill-switch pause window,
--                          warmup end, error streak, so we know whether a
--                          given instance can currently send.

CREATE TABLE IF NOT EXISTS public.wa_send_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES public.users(id) ON DELETE CASCADE,
  instance      TEXT NOT NULL,
  to_jid        TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('ok','error','blocked_pre','blocked_cap','blocked_spacing','blocked_warmup','blocked_paused','rate_limited')),
  error_text    TEXT,
  content_len   INTEGER,
  proactive     BOOLEAN DEFAULT false,   -- true if sent without prior inbound (crons)
  sent_at       TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_send_log_instance_time ON public.wa_send_log(instance, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_send_log_user_jid ON public.wa_send_log(user_id, to_jid, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_send_log_status ON public.wa_send_log(status, sent_at DESC) WHERE status <> 'ok';

CREATE TABLE IF NOT EXISTS public.wa_instance_state (
  instance        TEXT PRIMARY KEY,
  user_id         UUID REFERENCES public.users(id) ON DELETE CASCADE,
  connected_at    TIMESTAMPTZ DEFAULT now(),
  warmup_ends_at  TIMESTAMPTZ DEFAULT (now() + INTERVAL '3 days'),
  paused_until    TIMESTAMPTZ,
  error_streak    INTEGER NOT NULL DEFAULT 0,
  last_error_at   TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.wa_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_instance_state ENABLE ROW LEVEL SECURITY;

-- Owner-only read. Writes go through service role in anti-ban lib, never client.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wa_send_log' AND policyname = 'wa_send_log_own') THEN
    CREATE POLICY wa_send_log_own ON public.wa_send_log FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wa_instance_state' AND policyname = 'wa_instance_state_own') THEN
    CREATE POLICY wa_instance_state_own ON public.wa_instance_state FOR SELECT USING (user_id = auth.uid());
  END IF;
END$$;
