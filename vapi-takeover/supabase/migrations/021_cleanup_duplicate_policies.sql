-- Migration 021: Cleanup Duplicate and Legacy RLS Policies
-- This migration removes old/duplicate policies and optimizes for performance
-- NO DATA IS AFFECTED - only access control rules are cleaned up
--
-- Issues addressed:
-- 1. Remove duplicate policies (e.g., super_admin_all_* vs super_admin_all_access)
-- 2. Remove overly permissive "Allow all for authenticated users" policies
-- 3. Optimize auth.uid() calls with (select auth.uid()) for performance
-- 4. Clean up legacy policy naming

-- ============================================================================
-- PART 1: REMOVE LEGACY POLICIES FROM USERS TABLE
-- ============================================================================

-- These were replaced by migration 020's policies
DROP POLICY IF EXISTS "super_admin_all_users" ON users;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON users;
DROP POLICY IF EXISTS "Anon can read users for auth" ON users;

-- ============================================================================
-- PART 2: REMOVE LEGACY POLICIES FROM ORGANIZATIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "super_admin_all_organizations" ON organizations;
DROP POLICY IF EXISTS "org_admin_own_org_organizations" ON organizations;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON organizations;
DROP POLICY IF EXISTS "Auth read orgs" ON organizations;

-- ============================================================================
-- PART 3: REMOVE LEGACY POLICIES FROM ASSISTANTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "super_admin_all_assistants" ON assistants;
DROP POLICY IF EXISTS "org_admin_own_org_assistants" ON assistants;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON assistants;
DROP POLICY IF EXISTS "Auth read assistants" ON assistants;
DROP POLICY IF EXISTS "Allow public read of pilot assistants" ON assistants;

-- ============================================================================
-- PART 4: REMOVE LEGACY POLICIES FROM CONVERSATIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "super_admin_all_conversations" ON conversations;
DROP POLICY IF EXISTS "org_admin_own_org_conversations" ON conversations;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON conversations;
DROP POLICY IF EXISTS "Auth read convos" ON conversations;

-- ============================================================================
-- PART 5: REMOVE LEGACY POLICIES FROM CONVERSATION_MESSAGES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "super_admin_all_conversation_messages" ON conversation_messages;
DROP POLICY IF EXISTS "org_admin_own_org_conversation_messages" ON conversation_messages;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON conversation_messages;

-- ============================================================================
-- PART 6: REMOVE LEGACY POLICIES FROM COST_USAGE TABLE
-- ============================================================================

DROP POLICY IF EXISTS "super_admin_all_cost_usage" ON cost_usage;
DROP POLICY IF EXISTS "org_admin_own_org_cost_usage" ON cost_usage;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON cost_usage;

-- ============================================================================
-- PART 7: REMOVE LEGACY POLICIES FROM AUDIT_LOGS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "super_admin_all_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON audit_logs;
DROP POLICY IF EXISTS "Auth read audit" ON audit_logs;

-- ============================================================================
-- PART 8: REMOVE LEGACY POLICIES FROM KNOWLEDGE_CHUNKS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Allow all for authenticated users" ON knowledge_chunks;

-- ============================================================================
-- PART 9: REMOVE LEGACY POLICIES FROM INTEGRATION TABLES
-- ============================================================================

-- organization_integrations
DROP POLICY IF EXISTS "super_admin_all" ON organization_integrations;
DROP POLICY IF EXISTS "org_admin_own_org" ON organization_integrations;

-- integration_sync_logs
DROP POLICY IF EXISTS "super_admin_all" ON integration_sync_logs;
DROP POLICY IF EXISTS "org_admin_own_org" ON integration_sync_logs;

-- integration_event_queue
DROP POLICY IF EXISTS "super_admin_all" ON integration_event_queue;
DROP POLICY IF EXISTS "org_admin_own_org" ON integration_event_queue;

-- integration_templates
DROP POLICY IF EXISTS "super_admin_all" ON integration_templates;

-- ============================================================================
-- PART 10: REMOVE LEGACY POLICIES FROM OTHER TABLES
-- ============================================================================

-- chat_session_links
DROP POLICY IF EXISTS "Super admins can manage chat_session_links" ON chat_session_links;

-- Note: user_invites, system_settings, scores, review_queue, invites, settings_history
-- tables may not exist in all deployments - skipping these

-- ============================================================================
-- PART 11: OPTIMIZE EXISTING POLICIES WITH (SELECT auth.uid())
-- Performance optimization: wrap auth.uid() in subquery for single evaluation
-- ============================================================================

-- Drop and recreate optimized policies for users table
DROP POLICY IF EXISTS "users_read_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;

CREATE POLICY "users_read_own"
  ON users FOR SELECT
  TO authenticated
  USING (auth_id = (SELECT auth.uid()));

CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  TO authenticated
  USING (auth_id = (SELECT auth.uid()))
  WITH CHECK (auth_id = (SELECT auth.uid()));

-- ============================================================================
-- PART 12: ADD PROPER POLICIES FOR TABLES THAT NEED THEM
-- ============================================================================

-- Ensure chat_session_links has proper policies
-- Keep public read (it's intentionally public for shared links)
-- Add super admin management
DROP POLICY IF EXISTS "super_admin_manage_chat_links" ON chat_session_links;
CREATE POLICY "super_admin_manage_chat_links"
  ON chat_session_links FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================================
-- PART 13: FIX INTEGRATION_TEMPLATES - PUBLIC READ + SUPER ADMIN MANAGE
-- ============================================================================

DROP POLICY IF EXISTS "public_read" ON integration_templates;
DROP POLICY IF EXISTS "super_admin_manage" ON integration_templates;
DROP POLICY IF EXISTS "service_role_full_access" ON integration_templates;

CREATE POLICY "service_role_full_access"
  ON integration_templates FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public_read"
  ON integration_templates FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "super_admin_manage"
  ON integration_templates FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this migration, the linter warnings should be significantly reduced.
--
-- To verify policies are correct, run:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
