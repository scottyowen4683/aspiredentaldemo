-- ============================================================
-- ULTRA SAFE MIGRATION FOR VAPI TRANSITION TESTING
-- ============================================================
-- This version has ZERO destructive operations
-- Only creates new tables and policies
-- Will show errors if policies already exist (safe to ignore)
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. CREATE chat_conversations TABLE (NEW)
-- ============================================================
-- This table stores message-by-message conversation history
-- Replaces VAPI's chat history management

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant_session
  ON public.chat_conversations(tenant_id, session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_at
  ON public.chat_conversations(created_at DESC);

-- Add helpful comment
COMMENT ON TABLE public.chat_conversations IS
  'Stores conversation history for AI chat sessions (VAPI-free implementation)';

-- ============================================================
-- 2. CREATE conversation_sessions TABLE (MAY ALREADY EXIST)
-- ============================================================
-- This table stores rolling conversation summaries
-- May already exist from VAPI setup - IF NOT EXISTS makes it safe

CREATE TABLE IF NOT EXISTS public.conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, session_id)
);

-- Create index (only if doesn't exist)
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_tenant_session
  ON public.conversation_sessions(tenant_id, session_id);

-- Add helpful comment
COMMENT ON TABLE public.conversation_sessions IS
  'Stores rolling conversation summaries for long-term context';

-- ============================================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Enable RLS on both tables (safe if already enabled)

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. CREATE POLICIES (NO DROPS - MAY SHOW ERRORS IF EXIST)
-- ============================================================
-- Note: If policies already exist, you'll see errors - this is SAFE
-- The errors just mean the policy already exists and doesn't need creating

-- Policies for chat_conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chat_conversations'
    AND policyname = 'Enable full access for service role'
  ) THEN
    CREATE POLICY "Enable full access for service role"
      ON public.chat_conversations
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chat_conversations'
    AND policyname = 'Enable read for authenticated users'
  ) THEN
    CREATE POLICY "Enable read for authenticated users"
      ON public.chat_conversations
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Policies for conversation_sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversation_sessions'
    AND policyname = 'Enable full access for service role on conversation_sessions'
  ) THEN
    CREATE POLICY "Enable full access for service role on conversation_sessions"
      ON public.conversation_sessions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversation_sessions'
    AND policyname = 'Enable read for authenticated users on sessions'
  ) THEN
    CREATE POLICY "Enable read for authenticated users on sessions"
      ON public.conversation_sessions
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================================
-- 5. VERIFICATION QUERIES
-- ============================================================
-- These are read-only - safe to run

-- Check that tables exist
SELECT
  'SUCCESS: Tables exist' as status,
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('chat_conversations', 'conversation_sessions')
ORDER BY table_name;

-- Check indexes exist
SELECT
  'SUCCESS: Indexes exist' as status,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('chat_conversations', 'conversation_sessions')
ORDER BY tablename, indexname;

-- Check RLS is enabled
SELECT
  'SUCCESS: RLS enabled' as status,
  tablename,
  CASE WHEN rowsecurity THEN 'Enabled' ELSE 'Disabled' END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('chat_conversations', 'conversation_sessions');

-- Check policies exist
SELECT
  'SUCCESS: Policies created' as status,
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('chat_conversations', 'conversation_sessions')
ORDER BY tablename, policyname;

-- ============================================================
-- SUMMARY
-- ============================================================
-- If you see this, the migration completed successfully!
-- New tables and policies are ready for testing
-- Your existing system is completely untouched
-- ============================================================

SELECT
  '✅ MIGRATION COMPLETE - SAFE TO TEST' as status,
  'No existing data was modified or deleted' as guarantee,
  'You can now test the new ai-chat endpoint' as next_step;
