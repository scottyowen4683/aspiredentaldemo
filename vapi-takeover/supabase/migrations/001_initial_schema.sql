-- VAPI Takeover - Initial Database Schema
-- This creates a clean schema for managing councils, assistants, and conversations
-- without VAPI dependency

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_role AS ENUM ('super_admin', 'org_admin');
CREATE TYPE bot_type AS ENUM ('voice', 'chat');
CREATE TYPE channel_type AS ENUM ('voice', 'chat');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Organizations (Councils)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,

  -- Contact & billing
  contact_email TEXT,
  contact_phone TEXT,
  billing_email TEXT,

  -- Service plan
  monthly_interaction_limit INTEGER DEFAULT 1000,
  price_per_interaction DECIMAL(10,4) DEFAULT 0.50,

  -- Settings
  settings JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,

  -- Metadata
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

  -- MFA
  mfa_enabled BOOLEAN DEFAULT false,

  -- Security
  failed_attempts INTEGER DEFAULT 0,
  locked BOOLEAN DEFAULT false,
  last_failed_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assistants (Voice & Chat Bots)
CREATE TABLE IF NOT EXISTS assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic info
  friendly_name TEXT NOT NULL,
  bot_type bot_type NOT NULL,
  active BOOLEAN DEFAULT true,

  -- Voice-specific
  phone_number TEXT, -- Twilio phone number for voice bots
  elevenlabs_voice_id TEXT, -- ElevenLabs voice ID

  -- Chat-specific
  widget_config JSONB, -- { primaryColor, greeting, title, etc. }

  -- AI Configuration
  prompt TEXT NOT NULL,
  model TEXT DEFAULT 'gpt-4o-mini',
  temperature DECIMAL(3,2) DEFAULT 0.5,
  max_tokens INTEGER DEFAULT 800,

  -- Knowledge base
  kb_enabled BOOLEAN DEFAULT true,
  kb_match_count INTEGER DEFAULT 5,

  -- Performance tracking
  total_interactions INTEGER DEFAULT 0,
  avg_interaction_time INTEGER DEFAULT 0, -- seconds
  performance_rank INTEGER,

  -- Auto-scoring
  auto_score BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations (Both Voice & Chat)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES assistants(id) ON DELETE CASCADE,

  -- Session info
  session_id TEXT UNIQUE NOT NULL,
  channel channel_type NOT NULL,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER, -- Total duration

  -- Transcript
  transcript JSONB, -- Array of { role, content, timestamp }
  transcript_text TEXT, -- Plain text version for search

  -- Costs (Direct - No VAPI!)
  whisper_cost DECIMAL(12,6) DEFAULT 0, -- Voice only
  gpt_cost DECIMAL(12,6) DEFAULT 0,
  elevenlabs_cost DECIMAL(12,6) DEFAULT 0, -- Voice only
  twilio_cost DECIMAL(12,6) DEFAULT 0, -- Voice only
  total_cost DECIMAL(12,6) DEFAULT 0,

  -- Token usage
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,

  -- Outcome
  end_reason TEXT, -- 'completed', 'timeout', 'error', 'hangup'
  success BOOLEAN, -- Did it resolve the user's issue?

  -- Evaluation (AI scoring)
  scored BOOLEAN DEFAULT false,
  overall_score INTEGER, -- 0-100
  score_details JSONB,

  -- Contact info (if provided)
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation Messages (Detailed turn-by-turn)
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Function calling
  function_name TEXT,
  function_args JSONB,

  -- Timing
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  latency_ms INTEGER,

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Knowledge Base Chunks
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL, -- For backward compatibility

  heading TEXT,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small

  -- Metadata
  source_file TEXT,
  chunk_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cost Usage (Monthly rollups for billing)
CREATE TABLE IF NOT EXISTS cost_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES assistants(id) ON DELETE CASCADE,

  month DATE NOT NULL, -- First day of month

  -- Interaction counts
  total_interactions INTEGER DEFAULT 0,
  voice_interactions INTEGER DEFAULT 0,
  chat_interactions INTEGER DEFAULT 0,

  -- Cost breakdown
  whisper_cost DECIMAL(12,2) DEFAULT 0,
  gpt_cost DECIMAL(12,2) DEFAULT 0,
  elevenlabs_cost DECIMAL(12,2) DEFAULT 0,
  twilio_cost DECIMAL(12,2) DEFAULT 0,
  total_cost DECIMAL(12,2) DEFAULT 0,

  -- Usage stats
  total_duration_seconds BIGINT DEFAULT 0,
  total_tokens_in BIGINT DEFAULT 0,
  total_tokens_out BIGINT DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, assistant_id, month)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  action TEXT NOT NULL, -- 'create_assistant', 'update_settings', etc.
  details JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
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
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant_id ON knowledge_chunks(tenant_id);

CREATE INDEX IF NOT EXISTS idx_cost_usage_org_id ON cost_usage(org_id);
CREATE INDEX IF NOT EXISTS idx_cost_usage_month ON cost_usage(month DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_assistants_updated_at
  BEFORE UPDATE ON assistants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_cost_usage_updated_at
  BEFORE UPDATE ON cost_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function: Search knowledge base (vector similarity)
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
-- VIEWS
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
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Super admins see everything
CREATE POLICY super_admin_all ON organizations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY super_admin_all ON users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY super_admin_all ON assistants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY super_admin_all ON conversations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY super_admin_all ON conversation_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY super_admin_all ON knowledge_chunks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY super_admin_all ON cost_usage
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY super_admin_all ON audit_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

-- Policy: Org admins see only their org data
CREATE POLICY org_admin_own_org ON organizations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
      AND role = 'org_admin'
    )
  );

CREATE POLICY org_admin_own_org ON assistants
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
      AND role = 'org_admin'
    )
  );

CREATE POLICY org_admin_own_org ON conversations
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
      AND role = 'org_admin'
    )
  );

CREATE POLICY org_admin_own_org ON conversation_messages
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

CREATE POLICY org_admin_own_org ON knowledge_chunks
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
      AND role = 'org_admin'
    )
  );

CREATE POLICY org_admin_own_org ON cost_usage
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
      AND role = 'org_admin'
    )
  );

-- ============================================================================
-- SEED DATA (For testing)
-- ============================================================================

-- Insert test super admin user (will be linked to auth.users after Google OAuth)
-- You'll update this with your actual auth_id after first login

COMMENT ON TABLE organizations IS 'Councils using the AI platform';
COMMENT ON TABLE assistants IS 'Voice and chat AI assistants (bots)';
COMMENT ON TABLE conversations IS 'Individual conversation sessions (voice or chat)';
COMMENT ON TABLE conversation_messages IS 'Turn-by-turn messages within conversations';
COMMENT ON TABLE knowledge_chunks IS 'Vector embeddings for knowledge base search';
COMMENT ON TABLE cost_usage IS 'Monthly cost and usage rollups for billing';
COMMENT ON TABLE audit_logs IS 'Security and admin action audit trail';

COMMENT ON COLUMN conversations.whisper_cost IS 'OpenAI Whisper speech-to-text cost (voice only)';
COMMENT ON COLUMN conversations.gpt_cost IS 'OpenAI GPT-4o-mini conversation cost';
COMMENT ON COLUMN conversations.elevenlabs_cost IS 'ElevenLabs text-to-speech cost (voice only)';
COMMENT ON COLUMN conversations.twilio_cost IS 'Twilio phone call cost (voice only)';
COMMENT ON COLUMN conversations.total_cost IS 'Total direct API costs (NO VAPI!)';
