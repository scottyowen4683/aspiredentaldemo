-- Migration 014: Fix Security Issues
-- Addresses Supabase security linter warnings:
-- 1. Enable RLS on tables missing it
-- 2. Fix SECURITY DEFINER views -> SECURITY INVOKER
-- 3. Fix functions with mutable search_path
-- 4. Replace overly permissive RLS policies
-- 5. Add proper org-scoped RLS policies

-- ============================================================================
-- PART 1: ENABLE RLS ON ALL TABLES
-- ============================================================================

-- Enable RLS on tables that are missing it
ALTER TABLE IF EXISTS interaction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS outbound_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contact_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chat_session_links ENABLE ROW LEVEL SECURITY;

-- Ensure RLS is enabled on core tables (may have been disabled)
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cost_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 2: DROP OVERLY PERMISSIVE POLICIES
-- ============================================================================

-- Drop policies that use USING (true) which bypass RLS
DROP POLICY IF EXISTS "Auth write assistants" ON assistants;
DROP POLICY IF EXISTS "Auth write audit" ON audit_logs;
DROP POLICY IF EXISTS "Auth write convos" ON conversations;
DROP POLICY IF EXISTS "Auth write orgs" ON organizations;

-- ============================================================================
-- PART 3: ADD PROPER RLS POLICIES FOR NEW TABLES
-- ============================================================================

-- ---- interaction_logs ----
-- Service role (backend) has full access
CREATE POLICY "Service role full access to interaction_logs" ON interaction_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Super admins can see all
CREATE POLICY "Super admins can access all interaction_logs" ON interaction_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

-- Org admins can see their org's logs
CREATE POLICY "Org admins can view own interaction_logs" ON interaction_logs
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
    )
  );

-- ---- outbound_campaigns ----
CREATE POLICY "Service role full access to outbound_campaigns" ON outbound_campaigns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Super admins can access all outbound_campaigns" ON outbound_campaigns
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY "Org admins can manage own outbound_campaigns" ON outbound_campaigns
  FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
    )
  );

-- ---- campaign_contacts ----
CREATE POLICY "Service role full access to campaign_contacts" ON campaign_contacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Super admins can access all campaign_contacts" ON campaign_contacts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY "Org admins can manage own campaign_contacts" ON campaign_contacts
  FOR ALL
  TO authenticated
  USING (
    campaign_id IN (
      SELECT c.id FROM outbound_campaigns c
      WHERE c.org_id IN (
        SELECT org_id FROM users
        WHERE auth_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT c.id FROM outbound_campaigns c
      WHERE c.org_id IN (
        SELECT org_id FROM users
        WHERE auth_id = auth.uid()
      )
    )
  );

-- ---- contact_requests ----
CREATE POLICY "Service role full access to contact_requests" ON contact_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Super admins can access all contact_requests" ON contact_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY "Org admins can view own contact_requests" ON contact_requests
  FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
    )
  );

-- ---- chat_session_links ----
-- Allow public read for shared chat links (they are public by design)
CREATE POLICY "Public can read chat_session_links" ON chat_session_links
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role full access to chat_session_links" ON chat_session_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Super admins can manage chat_session_links" ON chat_session_links
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

-- ============================================================================
-- PART 4: ADD SERVICE ROLE POLICIES TO EXISTING TABLES
-- ============================================================================

-- These allow the backend (using service_role key) to bypass RLS when needed
-- This is the recommended pattern for server-side operations

CREATE POLICY "Service role full access to users" ON users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to organizations" ON organizations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to assistants" ON assistants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to conversations" ON conversations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to conversation_messages" ON conversation_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to knowledge_chunks" ON knowledge_chunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to cost_usage" ON cost_usage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to audit_logs" ON audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 5: FIX VIEWS - Remove SECURITY DEFINER
-- ============================================================================

-- Recreate views with SECURITY INVOKER (default, but explicit is better)
DROP VIEW IF EXISTS assistant_performance;
CREATE VIEW assistant_performance
WITH (security_invoker = true)
AS
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

DROP VIEW IF EXISTS organization_usage_summary;
CREATE VIEW organization_usage_summary
WITH (security_invoker = true)
AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.flat_rate_fee,
  o.included_interactions,
  o.overage_rate_per_1000,
  o.current_period_start,
  o.current_period_end,
  o.current_period_interactions,
  GREATEST(0, o.current_period_interactions - o.included_interactions) AS overage_interactions,
  CASE
    WHEN o.current_period_interactions > o.included_interactions
    THEN CEIL((o.current_period_interactions - o.included_interactions)::DECIMAL / 1000) * o.overage_rate_per_1000
    ELSE 0
  END AS overage_cost,
  o.flat_rate_fee +
  CASE
    WHEN o.current_period_interactions > o.included_interactions
    THEN CEIL((o.current_period_interactions - o.included_interactions)::DECIMAL / 1000) * o.overage_rate_per_1000
    ELSE 0
  END AS total_cost_this_period,
  GREATEST(0, o.included_interactions - o.current_period_interactions) AS remaining_interactions,
  ROUND((o.current_period_interactions::DECIMAL / NULLIF(o.included_interactions, 0) * 100), 2) AS usage_percentage
FROM organizations o;

DROP VIEW IF EXISTS council_monthly_interactions;
CREATE VIEW council_monthly_interactions
WITH (security_invoker = true)
AS
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

-- ============================================================================
-- PART 6: FIX FUNCTIONS - Set search_path
-- ============================================================================

-- Recreate functions with immutable search_path for security
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reset_monthly_interactions()
RETURNS void
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE organizations
  SET
    current_period_start = CURRENT_DATE,
    current_period_end = CURRENT_DATE + INTERVAL '1 month',
    current_period_interactions = 0
  WHERE current_period_end <= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_interaction(
  p_org_id UUID,
  p_assistant_id UUID,
  p_interaction_type TEXT,
  p_conversation_id UUID DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_contact_number TEXT DEFAULT NULL,
  p_duration_seconds INTEGER DEFAULT NULL,
  p_message_count INTEGER DEFAULT NULL,
  p_cost DECIMAL DEFAULT 0,
  p_campaign_id UUID DEFAULT NULL
)
RETURNS void
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  SELECT current_period_start, current_period_end
  INTO v_period_start, v_period_end
  FROM organizations
  WHERE id = p_org_id;

  UPDATE organizations
  SET
    current_period_interactions = current_period_interactions + 1,
    total_interactions = total_interactions + 1
  WHERE id = p_org_id;

  INSERT INTO interaction_logs (
    org_id, assistant_id, interaction_type, conversation_id, session_id,
    contact_number, duration_seconds, message_count, cost, campaign_id,
    billing_period_start, billing_period_end
  ) VALUES (
    p_org_id, p_assistant_id, p_interaction_type, p_conversation_id, p_session_id,
    p_contact_number, p_duration_seconds, p_message_count, p_cost, p_campaign_id,
    v_period_start, v_period_end
  );
END;
$$ LANGUAGE plpgsql;

-- Match knowledge chunks with fixed search_path
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
)
SECURITY INVOKER
SET search_path = public
AS $$
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

-- Cleanup expired conversations with fixed search_path
CREATE OR REPLACE FUNCTION cleanup_expired_conversations()
RETURNS INTEGER
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM conversations
    WHERE id IN (
      SELECT c.id FROM conversations c
      JOIN assistants a ON c.assistant_id = a.id
      WHERE a.retention_days IS NOT NULL
        AND c.started_at < NOW() - (a.retention_days || ' days')::INTERVAL
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Get expired conversations with fixed search_path
CREATE OR REPLACE FUNCTION get_expired_conversations()
RETURNS TABLE (
  conversation_id UUID,
  org_id UUID,
  assistant_id UUID,
  started_at TIMESTAMPTZ,
  retention_days INTEGER
)
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as conversation_id,
    c.org_id,
    c.assistant_id,
    c.started_at,
    a.retention_days
  FROM conversations c
  JOIN assistants a ON c.assistant_id = a.id
  WHERE a.retention_days IS NOT NULL
    AND c.started_at < NOW() - (a.retention_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Generate pilot slug with fixed search_path
CREATE OR REPLACE FUNCTION generate_pilot_slug()
RETURNS TRIGGER
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.pilot_slug IS NULL OR NEW.pilot_slug = '' THEN
    NEW.pilot_slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
    NEW.pilot_slug := TRIM(BOTH '-' FROM NEW.pilot_slug);
    IF EXISTS (SELECT 1 FROM organizations WHERE pilot_slug = NEW.pilot_slug AND id != NEW.id) THEN
      NEW.pilot_slug := NEW.pilot_slug || '-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 7: GRANT VIEW PERMISSIONS
-- ============================================================================

GRANT SELECT ON assistant_performance TO authenticated;
GRANT SELECT ON organization_usage_summary TO authenticated;
GRANT SELECT ON council_monthly_interactions TO authenticated;
GRANT SELECT ON assistant_performance TO service_role;
GRANT SELECT ON organization_usage_summary TO service_role;
GRANT SELECT ON council_monthly_interactions TO service_role;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Service role full access to users" ON users IS 'Allows backend services to manage users';
COMMENT ON POLICY "Service role full access to organizations" ON organizations IS 'Allows backend services to manage organizations';
COMMENT ON POLICY "Service role full access to interaction_logs" ON interaction_logs IS 'Allows backend services to log interactions';
