-- ============================================
-- Apodos privados de contactos
-- WhatsApp/Baileys no puede leer la agenda del móvil del usuario, solo ve
-- los pushNames de los perfiles. Esta tabla permite al usuario guardar sus
-- propios apodos para que 'mándale a Macho B' funcione aunque en WhatsApp
-- esa persona se llame 'Elenita Macho'.
-- ============================================

CREATE TABLE IF NOT EXISTS public.contact_nicknames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  phone TEXT NOT NULL,             -- dígitos sin +
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, nickname)
);

CREATE INDEX IF NOT EXISTS idx_contact_nicknames_user ON public.contact_nicknames(user_id);
-- búsqueda rápida por apodo lowercase (para matching en search_contacts)
CREATE INDEX IF NOT EXISTS idx_contact_nicknames_lower ON public.contact_nicknames(user_id, lower(nickname));

ALTER TABLE public.contact_nicknames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nicknames_own" ON public.contact_nicknames
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
