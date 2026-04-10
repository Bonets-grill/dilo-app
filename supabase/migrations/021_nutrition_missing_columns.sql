-- Add missing columns to nutrition_profiles
ALTER TABLE public.nutrition_profiles
  ADD COLUMN IF NOT EXISTS disliked_foods TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intolerances TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS other_conditions TEXT;
