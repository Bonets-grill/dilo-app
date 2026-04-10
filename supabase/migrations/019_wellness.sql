-- ============================================
-- WELLNESS / EMOTIONAL WELLBEING MODULE
-- ============================================

-- Mood check-in log
CREATE TABLE IF NOT EXISTS mood_log (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  time_of_day TEXT CHECK (time_of_day IN ('morning','afternoon','evening','night')),
  mood_score INT NOT NULL CHECK (mood_score BETWEEN 1 AND 10),
  emotions   TEXT[] DEFAULT '{}',
  note       TEXT,
  activities TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mood_log_user_date ON mood_log(user_id, date);

-- Wellness exercise completions
CREATE TABLE IF NOT EXISTS wellness_exercises (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_type   TEXT NOT NULL,
  module_name     TEXT NOT NULL,
  duration_seconds INT DEFAULT 0,
  data            JSONB DEFAULT '{}',
  mood_before     INT CHECK (mood_before BETWEEN 1 AND 10),
  mood_after      INT CHECK (mood_after BETWEEN 1 AND 10),
  completed_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wellness_ex_user_completed ON wellness_exercises(user_id, completed_at);

-- Wellness aggregated stats (one row per user)
CREATE TABLE IF NOT EXISTS wellness_stats (
  user_id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_exercises        INT DEFAULT 0,
  total_journal_entries  INT DEFAULT 0,
  total_breathing_minutes NUMERIC(10,1) DEFAULT 0,
  total_meditation_minutes NUMERIC(10,1) DEFAULT 0,
  current_streak_days    INT DEFAULT 0,
  longest_streak_days    INT DEFAULT 0,
  last_activity_date     DATE,
  avg_mood_7d            NUMERIC(3,1),
  avg_mood_30d           NUMERIC(3,1),
  mood_trend             TEXT CHECK (mood_trend IN ('improving','stable','declining')),
  most_helpful_exercise  TEXT,
  updated_at             TIMESTAMPTZ DEFAULT now()
);
