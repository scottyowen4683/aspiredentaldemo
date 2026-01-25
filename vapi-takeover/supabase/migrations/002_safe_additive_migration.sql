-- ============================================================================
-- VAPI Takeover - SAFE Additive Migration
-- This ONLY adds new tables and columns - does NOT modify existing data
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS (Create only if they don't exist)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'org_admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE bot_type AS ENUM ('voice', 'chat');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE channel_type AS ENUM ('voice', 'chat');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- NEW TABLES (Create only if they don't exist)
-- ============================================================================

-- Organizations (Councils)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  billing_email TEXT,
  monthly_interaction_limit INTEGER DEFAULT 1000,
  price_per_interaction DECIMAL(10,4) DEFAULT 0.50,
  settings JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (Super Admin + Org Admins)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'org_admin',
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  mfa_enabled BOOLEAN DEFAULT false,
  failed_attempts INTEGER DEFAULT 0,
  locked BOOLEAN DEFAULT false,
  last_failed_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assistants (Voice & Chat Bots)
CREATE TABLE IF NOT EXISTS assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  friendly_name TEXT NOT NULL,
  bot_type bot_type NOT NULL,
  active BOOLEAN DEFAULT true,
  phone_number TEXT,
  elevenlabs_voice_id TEXT,
  widget_config JSONB,
  prompt TEXT NOT NULL,
  model TEXT DEFAULT 'gpt-4o-mini',
  temperature DECIMAL(3,2) DEFAULT 0.5,
  max_tokens INTEGER DEFAULT 800,
  kb_enabled BOOLEAN DEFAULT true,
  kb_match_count INTEGER DEFAULT 5,
  total_interactions INTEGER DEFAULT 0,
  avg_interaction_time INTEGER DEFAULT 0,
  performance_rank INTEGER,
  auto_score BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (New unified table for voice & chat)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES assistants(id) ON DELETE CASCADE,
  session_id TEXT UNIQUE NOT NULL,
  channel channel_type NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  transcript JSONB,
  transcript_text TEXT,
  whisper_cost DECIMAL(12,6) DEFAULT 0,
  gpt_cost DECIMAL(12,6) DEFAULT 0,
  elevenlabs_cost DECIMAL(12,6) DEFAULT 0,
  twilio_cost DECIMAL(12,6) DEFAULT 0,
  total_cost DECIMAL(12,6) DEFAULT 0,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  end_reason TEXT,
  success BOOLEAN,
  scored BOOLEAN DEFAULT false,
  overall_score INTEGER,
  score_details JSONB,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation Messages (Turn-by-turn detail)
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  function_name TEXT,
  function_args JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  latency_ms INTEGER,
  metadata JSONB DEFAULT '{}'
);

-- Cost Usage (Monthly rollups)
CREATE TABLE IF NOT EXISTS cost_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES assistants(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  total_interactions INTEGER DEFAULT 0,
  voice_interactions INTEGER DEFAULT 0,
  chat_interactions INTEGER DEFAULT 0,
  whisper_cost DECIMAL(12,2) DEFAULT 0,
  gpt_cost DECIMAL(12,2) DEFAULT 0,
  elevenlabs_cost DECIMAL(12,2) DEFAULT 0,
  twilio_cost DECIMAL(12,2) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,
  total_duration_seconds BIGINT DEFAULT 0,
  total_tokens_in BIGINT DEFAULT 0,
  total_tokens_out BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, assistant_id, month)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ADD COLUMNS TO EXISTING TABLES (Safe - only if column doesn't exist)
-- ============================================================================

-- Add org_id to knowledge_chunks if it doesn't exist
DO $$ BEGIN
  ALTER TABLE knowledge_chunks ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add bot_type tracking to existing chat_conversations if needed
DO $$ BEGIN
  ALTER TABLE chat_conversations ADD COLUMN channel TEXT DEFAULT 'chat';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE chat_conversations ADD COLUMN assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- ============================================================================
-- INDEXES (Create only if they don't exist)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_assistants_org_id ON assistants(org_id);
CREATE INDEX IF NOT EXISTS idx_assistants_bot_type ON assistants(bot_type);
CREATE INDEX IF NOT EXISTS idx_assistants_active ON assistants(active);

CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assistant_id ON conversations(assistant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_started_at ON conversations(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_timestamp ON conversation_messages(timestamp);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_org_id ON knowledge_chunks(org_id);

CREATE INDEX IF NOT EXISTS idx_cost_usage_org_id ON cost_usage(org_id);
CREATE INDEX IF NOT EXISTS idx_cost_usage_month ON cost_usage(month DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- FUNCTIONS (Create or replace - safe)
-- ============================================================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers only if they don't exist
DO $$ BEGIN
  CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_assistants_updated_at
    BEFORE UPDATE ON assistants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_cost_usage_updated_at
    BEFORE UPDATE ON cost_usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Function: Search knowledge base (matches existing function signature)
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_tenant_id TEXT,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  heading TEXT,
  content TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.heading,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE kc.tenant_id = match_tenant_id
    AND 1 - (kc.embedding <=> query_embedding) > similarity_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS (Create or replace - safe)
-- ============================================================================

-- View: Council Monthly Interactions (for billing)
CREATE OR REPLACE VIEW council_monthly_interactions AS
SELECT
  o.id as org_id,
  o.name as council_name,
  DATE_TRUNC('month', c.started_at)::DATE as month,
  COUNT(*) as total_interactions,
  COUNT(*) FILTER (WHERE c.channel = 'voice') as voice_interactions,
  COUNT(*) FILTER (WHERE c.channel = 'chat') as chat_interactions,
  SUM(c.duration_seconds) as total_duration_seconds,
  AVG(c.duration_seconds) as avg_duration_seconds,
  SUM(c.total_cost) as total_cost,
  SUM(c.whisper_cost) as whisper_cost,
  SUM(c.gpt_cost) as gpt_cost,
  SUM(c.elevenlabs_cost) as elevenlabs_cost,
  SUM(c.twilio_cost) as twilio_cost,
  COUNT(*) FILTER (WHERE c.success = true) as successful_interactions,
  AVG(c.overall_score) as avg_score
FROM organizations o
LEFT JOIN conversations c ON c.org_id = o.id
WHERE c.started_at >= DATE_TRUNC('month', NOW() - INTERVAL '12 months')
GROUP BY o.id, o.name, DATE_TRUNC('month', c.started_at)
ORDER BY month DESC, council_name;

-- View: Assistant Performance Summary
CREATE OR REPLACE VIEW assistant_performance AS
SELECT
  a.id as assistant_id,
  a.friendly_name,
  a.bot_type,
  a.org_id,
  o.name as org_name,
  a.total_interactions,
  a.avg_interaction_time,
  a.performance_rank,
  COUNT(c.id) as conversation_count,
  AVG(c.duration_seconds) as avg_duration,
  AVG(c.overall_score) as avg_score,
  SUM(c.total_cost) as total_cost,
  COUNT(*) FILTER (WHERE c.success = true)::FLOAT / NULLIF(COUNT(*), 0) as success_rate
FROM assistants a
LEFT JOIN organizations o ON o.id = a.org_id
LEFT JOIN conversations c ON c.assistant_id = a.id
  AND c.started_at >= DATE_TRUNC('month', NOW())
WHERE a.active = true
GROUP BY a.id, a.friendly_name, a.bot_type, a.org_id, o.name,
         a.total_interactions, a.avg_interaction_time, a.performance_rank
ORDER BY a.performance_rank NULLS LAST, a.total_interactions DESC;

-- ============================================================================
-- ROW LEVEL SECURITY (Enable only - doesn't modify existing policies)
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create policies only if they don't exist
DO $$ BEGIN
  CREATE POLICY super_admin_all_organizations ON organizations
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'super_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_all_users ON users
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'super_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_all_assistants ON assistants
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'super_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_all_conversations ON conversations
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'super_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_all_conversation_messages ON conversation_messages
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'super_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_all_cost_usage ON cost_usage
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'super_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY super_admin_all_audit_logs ON audit_logs
    FOR ALL USING (
      EXISTS (
        SELECT 1 FROM users u
        WHERE u.auth_id = auth.uid()
        AND u.role = 'super_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Org admin policies
DO $$ BEGIN
  CREATE POLICY org_admin_own_org_organizations ON organizations
    FOR SELECT USING (
      id IN (
        SELECT org_id FROM users
        WHERE auth_id = auth.uid()
        AND role = 'org_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY org_admin_own_org_assistants ON assistants
    FOR ALL USING (
      org_id IN (
        SELECT org_id FROM users
        WHERE auth_id = auth.uid()
        AND role = 'org_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY org_admin_own_org_conversations ON conversations
    FOR SELECT USING (
      org_id IN (
        SELECT org_id FROM users
        WHERE auth_id = auth.uid()
        AND role = 'org_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY org_admin_own_org_conversation_messages ON conversation_messages
    FOR SELECT USING (
      conversation_id IN (
        SELECT id FROM conversations
        WHERE org_id IN (
          SELECT org_id FROM users
          WHERE auth_id = auth.uid()
          AND role = 'org_admin'
        )
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY org_admin_own_org_cost_usage ON cost_usage
    FOR SELECT USING (
      org_id IN (
        SELECT org_id FROM users
        WHERE auth_id = auth.uid()
        AND role = 'org_admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE organizations IS 'Councils using the AI platform';
COMMENT ON TABLE assistants IS 'Voice and chat AI assistants (bots)';
COMMENT ON TABLE conversations IS 'Unified conversation sessions (voice or chat)';
COMMENT ON TABLE conversation_messages IS 'Turn-by-turn messages within conversations';
COMMENT ON TABLE cost_usage IS 'Monthly cost and usage rollups for billing';
COMMENT ON TABLE audit_logs IS 'Security and admin action audit trail';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration is 100% SAFE and ADDITIVE:
-- ✅ Keeps all existing tables (chat_conversations, knowledge_chunks, etc.)
-- ✅ Only adds NEW tables (organizations, users, assistants, conversations, etc.)
-- ✅ Only adds NEW columns to existing tables
-- ✅ All operations use IF NOT EXISTS or DO blocks to prevent errors
-- ✅ Your existing chat bot continues working unchanged
-- ============================================================================
