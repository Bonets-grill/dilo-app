-- ============================================
-- Enable RLS on all tables missing it (auditia findings 2026-04-15)
-- 22 tables across: marketplace, referrals, trading, calls, system logs.
-- Policy strategy:
--   A) Per-user (user_id): auth.uid() = user_id
--   B) Two-party (sender+recipient): auth.uid() matches either role
--   C) Marketplace listings: owner writes, all authenticated read
--   D) System/shared reference: all authenticated read, only service_role writes
-- ============================================

-- ========== A) PER-USER TABLES ==========

-- market_likes (user_id)
ALTER TABLE market_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_likes_all_own" ON market_likes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- market_seller_stats (user_id PK)
ALTER TABLE market_seller_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_seller_stats_select_any" ON market_seller_stats FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "market_seller_stats_write_own" ON market_seller_stats FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- trade_journal (user_id)
ALTER TABLE trade_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_journal_all_own" ON trade_journal FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- trade_snapshots (user_id)
ALTER TABLE trade_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trade_snapshots_all_own" ON trade_snapshots FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- trading_analytics (user_id)
ALTER TABLE trading_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trading_analytics_all_own" ON trading_analytics FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- trading_emotional_state (user_id)
ALTER TABLE trading_emotional_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trading_emotional_state_all_own" ON trading_emotional_state FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- trading_knowledge (no user_id — system-wide aggregate knowledge)
ALTER TABLE trading_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trading_knowledge_read_authenticated" ON trading_knowledge FOR SELECT
  USING (auth.role() = 'authenticated');

-- trading_profiles (user_id)
ALTER TABLE trading_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trading_profiles_all_own" ON trading_profiles FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- trading_rules (user_id)
ALTER TABLE trading_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trading_rules_all_own" ON trading_rules FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- trading_session_metrics (user_id — NULL = system signals)
ALTER TABLE trading_session_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trading_session_metrics_select_own_or_public" ON trading_session_metrics FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "trading_session_metrics_write_own" ON trading_session_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trading_session_metrics_update_own" ON trading_session_metrics FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- trading_signal_log (user_id — may be NULL for system signals)
ALTER TABLE trading_signal_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trading_signal_log_select_own_or_public" ON trading_signal_log FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "trading_signal_log_write_own" ON trading_signal_log FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ========== B) TWO-PARTY TABLES ==========

-- call_log (caller_id + callee_id)
ALTER TABLE call_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_log_select_participants" ON call_log FOR SELECT
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);
CREATE POLICY "call_log_insert_caller" ON call_log FOR INSERT
  WITH CHECK (auth.uid() = caller_id);
CREATE POLICY "call_log_update_participants" ON call_log FOR UPDATE
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

-- market_offers (buyer_id + seller_id)
ALTER TABLE market_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_offers_select_participants" ON market_offers FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "market_offers_insert_buyer" ON market_offers FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "market_offers_update_participants" ON market_offers FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- market_reviews (reviewer_id + seller_id; reviews are public for authenticated)
ALTER TABLE market_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_reviews_select_all_authenticated" ON market_reviews FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "market_reviews_insert_reviewer" ON market_reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);
CREATE POLICY "market_reviews_update_reviewer" ON market_reviews FOR UPDATE
  USING (auth.uid() = reviewer_id) WITH CHECK (auth.uid() = reviewer_id);
CREATE POLICY "market_reviews_delete_reviewer" ON market_reviews FOR DELETE
  USING (auth.uid() = reviewer_id);

-- ========== C) MARKETPLACE LISTINGS ==========

-- market_listings: seller owns, all authenticated can browse
ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_listings_select_all_authenticated" ON market_listings FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "market_listings_insert_seller" ON market_listings FOR INSERT
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "market_listings_update_seller" ON market_listings FOR UPDATE
  USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "market_listings_delete_seller" ON market_listings FOR DELETE
  USING (auth.uid() = seller_id);

-- referrals (referrer_id — owner is the person who referred)
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals_select_own" ON referrals FOR SELECT
  USING (auth.uid() = referrer_id);
CREATE POLICY "referrals_insert_own" ON referrals FOR INSERT
  WITH CHECK (auth.uid() = referrer_id);
CREATE POLICY "referrals_update_own" ON referrals FOR UPDATE
  USING (auth.uid() = referrer_id) WITH CHECK (auth.uid() = referrer_id);

-- referral_events (new_user_id)
ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referral_events_select_own" ON referral_events FOR SELECT
  USING (auth.uid() = new_user_id);

-- ========== D) SYSTEM / SHARED REFERENCE DATA ==========
-- Authenticated users can READ; only service_role can WRITE (no INSERT/UPDATE/DELETE policies).

-- cron_logs: operational logs, readable only by service_role (no policy for authenticated = blocked)
ALTER TABLE cron_logs ENABLE ROW LEVEL SECURITY;
-- intentionally no policies: only service_role key (which bypasses RLS) can access

-- symbol_profiles: shared market reference data — all authenticated can read
ALTER TABLE symbol_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "symbol_profiles_read_authenticated" ON symbol_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- trading_insights: weekly aggregate insights — all authenticated can read
ALTER TABLE trading_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trading_insights_read_authenticated" ON trading_insights FOR SELECT
  USING (auth.role() = 'authenticated');

-- trading_patterns: aggregate stats — all authenticated can read
ALTER TABLE trading_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trading_patterns_read_authenticated" ON trading_patterns FOR SELECT
  USING (auth.role() = 'authenticated');

-- trading_learning_stats: daily aggregate — all authenticated can read
ALTER TABLE trading_learning_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trading_learning_stats_read_authenticated" ON trading_learning_stats FOR SELECT
  USING (auth.role() = 'authenticated');
