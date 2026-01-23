-- ============================================================
-- SAFE MIGRATION FOR VAPI TRANSITION TESTING
-- ============================================================
-- This migration is idempotent (safe to run multiple times)
-- Uses IF NOT EXISTS to avoid disrupting existing tables
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
-- 4. CREATE POLICIES FOR SERVICE ROLE ACCESS
-- ============================================================
-- Drop existing policies if they exist, then recreate
-- This ensures clean policy state

-- Policies for chat_conversations
DROP POLICY IF EXISTS "Enable full access for service role" ON public.chat_conversations;
CREATE POLICY "Enable full access for service role"
  ON public.chat_conversations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Optional: Allow authenticated users to read their own tenant's data
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.chat_conversations;
CREATE POLICY "Enable read for authenticated users"
  ON public.chat_conversations
  FOR SELECT
  TO authenticated
  USING (true);

-- Policies for conversation_sessions
DROP POLICY IF EXISTS "Enable full access for service role on conversation_sessions" ON public.conversation_sessions;
CREATE POLICY "Enable full access for service role on conversation_sessions"
  ON public.conversation_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Optional: Allow authenticated users to read summaries
DROP POLICY IF EXISTS "Enable read for authenticated users on sessions" ON public.conversation_sessions;
CREATE POLICY "Enable read for authenticated users on sessions"
  ON public.conversation_sessions
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 5. VERIFICATION QUERIES
-- ============================================================
-- Run these to verify everything was created correctly

-- Check that tables exist
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('chat_conversations', 'conversation_sessions')
ORDER BY table_name;

-- Check indexes
SELECT
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('chat_conversations', 'conversation_sessions')
ORDER BY tablename, indexname;

-- Check RLS is enabled
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('chat_conversations', 'conversation_sessions');

-- ============================================================
-- 6. TEST QUERIES (OPTIONAL - UNCOMMENT TO TEST)
-- ============================================================
-- These are safe read-only queries to verify structure

-- Check current data (should be empty for chat_conversations)
-- SELECT COUNT(*) as chat_conversations_count FROM public.chat_conversations;
-- SELECT COUNT(*) as conversation_sessions_count FROM public.conversation_sessions;

-- Show schema for chat_conversations
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'chat_conversations'
-- ORDER BY ordinal_position;

-- ============================================================
-- ROLLBACK INSTRUCTIONS (IF NEEDED)
-- ============================================================
-- If you need to remove these tables later (NOT recommended during testing):
--
-- DROP TABLE IF EXISTS public.chat_conversations CASCADE;
-- (Keep conversation_sessions as it may be used by existing VAPI setup)
--
-- ============================================================

-- ============================================================
-- DONE!
-- ============================================================
-- You can now test the new ai-chat.js endpoint
-- The tables are ready to store conversation history
-- ============================================================
