-- ============================================
-- Experts feature: 184 specialist agents from agency-agents repo
-- expert_conversations: one per (user, expert) thread
-- expert_messages: chat history per conversation
-- ============================================

CREATE TABLE IF NOT EXISTS expert_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expert_slug TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expert_conv_user ON expert_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_expert_conv_slug ON expert_conversations(expert_slug);

CREATE TABLE IF NOT EXISTS expert_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES expert_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens_prompt INT,
  tokens_completion INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expert_msg_conv ON expert_messages(conversation_id, created_at);

-- RLS: per-user isolation
ALTER TABLE expert_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expert_conv_select_own" ON expert_conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "expert_conv_insert_own" ON expert_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expert_conv_update_own" ON expert_conversations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expert_conv_delete_own" ON expert_conversations
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE expert_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expert_msg_select_own" ON expert_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "expert_msg_insert_own" ON expert_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expert_msg_delete_own" ON expert_messages
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_expert_conv_updated_at() RETURNS TRIGGER AS $$
BEGIN
  UPDATE expert_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expert_msg_touch ON expert_messages;
CREATE TRIGGER trg_expert_msg_touch
  AFTER INSERT ON expert_messages
  FOR EACH ROW EXECUTE FUNCTION touch_expert_conv_updated_at();
