-- ============================================
-- Enable Supabase Realtime for direct_messages.
-- Without this, postgres_changes subscriptions never fire on INSERT, so
-- the chat list and the open conversation never see new messages.
-- ============================================

-- Add the table to the realtime publication if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;
END $$;
