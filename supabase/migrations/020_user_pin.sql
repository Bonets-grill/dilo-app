-- User PIN for quick login (hashed, not plaintext)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;
