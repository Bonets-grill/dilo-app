-- ══════════════════════════════════════════════
-- DIRECT MESSAGING — User-to-user messaging within DILO
-- ══════════════════════════════════════════════

-- User connections (friend requests / contacts)
CREATE TABLE IF NOT EXISTS public.user_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(requester_id, receiver_id)
);

-- Direct messages between users
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'payment_link', 'voice')),
  media_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Make users searchable by name (for finding other DILO users)
CREATE INDEX IF NOT EXISTS idx_users_name ON public.users(name);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Connection indexes
CREATE INDEX IF NOT EXISTS idx_connections_requester ON public.user_connections(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_receiver ON public.user_connections(receiver_id, status);

-- Message indexes
CREATE INDEX IF NOT EXISTS idx_dm_sender ON public.direct_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_receiver ON public.direct_messages(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_conversation ON public.direct_messages(
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id),
  created_at DESC
);

-- RLS
ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can see connections where they are requester or receiver
DO $$ BEGIN
  CREATE POLICY connections_own ON public.user_connections FOR ALL
    USING (requester_id = auth.uid() OR receiver_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users can see messages they sent or received
DO $$ BEGIN
  CREATE POLICY dm_own ON public.direct_messages FOR ALL
    USING (sender_id = auth.uid() OR receiver_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enable Realtime for direct_messages (instant delivery)
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
