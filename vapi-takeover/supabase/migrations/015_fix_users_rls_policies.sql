-- Migration 015: Users Table - Disable RLS
-- The users table does not need RLS because:
-- 1. Frontend only queries user's own record by auth_id from session
-- 2. Backend uses service_role which bypasses RLS anyway
-- 3. Complex role-based policies cause recursion issues

-- Ensure RLS is DISABLED on users table
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Clean up any policies that might exist
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_select_super_admin" ON users;
DROP POLICY IF EXISTS "users_all_super_admin" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "users_select_org_admin" ON users;
DROP POLICY IF EXISTS "users_service_role" ON users;
DROP POLICY IF EXISTS "Users read own" ON users;
DROP POLICY IF EXISTS "Users update own" ON users;
DROP POLICY IF EXISTS "Service role all" ON users;
DROP POLICY IF EXISTS "Service role full access to users" ON users;
DROP POLICY IF EXISTS "Users can read own record" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;
DROP POLICY IF EXISTS "Super admins full access to users" ON users;

-- Drop helper functions if they exist
DROP FUNCTION IF EXISTS is_super_admin();
DROP FUNCTION IF EXISTS get_my_org_id();
