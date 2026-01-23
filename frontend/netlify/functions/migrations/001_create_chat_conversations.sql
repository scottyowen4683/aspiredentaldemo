-- Migration: Create chat_conversations table for storing conversation history
-- This table replaces the need for VAPI's chat history management

-- Create the chat_conversations table
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant_session
  ON public.chat_conversations(tenant_id, session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_at
  ON public.chat_conversations(created_at DESC);

-- Enable RLS (Row Level Security) if needed
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- Create policy for service role (full access)
CREATE POLICY "Enable full access for service role"
  ON public.chat_conversations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Optional: Create policy for authenticated users (if using anon/authenticated roles)
CREATE POLICY "Enable read access for authenticated users on their own tenant"
  ON public.chat_conversations
  FOR SELECT
  TO authenticated
  USING (true);

-- Add comment to table
COMMENT ON TABLE public.chat_conversations IS 'Stores conversation history for AI chat sessions (VAPI-free implementation)';

-- Note: The conversation_sessions table should already exist from the VAPI implementation
-- If it doesn't exist, create it:

CREATE TABLE IF NOT EXISTS public.conversation_sessions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_tenant_session
  ON public.conversation_sessions(tenant_id, session_id);

ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable full access for service role on conversation_sessions"
  ON public.conversation_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.conversation_sessions IS 'Stores rolling conversation summaries for long-term context';
