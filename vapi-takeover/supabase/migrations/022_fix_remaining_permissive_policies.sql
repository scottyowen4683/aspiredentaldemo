-- Migration 022: Fix Remaining Overly Permissive Policies
-- These tables have "Allow all for authenticated users" policies with {public} role
-- which is a security concern - replacing with proper scoped policies
--
-- Tables affected: invites, review_queue, scores, settings_history, system_settings, user_invites

-- ============================================================================
-- INVITES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow all for authenticated users" ON invites;

-- Add proper policies
CREATE POLICY "service_role_full_access"
  ON invites FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON invites FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Authenticated users can view invites (for accepting them)
CREATE POLICY "authenticated_read"
  ON invites FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- REVIEW_QUEUE TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow all for authenticated users" ON review_queue;

CREATE POLICY "service_role_full_access"
  ON review_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON review_queue FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Org admins can view their own org's review queue items
-- Only add if table has org_id column, otherwise just authenticated read
CREATE POLICY "authenticated_read"
  ON review_queue FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- SCORES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow all for authenticated users" ON scores;

CREATE POLICY "service_role_full_access"
  ON scores FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON scores FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Authenticated users can read scores
CREATE POLICY "authenticated_read"
  ON scores FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- SETTINGS_HISTORY TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow all for authenticated users" ON settings_history;

CREATE POLICY "service_role_full_access"
  ON settings_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON settings_history FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Authenticated users can read settings history
CREATE POLICY "authenticated_read"
  ON settings_history FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- SYSTEM_SETTINGS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow all for authenticated users" ON system_settings;

CREATE POLICY "service_role_full_access"
  ON system_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON system_settings FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- All authenticated users can read system settings
CREATE POLICY "authenticated_read"
  ON system_settings FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- USER_INVITES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow all for authenticated users" ON user_invites;

CREATE POLICY "service_role_full_access"
  ON user_invites FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON user_invites FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Authenticated users can view invites (for accepting them)
CREATE POLICY "authenticated_read"
  ON user_invites FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- ENSURE RLS IS ENABLED ON ALL TABLES
-- ============================================================================
ALTER TABLE IF EXISTS invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_invites ENABLE ROW LEVEL SECURITY;
