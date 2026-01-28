-- Migration 015: Fix Users Table RLS Policies
-- The users table needs specific policies for the auth flow to work

-- Re-enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop any conflicting policies first
DROP POLICY IF EXISTS "Users can read own record" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;
DROP POLICY IF EXISTS "Anon can read users for auth" ON users;

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

-- 1. Authenticated users can read their own record (needed for login flow)
CREATE POLICY "Users can read own record" ON users
  FOR SELECT
  TO authenticated
  USING (auth_id = auth.uid());

-- 2. Authenticated users can update their own record
CREATE POLICY "Users can update own record" ON users
  FOR UPDATE
  TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- 3. Super admins can do everything on users table
CREATE POLICY "Super admins full access to users" ON users
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

-- 4. Org admins can read users in their org
CREATE POLICY "Org admins can read org users" ON users
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT u.org_id FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role IN ('org_admin', 'super_admin')
    )
  );

-- 5. Org admins can manage users in their org (except themselves and super_admins)
CREATE POLICY "Org admins can manage org users" ON users
  FOR ALL
  TO authenticated
  USING (
    -- Can manage users in my org
    org_id IN (
      SELECT u.org_id FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'org_admin'
    )
    -- But not super_admins
    AND role != 'super_admin'
  )
  WITH CHECK (
    org_id IN (
      SELECT u.org_id FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'org_admin'
    )
    AND role != 'super_admin'
  );

-- 6. Service role (backend) has full access
CREATE POLICY "Service role full access to users" ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
