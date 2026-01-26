-- =============================================================================
-- ASPIRE AI PLATFORM - COMPLETE SUPABASE SCHEMA
-- Run this in your Supabase SQL Editor to set up all required tables
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLE: organizations
-- =============================================================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    contact_email TEXT,
    contact_phone TEXT,
    billing_email TEXT,

    -- Billing/Usage fields
    monthly_interaction_limit INTEGER DEFAULT 1000,
    price_per_interaction DECIMAL(10,4) DEFAULT 0,
    flat_rate_fee DECIMAL(10,2) DEFAULT 0,
    included_interactions INTEGER DEFAULT 0,
    overage_rate_per_1000 DECIMAL(10,2) DEFAULT 0,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    current_period_interactions INTEGER DEFAULT 0,
    total_interactions INTEGER DEFAULT 0,

    -- Service plan fields
    service_plan_name TEXT,
    monthly_service_fee DECIMAL(10,2) DEFAULT 0,
    baseline_human_cost_per_call DECIMAL(10,2) DEFAULT 0,
    coverage_hours TEXT DEFAULT '12hr' CHECK (coverage_hours IN ('12hr', '24hr')),
    time_zone TEXT DEFAULT 'Australia/Sydney',

    -- Settings (JSONB for flexibility)
    settings JSONB DEFAULT '{}',

    -- Status
    active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE: users
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID UNIQUE,  -- Links to Supabase Auth
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT DEFAULT 'org_user' CHECK (role IN ('super_admin', 'org_admin', 'org_user')),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

    -- Security
    mfa_enabled BOOLEAN DEFAULT false,
    failed_attempts INTEGER DEFAULT 0,
    locked BOOLEAN DEFAULT false,
    last_failed_at TIMESTAMPTZ,

    -- Tracking
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE: assistants
-- =============================================================================
CREATE TABLE IF NOT EXISTS assistants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Identity
    friendly_name TEXT NOT NULL,
    provider TEXT DEFAULT 'aspire',
    assistant_key TEXT,
    bot_type TEXT DEFAULT 'voice',

    -- Configuration
    prompt TEXT,
    model TEXT DEFAULT 'gpt-4o',
    temperature DECIMAL(3,2) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 4096,

    -- Knowledge Base
    kb_enabled BOOLEAN DEFAULT false,
    kb_path TEXT,
    kb_match_count INTEGER DEFAULT 3,

    -- Voice/Widget
    phone_number TEXT,
    elevenlabs_voice_id TEXT,
    widget_config JSONB DEFAULT '{}',

    -- Scoring/Rubric
    auto_score BOOLEAN DEFAULT true,
    pause_auto_score BOOLEAN DEFAULT false,
    rubric JSONB,
    rubric_version INTEGER DEFAULT 1,
    transcript_source TEXT DEFAULT 'provider',

    -- Stats
    total_interactions INTEGER DEFAULT 0,
    avg_interaction_time DECIMAL(10,2) DEFAULT 0,
    performance_rank INTEGER,

    -- Status
    active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE: conversations
-- =============================================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,

    -- Type/Channel
    assistant_type TEXT,
    channel TEXT DEFAULT 'voice',
    provider TEXT,
    is_voice BOOLEAN DEFAULT true,

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    call_duration INTEGER,

    -- Content
    transcript JSONB,
    transcript_source TEXT,
    final_ai_summary TEXT,

    -- Recordings
    recording_url TEXT,
    stereo_recording_url TEXT,
    log_url TEXT,

    -- Scoring
    scored BOOLEAN DEFAULT false,
    overall_score DECIMAL(5,2),
    confidence_score DECIMAL(5,2),
    sentiment TEXT,
    success BOOLEAN,
    success_evaluation TEXT,
    escalation BOOLEAN DEFAULT false,

    -- Cost tracking (optional)
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    total_cost DECIMAL(10,6) DEFAULT 0,
    cost_breakdown JSONB DEFAULT '{}',

    -- Versioning
    prompt_version TEXT,
    kb_version TEXT,

    -- Status
    end_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE: scores
-- =============================================================================
CREATE TABLE IF NOT EXISTS scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,

    -- Score data
    scores JSONB DEFAULT '{}',
    sentiments JSONB DEFAULT '{}',
    flags JSONB DEFAULT '{}',
    effective_rubric JSONB,

    -- Metadata
    rubric_version INTEGER,
    rubric_source TEXT CHECK (rubric_source IN ('assistant', 'organization', 'system')),
    is_provider BOOLEAN DEFAULT false,
    is_used BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE: audit_logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,

    -- Log data
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}',

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE: review_queue
-- =============================================================================
CREATE TABLE IF NOT EXISTS review_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    score_id UUID REFERENCES scores(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Review data
    reason TEXT,
    reviewed BOOLEAN DEFAULT false,
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE: invites
-- =============================================================================
CREATE TABLE IF NOT EXISTS invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'org_user',
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Status
    accepted BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE: user_invites (for pending invites shown in UI)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'org_user',
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE: system_settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Global prompts/config
    universal_system_prompt TEXT,
    default_model TEXT DEFAULT 'gpt-4o',
    default_temperature DECIMAL(3,2) DEFAULT 0.7,
    default_max_tokens INTEGER DEFAULT 4096,

    -- Feature flags
    auto_score_enabled BOOLEAN DEFAULT true,
    welcome_email_enabled BOOLEAN DEFAULT true,
    monthly_report_enabled BOOLEAN DEFAULT true,

    -- Default rubric
    default_rubric JSONB,

    -- Tracking
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- =============================================================================
-- TABLE: settings_history
-- =============================================================================
CREATE TABLE IF NOT EXISTS settings_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES for performance
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_assistants_org_id ON assistants(org_id);
CREATE INDEX IF NOT EXISTS idx_assistants_active ON assistants(active);

CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assistant_id ON conversations(assistant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_started_at ON conversations(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_scored ON conversations(scored);

CREATE INDEX IF NOT EXISTS idx_scores_conversation_id ON scores(conversation_id);
CREATE INDEX IF NOT EXISTS idx_scores_org_id ON scores(org_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_review_queue_org_id ON review_queue(org_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_reviewed ON review_queue(reviewed);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings_history ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES - Allow all for authenticated users (adjust as needed)
-- =============================================================================

-- Organizations policies
CREATE POLICY "Allow all for authenticated users" ON organizations
    FOR ALL USING (auth.role() = 'authenticated');

-- Users policies
CREATE POLICY "Allow all for authenticated users" ON users
    FOR ALL USING (auth.role() = 'authenticated');

-- Assistants policies
CREATE POLICY "Allow all for authenticated users" ON assistants
    FOR ALL USING (auth.role() = 'authenticated');

-- Conversations policies
CREATE POLICY "Allow all for authenticated users" ON conversations
    FOR ALL USING (auth.role() = 'authenticated');

-- Scores policies
CREATE POLICY "Allow all for authenticated users" ON scores
    FOR ALL USING (auth.role() = 'authenticated');

-- Audit logs policies
CREATE POLICY "Allow all for authenticated users" ON audit_logs
    FOR ALL USING (auth.role() = 'authenticated');

-- Review queue policies
CREATE POLICY "Allow all for authenticated users" ON review_queue
    FOR ALL USING (auth.role() = 'authenticated');

-- Invites policies
CREATE POLICY "Allow all for authenticated users" ON invites
    FOR ALL USING (auth.role() = 'authenticated');

-- User invites policies
CREATE POLICY "Allow all for authenticated users" ON user_invites
    FOR ALL USING (auth.role() = 'authenticated');

-- System settings policies
CREATE POLICY "Allow all for authenticated users" ON system_settings
    FOR ALL USING (auth.role() = 'authenticated');

-- Settings history policies
CREATE POLICY "Allow all for authenticated users" ON settings_history
    FOR ALL USING (auth.role() = 'authenticated');

-- =============================================================================
-- INSERT DEFAULT SYSTEM SETTINGS
-- =============================================================================
INSERT INTO system_settings (id, universal_system_prompt, default_model, auto_score_enabled)
VALUES (uuid_generate_v4(), 'You are a helpful AI assistant.', 'gpt-4o', true)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- DONE! Your Supabase database is now set up for the Aspire AI Platform
-- =============================================================================
