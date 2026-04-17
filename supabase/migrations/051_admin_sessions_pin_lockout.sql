-- 051_admin_sessions_pin_lockout.sql
-- Replaces the raw-secret-in-cookie admin auth and adds PIN brute-force
-- protection + webhook idempotency (CN-003, CN-005, CN-004 hardening).

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  last_used_at  TIMESTAMPTZ,
  user_agent    TEXT,
  ip            TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON public.admin_sessions(expires_at);
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
-- No RLS policy → only service role can read/write, which is the intended
-- model (admin auth is server-side only).

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  ip         TEXT,
  succeeded  BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time
  ON public.login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
  ON public.login_attempts(ip, created_at DESC);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  event_type   TEXT,
  received_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON public.webhook_events(received_at DESC);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
