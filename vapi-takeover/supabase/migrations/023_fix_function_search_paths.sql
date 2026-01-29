-- Migration 023: Fix Function Search Path Mutable Warnings
-- Adds SET search_path = public to all functions missing this security setting
-- This prevents search_path manipulation attacks

-- ============================================================================
-- FIX get_effective_integration FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_effective_integration(
  p_assistant_id UUID,
  p_use_case TEXT,
  p_event_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  integration_id UUID,
  integration_name TEXT,
  provider TEXT,
  base_url TEXT,
  auth_config JSONB,
  endpoints JSONB,
  field_mappings JSONB,
  is_assistant_specific BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_assistant RECORD;
  v_integration RECORD;
  v_setting_key TEXT;
BEGIN
  -- Get assistant and org info
  SELECT a.*, a.integration_settings AS int_settings
  INTO v_assistant
  FROM assistants a
  WHERE a.id = p_assistant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Build the setting key based on use case
  v_setting_key := p_use_case || 'IntegrationId';

  -- Step 1: Check assistant-specific integration
  IF v_assistant.integrations_enabled = true
     AND v_assistant.int_settings IS NOT NULL
     AND v_assistant.int_settings->>v_setting_key IS NOT NULL THEN

    SELECT oi.id, oi.name, oi.provider, oi.base_url, oi.auth_config, oi.endpoints, oi.field_mappings
    INTO v_integration
    FROM organization_integrations oi
    WHERE oi.id = (v_assistant.int_settings->>v_setting_key)::UUID
      AND oi.status = 'active'
      AND (oi.use_case = p_use_case OR oi.use_case = 'general')
      AND (p_event_type IS NULL OR oi.event_triggers ? p_event_type);

    IF FOUND THEN
      integration_id := v_integration.id;
      integration_name := v_integration.name;
      provider := v_integration.provider;
      base_url := v_integration.base_url;
      auth_config := v_integration.auth_config;
      endpoints := v_integration.endpoints;
      field_mappings := v_integration.field_mappings;
      is_assistant_specific := true;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- Step 2: Check if override is set (don't fall back to org)
  IF v_assistant.int_settings->>'overrideOrgSettings' = 'true' THEN
    RETURN;
  END IF;

  -- Step 3: Fall back to organization-wide integration
  SELECT oi.id, oi.name, oi.provider, oi.base_url, oi.auth_config, oi.endpoints, oi.field_mappings
  INTO v_integration
  FROM organization_integrations oi
  WHERE oi.org_id = v_assistant.org_id
    AND oi.assistant_id IS NULL
    AND oi.status = 'active'
    AND (oi.use_case = p_use_case OR oi.use_case = 'general')
    AND (p_event_type IS NULL OR oi.event_triggers ? p_event_type)
  ORDER BY oi.priority ASC, oi.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    integration_id := v_integration.id;
    integration_name := v_integration.name;
    provider := v_integration.provider;
    base_url := v_integration.base_url;
    auth_config := v_integration.auth_config;
    endpoints := v_integration.endpoints;
    field_mappings := v_integration.field_mappings;
    is_assistant_specific := false;
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

-- ============================================================================
-- FIX get_assistant_active_integrations FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_assistant_active_integrations(
  p_assistant_id UUID,
  p_event_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  integration_id UUID,
  integration_name TEXT,
  provider TEXT,
  use_case TEXT,
  direction TEXT,
  base_url TEXT,
  is_assistant_specific BOOLEAN,
  priority INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_assistant RECORD;
BEGIN
  -- Get assistant info
  SELECT a.*, a.integration_settings AS int_settings
  INTO v_assistant
  FROM assistants a
  WHERE a.id = p_assistant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- If integrations not enabled on assistant and useOrgDefaults is false, return nothing
  IF v_assistant.integrations_enabled = false
     AND (v_assistant.int_settings->>'useOrgDefaults')::boolean IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Return assistant-specific integrations first (if enabled)
  IF v_assistant.integrations_enabled = true THEN
    RETURN QUERY
    SELECT
      oi.id,
      oi.name,
      oi.provider::TEXT,
      oi.use_case,
      oi.direction::TEXT,
      oi.base_url,
      true AS is_assistant_specific,
      oi.priority
    FROM organization_integrations oi
    WHERE oi.assistant_id = p_assistant_id
      AND oi.status = 'active'
      AND (p_event_type IS NULL OR oi.event_triggers ? p_event_type);
  END IF;

  -- If not overriding org settings, also return org-wide integrations
  IF (v_assistant.int_settings->>'overrideOrgSettings')::boolean IS NOT TRUE THEN
    RETURN QUERY
    SELECT
      oi.id,
      oi.name,
      oi.provider::TEXT,
      oi.use_case,
      oi.direction::TEXT,
      oi.base_url,
      false AS is_assistant_specific,
      oi.priority
    FROM organization_integrations oi
    WHERE oi.org_id = v_assistant.org_id
      AND oi.assistant_id IS NULL
      AND oi.status = 'active'
      AND (p_event_type IS NULL OR oi.event_triggers ? p_event_type)
    ORDER BY oi.priority ASC, oi.created_at ASC;
  END IF;

  RETURN;
END;
$$;

-- ============================================================================
-- FIX match_knowledge_chunks FUNCTION (ensure current version has search_path)
-- ============================================================================

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
LANGUAGE plpgsql
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
$$;

-- ============================================================================
-- FIX generate_pilot_slug FUNCTION (non-trigger version from migration 010)
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_pilot_slug(company_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Generate base slug from company name
  base_slug := lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := regexp_replace(base_slug, '^-|-$', '', 'g');

  -- If empty, use random string
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'pilot-' || substr(md5(random()::text), 1, 8);
  END IF;

  final_slug := base_slug;

  -- Check for uniqueness and add number if needed
  WHILE EXISTS (SELECT 1 FROM assistants WHERE pilot_slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$;

-- ============================================================================
-- FIX lookup_knowledge_chunks FUNCTION (if it exists)
-- This function may have been created via Supabase Studio
-- ============================================================================

-- Drop and recreate if exists (safe - CREATE OR REPLACE handles this)
CREATE OR REPLACE FUNCTION lookup_knowledge_chunks(
  query_embedding vector(1536),
  match_org_id UUID,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  heading TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
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
  WHERE kc.org_id = match_org_id
    AND 1 - (kc.embedding <=> query_embedding) > similarity_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- FIX search_knowledge_chunks FUNCTION (if it exists)
-- This function may have been created via Supabase Studio
-- ============================================================================

CREATE OR REPLACE FUNCTION search_knowledge_chunks(
  query_embedding vector(1536),
  p_org_id UUID,
  p_limit INT DEFAULT 5,
  p_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  heading TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
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
  WHERE kc.org_id = p_org_id
    AND 1 - (kc.embedding <=> query_embedding) > p_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION get_effective_integration IS 'Get the correct integration for an assistant based on cascading settings (search_path secured)';
COMMENT ON FUNCTION get_assistant_active_integrations IS 'Get all active integrations that should fire for an assistant/event (search_path secured)';
COMMENT ON FUNCTION match_knowledge_chunks IS 'Vector similarity search for knowledge chunks by tenant_id (search_path secured)';
COMMENT ON FUNCTION generate_pilot_slug IS 'Generate unique URL-safe slug for pilot pages (search_path secured)';
COMMENT ON FUNCTION lookup_knowledge_chunks IS 'Vector similarity search for knowledge chunks by org_id (search_path secured)';
COMMENT ON FUNCTION search_knowledge_chunks IS 'Vector similarity search for knowledge chunks by org_id (search_path secured)';
