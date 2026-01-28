-- Migration 015: Fix Users Table RLS Policies
-- Uses a SECURITY DEFINER function to check roles without recursion

-- ============================================================================
-- STEP 1: Create helper function to check if current user is super_admin
-- This function uses SECURITY DEFINER to bypass RLS when checking roles
-- ============================================================================

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = auth.uid()
    AND role = 'super_admin'
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;

-- ============================================================================
-- STEP 2: Create helper function to get current user's org_id
-- ============================================================================

CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT org_id FROM users
  WHERE auth_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_my_org_id() TO authenticated;

-- ============================================================================
-- STEP 3: Enable RLS and drop old policies
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing user policies
DROP POLICY IF EXISTS "Users read own" ON users;
DROP POLICY IF EXISTS "Users update own" ON users;
DROP POLICY IF EXISTS "Service role all" ON users;
DROP POLICY IF EXISTS "Users can read own record" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can view own row" ON users;
DROP POLICY IF EXISTS "Users can update own row" ON users;
DROP POLICY IF EXISTS "Users can read all users" ON users;
DROP POLICY IF EXISTS "Super admins can manage users" ON users;
DROP POLICY IF EXISTS "Super admins can read all" ON users;
DROP POLICY IF EXISTS "Super admins full access to users" ON users;
DROP POLICY IF EXISTS "Org admins can read org users" ON users;
DROP POLICY IF EXISTS "Org admins can manage org users" ON users;
DROP POLICY IF EXISTS "Service role full access to users" ON users;
DROP POLICY IF EXISTS "super_admin_all_users" ON users;
DROP POLICY IF EXISTS "Anon can read users for auth" ON users;

-- ============================================================================
-- STEP 4: Create new policies using helper functions
-- ============================================================================

-- 1. Any authenticated user can SELECT their own record (for login)
CREATE POLICY "users_select_own" ON users
  FOR SELECT
  TO authenticated
  USING (auth_id = auth.uid());

-- 2. Super admins can SELECT all users (uses helper function - no recursion)
CREATE POLICY "users_select_super_admin" ON users
  FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- 3. Super admins can INSERT/UPDATE/DELETE any user
CREATE POLICY "users_all_super_admin" ON users
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 4. Users can UPDATE their own record
CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- 5. Org admins can SELECT users in their org
CREATE POLICY "users_select_org_admin" ON users
  FOR SELECT
  TO authenticated
  USING (org_id = get_my_org_id());

-- 6. Service role (backend) has full access
CREATE POLICY "users_service_role" ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
