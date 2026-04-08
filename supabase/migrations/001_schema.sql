-- ============================================================
-- DILO — Personal AI Secretary
-- Database Schema v1.0
-- 16 tables + RLS + indexes
-- ============================================================

-- 1. USERS
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  avatar_url TEXT,
  locale TEXT NOT NULL DEFAULT 'es-ES',
  language TEXT GENERATED ALWAYS AS (split_part(locale, '-', 1)) STORED,
  timezone TEXT NOT NULL DEFAULT 'Europe/Madrid',
  currency TEXT NOT NULL DEFAULT 'EUR',
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','premium')),
  daily_messages_used INT DEFAULT 0,
  daily_messages_reset_at TIMESTAMPTZ DEFAULT now(),
  onboarded BOOLEAN DEFAULT false,
  preferences JSONB DEFAULT '{}',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. USER_SKILLS
CREATE TABLE IF NOT EXISTS public.user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  source TEXT DEFAULT 'individual' CHECK (source IN ('individual','pack_comunicacion','pack_productividad','pack_familia','pack_total','admin_grant')),
  stripe_subscription_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','cancelled','past_due','trialing')),
  trial_ends_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(user_id, skill_id)
);

-- 3. SKILL_CATALOG
CREATE TABLE IF NOT EXISTS public.skill_catalog (
  id TEXT PRIMARY KEY,
  name_es TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  name_it TEXT NOT NULL,
  name_de TEXT NOT NULL,
  description_es TEXT,
  description_en TEXT,
  description_fr TEXT,
  description_it TEXT,
  description_de TEXT,
  icon TEXT NOT NULL,
  category TEXT NOT NULL,
  tools TEXT[] NOT NULL,
  price_eur DECIMAL NOT NULL,
  price_usd DECIMAL NOT NULL,
  price_mxn DECIMAL NOT NULL,
  price_cop DECIMAL NOT NULL,
  price_cad DECIMAL NOT NULL,
  stripe_price_id_eur TEXT,
  stripe_price_id_usd TEXT,
  stripe_price_id_mxn TEXT,
  stripe_price_id_cop TEXT,
  stripe_price_id_cad TEXT,
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. SKILL_PACKS
CREATE TABLE IF NOT EXISTS public.skill_packs (
  id TEXT PRIMARY KEY,
  name_es TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  name_it TEXT NOT NULL,
  name_de TEXT NOT NULL,
  description_es TEXT,
  description_en TEXT,
  description_fr TEXT,
  description_it TEXT,
  description_de TEXT,
  skill_ids TEXT[] NOT NULL,
  price_eur DECIMAL NOT NULL,
  price_usd DECIMAL NOT NULL,
  price_mxn DECIMAL NOT NULL,
  price_cop DECIMAL NOT NULL,
  price_cad DECIMAL NOT NULL,
  stripe_price_id_eur TEXT,
  stripe_price_id_usd TEXT,
  stripe_price_id_mxn TEXT,
  stripe_price_id_cop TEXT,
  stripe_price_id_cad TEXT,
  discount_percent INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. CHANNELS
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('whatsapp','telegram')),
  instance_id TEXT,
  instance_name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('disconnected','connecting','connected')),
  qr_code TEXT,
  connected_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, type)
);

-- 6. CONVERSATIONS
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT,
  pinned BOOLEAN DEFAULT false,
  message_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id),
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT NOT NULL,
  tool_name TEXT,
  tool_input JSONB,
  tool_result JSONB,
  skill_id TEXT,
  model TEXT,
  tokens_input INT,
  tokens_output INT,
  latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. CONTACTS
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phone TEXT,
  name TEXT,
  whatsapp_jid TEXT,
  telegram_id TEXT,
  alias TEXT,
  tags TEXT[],
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, phone)
);

-- 9. REMINDERS
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  repeat_type TEXT CHECK (repeat_type IN ('once','daily','weekly','monthly')),
  repeat_count INT DEFAULT 1,
  repeats_sent INT DEFAULT 0,
  channel TEXT DEFAULT 'push' CHECK (channel IN ('push','whatsapp','telegram')),
  target_phone TEXT,
  target_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount DECIMAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  category TEXT NOT NULL,
  description TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. BUDGETS
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  amount DECIMAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  UNIQUE(user_id, month)
);

-- 12. LISTS
CREATE TABLE IF NOT EXISTS public.lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'checklist' CHECK (type IN ('checklist','notes')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. LIST_ITEMS
CREATE TABLE IF NOT EXISTS public.list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  checked BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0
);

-- 14. MESSAGE_QUEUE
CREATE TABLE IF NOT EXISTS public.message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp','telegram')),
  target_phone TEXT NOT NULL,
  target_name TEXT,
  content TEXT NOT NULL,
  media_url TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  sent_at TIMESTAMPTZ,
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. PUSH_SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys JSONB NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(endpoint)
);

-- 16. ANALYTICS_EVENTS
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  skill_id TEXT,
  locale TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_skills_active ON public.user_skills(user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_channels_user ON public.channels(user_id, type);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON public.reminders(due_at, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON public.expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_mqueue_scheduled ON public.message_queue(scheduled_at, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_analytics_type ON public.analytics_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_lists_user ON public.lists(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Public read for catalog
ALTER TABLE public.skill_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_packs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users only see their own data
DO $$ BEGIN
  CREATE POLICY users_own ON public.users FOR ALL USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY user_skills_own ON public.user_skills FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY channels_own ON public.channels FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY conversations_own ON public.conversations FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY messages_own ON public.messages FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY contacts_own ON public.contacts FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY reminders_own ON public.reminders FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY expenses_own ON public.expenses FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY budgets_own ON public.budgets FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY lists_own ON public.lists FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY list_items_own ON public.list_items FOR ALL USING (
    list_id IN (SELECT id FROM public.lists WHERE user_id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mqueue_own ON public.message_queue FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY push_subs_own ON public.push_subscriptions FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY analytics_insert ON public.analytics_events FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY analytics_read ON public.analytics_events FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Catalog/Packs: public read, no public write
DO $$ BEGIN
  CREATE POLICY catalog_read ON public.skill_catalog FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY packs_read ON public.skill_packs FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
