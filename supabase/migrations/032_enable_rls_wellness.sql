-- ============================================
-- Enable Row Level Security on wellness tables
-- Found by auditia — 019_wellness.sql created these tables without RLS.
-- ============================================

-- mood_log: one row per user check-in
ALTER TABLE mood_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mood_log_select_own"
  ON mood_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "mood_log_insert_own"
  ON mood_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mood_log_update_own"
  ON mood_log FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mood_log_delete_own"
  ON mood_log FOR DELETE
  USING (auth.uid() = user_id);

-- wellness_exercises: one row per completed exercise
ALTER TABLE wellness_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wellness_exercises_select_own"
  ON wellness_exercises FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "wellness_exercises_insert_own"
  ON wellness_exercises FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wellness_exercises_update_own"
  ON wellness_exercises FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wellness_exercises_delete_own"
  ON wellness_exercises FOR DELETE
  USING (auth.uid() = user_id);

-- wellness_stats: one row per user (PK is user_id)
ALTER TABLE wellness_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wellness_stats_select_own"
  ON wellness_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "wellness_stats_insert_own"
  ON wellness_stats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wellness_stats_update_own"
  ON wellness_stats FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wellness_stats_delete_own"
  ON wellness_stats FOR DELETE
  USING (auth.uid() = user_id);
