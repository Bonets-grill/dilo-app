-- ══════════════════════════════════════
-- DILO Nutrition Module
-- ══════════════════════════════════════

-- Nutrition profiles (one per user)
CREATE TABLE IF NOT EXISTS nutrition_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  age INTEGER NOT NULL CHECK (age >= 13 AND age <= 120),
  weight_kg NUMERIC(5,1) NOT NULL CHECK (weight_kg >= 30 AND weight_kg <= 300),
  height_cm NUMERIC(5,1) NOT NULL CHECK (height_cm >= 100 AND height_cm <= 250),
  sex TEXT NOT NULL CHECK (sex IN ('male', 'female')),
  activity_level TEXT NOT NULL CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal TEXT NOT NULL CHECK (goal IN ('lose', 'maintain', 'gain')),
  diet_type TEXT NOT NULL DEFAULT 'balanced' CHECK (diet_type IN ('balanced', 'keto', 'vegetarian', 'vegan', 'mediterranean', 'paleo', 'pescatarian')),
  allergies TEXT[] DEFAULT '{}',
  medical_conditions TEXT[] DEFAULT '{}',
  weekly_target_kg NUMERIC(3,2) DEFAULT 0.5 CHECK (weekly_target_kg >= 0 AND weekly_target_kg <= 1.0),
  bmr NUMERIC(7,1),
  tdee NUMERIC(7,1),
  target_calories INTEGER CHECK (target_calories >= 1200),
  target_protein_g INTEGER,
  target_carbs_g INTEGER,
  target_fat_g INTEGER,
  target_fiber_g INTEGER DEFAULT 25,
  target_water_ml INTEGER DEFAULT 2500,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX idx_nutrition_profiles_user ON nutrition_profiles(user_id);
CREATE INDEX idx_nutrition_profiles_active ON nutrition_profiles(active) WHERE active = true;

-- Nutrition log (food entries)
CREATE TABLE IF NOT EXISTS nutrition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  food_name TEXT NOT NULL,
  quantity_g NUMERIC(7,1),
  calories INTEGER NOT NULL CHECK (calories >= 0 AND calories <= 5000),
  protein_g NUMERIC(5,1) DEFAULT 0,
  carbs_g NUMERIC(5,1) DEFAULT 0,
  fat_g NUMERIC(5,1) DEFAULT 0,
  fiber_g NUMERIC(5,1) DEFAULT 0,
  photo_url TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'photo', 'plan', 'barcode')),
  logged_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_nutrition_log_user_date ON nutrition_log(user_id, logged_at DESC);

-- Meal plans
CREATE TABLE IF NOT EXISTS meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  plan JSONB NOT NULL,
  shopping_list JSONB,
  total_calories_avg INTEGER,
  adherence_pct NUMERIC(5,1) DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_meal_plans_user_active ON meal_plans(user_id, active) WHERE active = true;
CREATE INDEX idx_meal_plans_user_week ON meal_plans(user_id, week_start DESC);

-- Water log
CREATE TABLE IF NOT EXISTS water_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_ml INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 5000),
  logged_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_water_log_user_date ON water_log(user_id, logged_at DESC);

-- Weight log
CREATE TABLE IF NOT EXISTS weight_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg NUMERIC(5,1) NOT NULL CHECK (weight_kg >= 30 AND weight_kg <= 300),
  body_fat_pct NUMERIC(4,1) CHECK (body_fat_pct >= 3 AND body_fat_pct <= 60),
  notes TEXT,
  logged_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, logged_at)
);

CREATE INDEX idx_weight_log_user_date ON weight_log(user_id, logged_at DESC);

-- RLS policies
ALTER TABLE nutrition_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own nutrition profile" ON nutrition_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own nutrition log" ON nutrition_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own meal plans" ON meal_plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own water log" ON water_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own weight log" ON weight_log FOR ALL USING (auth.uid() = user_id);
