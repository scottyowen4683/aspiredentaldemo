-- Migration 015: Fix Users Table RLS Policies (Simplified)
-- Keep it simple to avoid recursive policy issues

-- Re-enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing user policies to start fresh
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
-- SIMPLE POLICIES - No recursive subqueries
-- ============================================================================

-- 1. Any authenticated user can read their own record (for login flow)
--    This is the critical one - uses auth_id directly, no subquery
CREATE POLICY "Users read own" ON users
  FOR SELECT
  TO authenticated
  USING (auth_id = auth.uid());

-- 2. Any authenticated user can update their own record
CREATE POLICY "Users update own" ON users
  FOR UPDATE
  TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- 3. Service role (backend API) has full access - handles all admin operations
CREATE POLICY "Service role all" ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- NOTE: Super admin and org admin operations should go through the backend API
-- which uses service_role. This avoids recursive policy issues.
