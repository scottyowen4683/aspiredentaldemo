-- Migration 020: Fix Superuser RLS Security
-- Addresses critical security issues for government platform:
-- 1. FIX: RLS circular dependency on users table (super_admin can't read own role)
-- 2. FIX: Security definer views need security_invoker = true
-- 3. ENSURE: RLS is properly enabled on users table
-- 4. ADD: Proper service role bypass policies

-- ============================================================================
-- PART 1: CREATE SECURITY DEFINER FUNCTION TO CHECK SUPER ADMIN STATUS
-- ============================================================================
-- This function bypasses RLS to check if current user is super_admin
-- This solves the chicken-and-egg problem where RLS policies need to
-- query users table but can't because of RLS
-- NOTE: Functions are in 'public' schema since 'auth' is managed by Supabase

DROP FUNCTION IF EXISTS public.is_super_admin();
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id = auth.uid()
    AND role = 'super_admin'
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO service_role;

COMMENT ON FUNCTION public.is_super_admin() IS 'Securely checks if current user is super_admin (bypasses RLS to prevent circular dependency)';

-- ============================================================================
-- PART 2: CREATE FUNCTION TO GET CURRENT USER ORG_ID
-- ============================================================================
-- This allows RLS policies to efficiently get the current user's org

DROP FUNCTION IF EXISTS public.current_user_org_id();
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT org_id FROM public.users
  WHERE auth_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO anon;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO service_role;

COMMENT ON FUNCTION public.current_user_org_id() IS 'Returns the org_id of the current authenticated user (bypasses RLS)';

-- ============================================================================
-- PART 3: CREATE FUNCTION TO GET CURRENT USER ROLE
-- ============================================================================

DROP FUNCTION IF EXISTS public.current_user_role();
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role::TEXT FROM public.users
  WHERE auth_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO service_role;

COMMENT ON FUNCTION public.current_user_role() IS 'Returns the role of the current authenticated user (bypasses RLS)';

-- ============================================================================
-- PART 4: ENSURE RLS IS ENABLED ON USERS TABLE
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: DROP OLD PROBLEMATIC POLICIES ON USERS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "super_admin_all" ON users;
DROP POLICY IF EXISTS "super_admin_all_users" ON users;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own row" ON users;
DROP POLICY IF EXISTS "Users can view own row" ON users;
DROP POLICY IF EXISTS "Users can read all users" ON users;
DROP POLICY IF EXISTS "Super admins can manage users" ON users;
DROP POLICY IF EXISTS "Super admins can read all" ON users;
DROP POLICY IF EXISTS "Anon can read users for auth" ON users;
DROP POLICY IF EXISTS "Service role full access to users" ON users;

-- ============================================================================
-- PART 6: CREATE NEW SECURE RLS POLICIES FOR USERS TABLE
-- ============================================================================

-- Service role has full access (for backend operations)
CREATE POLICY "service_role_full_access"
  ON users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Super admins can access all users (using the secure function)
CREATE POLICY "super_admin_all_access"
  ON users FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Users can read their own row (self-lookup)
CREATE POLICY "users_read_own"
  ON users FOR SELECT
  TO authenticated
  USING (auth_id = auth.uid());

-- Users can update their own row (limited fields would be enforced at app level)
CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Org admins can view users in their organization
CREATE POLICY "org_admin_view_org_users"
  ON users FOR SELECT
  TO authenticated
  USING (
    current_user_role() = 'org_admin'
    AND org_id = current_user_org_id()
  );

-- ============================================================================
-- PART 7: UPDATE OTHER TABLE POLICIES TO USE SECURE FUNCTIONS
-- ============================================================================

-- Organizations policies
DROP POLICY IF EXISTS "super_admin_all" ON organizations;
DROP POLICY IF EXISTS "org_admin_own_org" ON organizations;
DROP POLICY IF EXISTS "Service role full access to organizations" ON organizations;

CREATE POLICY "service_role_full_access"
  ON organizations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON organizations FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_view_own_org"
  ON organizations FOR SELECT
  TO authenticated
  USING (id = current_user_org_id());

-- ============================================================================
-- PART 8: FIX SECURITY DEFINER VIEWS
-- ============================================================================

-- Drop and recreate v_assistant_integrations with security_invoker
DROP VIEW IF EXISTS v_assistant_integrations;

CREATE VIEW v_assistant_integrations
WITH (security_invoker = true)
AS
SELECT
  a.id AS assistant_id,
  a.friendly_name AS assistant_name,
  a.org_id,
  oi.id AS integration_id,
  oi.name AS integration_name,
  oi.provider,
  oi.direction,
  oi.status,
  oi.use_case,
  COALESCE(iaa.event_triggers_override, oi.event_triggers) AS event_triggers,
  COALESCE(iaa.settings_override, '{}') AS settings_override,
  COALESCE(iaa.enabled, true) AS enabled,
  oi.base_url,
  oi.last_sync_at,
  oi.last_sync_status
FROM assistants a
LEFT JOIN integration_assistant_assignments iaa ON iaa.assistant_id = a.id
LEFT JOIN organization_integrations oi ON (
  oi.id = iaa.integration_id
  OR (oi.org_id = a.org_id AND oi.assistant_id IS NULL AND iaa.id IS NULL)
)
WHERE oi.id IS NOT NULL AND oi.status = 'active';

-- Grant permissions on view
GRANT SELECT ON v_assistant_integrations TO authenticated;
GRANT SELECT ON v_assistant_integrations TO service_role;

-- Drop and recreate v_assistant_integration_status with security_invoker
DROP VIEW IF EXISTS v_assistant_integration_status;

CREATE VIEW v_assistant_integration_status
WITH (security_invoker = true)
AS
SELECT
  a.id AS assistant_id,
  a.friendly_name AS assistant_name,
  a.org_id,
  o.name AS org_name,
  a.integrations_enabled,
  COALESCE((a.integration_settings->>'useOrgDefaults')::boolean, true) AS use_org_defaults,
  COALESCE((a.integration_settings->>'overrideOrgSettings')::boolean, false) AS override_org_settings,
  (
    SELECT COUNT(*)
    FROM organization_integrations oi
    WHERE oi.assistant_id = a.id AND oi.status = 'active'
  ) AS assistant_specific_integrations,
  (
    SELECT COUNT(*)
    FROM organization_integrations oi
    WHERE oi.org_id = a.org_id AND oi.assistant_id IS NULL AND oi.status = 'active'
  ) AS org_wide_integrations,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'id', oi.id,
      'name', oi.name,
      'provider', oi.provider,
      'use_case', oi.use_case,
      'is_assistant_specific', oi.assistant_id IS NOT NULL
    ))
    FROM organization_integrations oi
    WHERE (oi.assistant_id = a.id OR (oi.org_id = a.org_id AND oi.assistant_id IS NULL))
      AND oi.status = 'active'
  ) AS available_integrations
FROM assistants a
LEFT JOIN organizations o ON o.id = a.org_id
WHERE a.active = true;

-- Grant permissions on view
GRANT SELECT ON v_assistant_integration_status TO authenticated;
GRANT SELECT ON v_assistant_integration_status TO service_role;

-- ============================================================================
-- PART 9: UPDATE OTHER TABLES TO USE SECURE FUNCTIONS
-- ============================================================================

-- Update assistants policies
DROP POLICY IF EXISTS "super_admin_all" ON assistants;
DROP POLICY IF EXISTS "org_admin_own_org" ON assistants;
DROP POLICY IF EXISTS "Service role full access to assistants" ON assistants;

CREATE POLICY "service_role_full_access"
  ON assistants FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON assistants FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_manage_own"
  ON assistants FOR ALL
  TO authenticated
  USING (org_id = current_user_org_id())
  WITH CHECK (org_id = current_user_org_id());

-- Allow anonymous access to pilot-enabled assistants (for public demo pages)
CREATE POLICY "anon_view_pilot_assistants"
  ON assistants FOR SELECT
  TO anon
  USING (pilot_enabled = true AND active = true);

-- Update conversations policies
DROP POLICY IF EXISTS "super_admin_all" ON conversations;
DROP POLICY IF EXISTS "org_admin_own_org" ON conversations;
DROP POLICY IF EXISTS "Service role full access to conversations" ON conversations;

CREATE POLICY "service_role_full_access"
  ON conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON conversations FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_view_own"
  ON conversations FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id());

-- Update conversation_messages policies
DROP POLICY IF EXISTS "super_admin_all" ON conversation_messages;
DROP POLICY IF EXISTS "org_admin_own_org" ON conversation_messages;
DROP POLICY IF EXISTS "Service role full access to conversation_messages" ON conversation_messages;

CREATE POLICY "service_role_full_access"
  ON conversation_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON conversation_messages FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_view_own"
  ON conversation_messages FOR SELECT
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM conversations
      WHERE org_id = current_user_org_id()
    )
  );

-- Update knowledge_chunks policies
DROP POLICY IF EXISTS "super_admin_all" ON knowledge_chunks;
DROP POLICY IF EXISTS "org_admin_own_org" ON knowledge_chunks;
DROP POLICY IF EXISTS "Service role full access to knowledge_chunks" ON knowledge_chunks;

CREATE POLICY "service_role_full_access"
  ON knowledge_chunks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON knowledge_chunks FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_manage_own"
  ON knowledge_chunks FOR ALL
  TO authenticated
  USING (org_id = current_user_org_id())
  WITH CHECK (org_id = current_user_org_id());

-- Update cost_usage policies
DROP POLICY IF EXISTS "super_admin_all" ON cost_usage;
DROP POLICY IF EXISTS "org_admin_own_org" ON cost_usage;
DROP POLICY IF EXISTS "Service role full access to cost_usage" ON cost_usage;

CREATE POLICY "service_role_full_access"
  ON cost_usage FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON cost_usage FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_view_own"
  ON cost_usage FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id());

-- Update audit_logs policies
DROP POLICY IF EXISTS "super_admin_all" ON audit_logs;
DROP POLICY IF EXISTS "Service role full access to audit_logs" ON audit_logs;

CREATE POLICY "service_role_full_access"
  ON audit_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON audit_logs FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_view_own"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id());

-- ============================================================================
-- PART 10: UPDATE INTEGRATION TABLES TO USE SECURE FUNCTIONS
-- ============================================================================

-- organization_integrations
DROP POLICY IF EXISTS "Super admins can access all organization_integrations" ON organization_integrations;
DROP POLICY IF EXISTS "Org admins can manage own organization_integrations" ON organization_integrations;
DROP POLICY IF EXISTS "Service role full access to organization_integrations" ON organization_integrations;

CREATE POLICY "service_role_full_access"
  ON organization_integrations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON organization_integrations FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_manage_own"
  ON organization_integrations FOR ALL
  TO authenticated
  USING (org_id = current_user_org_id())
  WITH CHECK (org_id = current_user_org_id());

-- integration_sync_logs
DROP POLICY IF EXISTS "Super admins can access all integration_sync_logs" ON integration_sync_logs;
DROP POLICY IF EXISTS "Org admins can view own integration_sync_logs" ON integration_sync_logs;
DROP POLICY IF EXISTS "Service role full access to integration_sync_logs" ON integration_sync_logs;

CREATE POLICY "service_role_full_access"
  ON integration_sync_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON integration_sync_logs FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_view_own"
  ON integration_sync_logs FOR SELECT
  TO authenticated
  USING (
    integration_id IN (
      SELECT id FROM organization_integrations
      WHERE org_id = current_user_org_id()
    )
  );

-- integration_event_queue
DROP POLICY IF EXISTS "Super admins can access all integration_event_queue" ON integration_event_queue;
DROP POLICY IF EXISTS "Org admins can view own integration_event_queue" ON integration_event_queue;
DROP POLICY IF EXISTS "Service role full access to integration_event_queue" ON integration_event_queue;

CREATE POLICY "service_role_full_access"
  ON integration_event_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON integration_event_queue FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_view_own"
  ON integration_event_queue FOR SELECT
  TO authenticated
  USING (
    integration_id IN (
      SELECT id FROM organization_integrations
      WHERE org_id = current_user_org_id()
    )
  );

-- integration_assistant_assignments
DROP POLICY IF EXISTS "super_admin_all" ON integration_assistant_assignments;
DROP POLICY IF EXISTS "org_admin_own_org" ON integration_assistant_assignments;

CREATE POLICY "service_role_full_access"
  ON integration_assistant_assignments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON integration_assistant_assignments FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_manage_own"
  ON integration_assistant_assignments FOR ALL
  TO authenticated
  USING (
    integration_id IN (
      SELECT id FROM organization_integrations
      WHERE org_id = current_user_org_id()
    )
  )
  WITH CHECK (
    integration_id IN (
      SELECT id FROM organization_integrations
      WHERE org_id = current_user_org_id()
    )
  );

-- ============================================================================
-- PART 11: UPDATE REMAINING TABLES
-- ============================================================================

-- interaction_logs
DROP POLICY IF EXISTS "Super admins can access all interaction_logs" ON interaction_logs;
DROP POLICY IF EXISTS "Org admins can view own interaction_logs" ON interaction_logs;
DROP POLICY IF EXISTS "Service role full access to interaction_logs" ON interaction_logs;

CREATE POLICY "service_role_full_access"
  ON interaction_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON interaction_logs FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_view_own"
  ON interaction_logs FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id());

-- outbound_campaigns
DROP POLICY IF EXISTS "Super admins can access all outbound_campaigns" ON outbound_campaigns;
DROP POLICY IF EXISTS "Org admins can manage own outbound_campaigns" ON outbound_campaigns;
DROP POLICY IF EXISTS "Service role full access to outbound_campaigns" ON outbound_campaigns;

CREATE POLICY "service_role_full_access"
  ON outbound_campaigns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON outbound_campaigns FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_manage_own"
  ON outbound_campaigns FOR ALL
  TO authenticated
  USING (org_id = current_user_org_id())
  WITH CHECK (org_id = current_user_org_id());

-- campaign_contacts
DROP POLICY IF EXISTS "Super admins can access all campaign_contacts" ON campaign_contacts;
DROP POLICY IF EXISTS "Org admins can manage own campaign_contacts" ON campaign_contacts;
DROP POLICY IF EXISTS "Service role full access to campaign_contacts" ON campaign_contacts;

CREATE POLICY "service_role_full_access"
  ON campaign_contacts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON campaign_contacts FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_manage_own"
  ON campaign_contacts FOR ALL
  TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM outbound_campaigns
      WHERE org_id = current_user_org_id()
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM outbound_campaigns
      WHERE org_id = current_user_org_id()
    )
  );

-- contact_requests
DROP POLICY IF EXISTS "Super admins can access all contact_requests" ON contact_requests;
DROP POLICY IF EXISTS "Org admins can view own contact_requests" ON contact_requests;
DROP POLICY IF EXISTS "Service role full access to contact_requests" ON contact_requests;

CREATE POLICY "service_role_full_access"
  ON contact_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "super_admin_all_access"
  ON contact_requests FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "org_admin_view_own"
  ON contact_requests FOR SELECT
  TO authenticated
  USING (org_id = current_user_org_id());

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "service_role_full_access" ON users IS 'Backend services using service_role key bypass RLS';
COMMENT ON POLICY "super_admin_all_access" ON users IS 'Super admins can access all users using secure function';
COMMENT ON POLICY "users_read_own" ON users IS 'Users can read their own record';
COMMENT ON POLICY "users_update_own" ON users IS 'Users can update their own record';
COMMENT ON POLICY "org_admin_view_org_users" ON users IS 'Org admins can view users in their organization';

-- ============================================================================
-- VERIFICATION QUERIES (Run these to verify the fix)
-- ============================================================================
-- After applying this migration, run these queries to verify:
--
-- 1. Check that the functions exist:
--    SELECT is_super_admin();
--    SELECT current_user_org_id();
--    SELECT current_user_role();
--
-- 2. Check that RLS is enabled:
--    SELECT tablename, rowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public' AND tablename = 'users';
--
-- 3. Check policies on users table:
--    SELECT policyname, permissive, roles, cmd
--    FROM pg_policies
--    WHERE tablename = 'users';
--
-- 4. Test super admin access (as authenticated user):
--    SELECT * FROM users LIMIT 1;
