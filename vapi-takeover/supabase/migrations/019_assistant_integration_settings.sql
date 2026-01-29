-- Assistant Integration Settings
-- Enables assistants to have integration functionality turned on
-- with cascading fallback: Assistant settings → Organization defaults → None

-- ============================================================================
-- ADD INTEGRATION SETTINGS TO ASSISTANTS TABLE
-- ============================================================================

-- Add integrations_enabled flag to assistants
ALTER TABLE assistants
ADD COLUMN IF NOT EXISTS integrations_enabled BOOLEAN DEFAULT false;

-- Add integration settings JSONB for assistant-level configuration
ALTER TABLE assistants
ADD COLUMN IF NOT EXISTS integration_settings JSONB DEFAULT '{}';
-- Example: {
--   "enabledIntegrations": ["uuid1", "uuid2"],   -- Specific integrations to use
--   "kbImportIntegrationId": "uuid",             -- Which integration to use for KB
--   "callLoggingIntegrationId": "uuid",          -- Which integration logs calls
--   "ticketCreationIntegrationId": "uuid",       -- Which integration creates tickets
--   "contactSyncIntegrationId": "uuid",          -- Which integration syncs contacts
--   "useOrgDefaults": true,                      -- Fall back to org defaults if not set
--   "overrideOrgSettings": false                 -- If true, ONLY use assistant-specific
-- }

-- ============================================================================
-- CREATE FUNCTION TO GET EFFECTIVE INTEGRATION FOR ASSISTANT
-- Returns the correct integration based on cascading settings
-- ============================================================================

CREATE OR REPLACE FUNCTION get_effective_integration(
  p_assistant_id UUID,
  p_use_case TEXT,          -- 'kb_import', 'call_logging', 'ticket_creation', etc.
  p_event_type TEXT DEFAULT NULL  -- Optional: specific event type filter
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
) AS $$
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
    RETURN;  -- No fallback, return empty
  END IF;

  -- Step 3: Fall back to organization-wide integration
  SELECT oi.id, oi.name, oi.provider, oi.base_url, oi.auth_config, oi.endpoints, oi.field_mappings
  INTO v_integration
  FROM organization_integrations oi
  WHERE oi.org_id = v_assistant.org_id
    AND oi.assistant_id IS NULL  -- Org-wide (not assistant-specific)
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
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CREATE FUNCTION TO GET ALL ACTIVE INTEGRATIONS FOR ASSISTANT
-- Returns all integrations that should fire for a given event
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
) AS $$
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
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CREATE VIEW FOR ASSISTANT INTEGRATION STATUS
-- Easy way to see what integrations each assistant has access to
-- ============================================================================

CREATE OR REPLACE VIEW v_assistant_integration_status AS
SELECT
  a.id AS assistant_id,
  a.friendly_name AS assistant_name,
  a.org_id,
  o.name AS org_name,
  a.integrations_enabled,
  COALESCE((a.integration_settings->>'useOrgDefaults')::boolean, true) AS use_org_defaults,
  COALESCE((a.integration_settings->>'overrideOrgSettings')::boolean, false) AS override_org_settings,
  (
    SELECT COUNT(*)
    FROM organization_integrations oi
    WHERE oi.assistant_id = a.id AND oi.status = 'active'
  ) AS assistant_specific_integrations,
  (
    SELECT COUNT(*)
    FROM organization_integrations oi
    WHERE oi.org_id = a.org_id AND oi.assistant_id IS NULL AND oi.status = 'active'
  ) AS org_wide_integrations,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'id', oi.id,
      'name', oi.name,
      'provider', oi.provider,
      'use_case', oi.use_case,
      'is_assistant_specific', oi.assistant_id IS NOT NULL
    ))
    FROM organization_integrations oi
    WHERE (oi.assistant_id = a.id OR (oi.org_id = a.org_id AND oi.assistant_id IS NULL))
      AND oi.status = 'active'
  ) AS available_integrations
FROM assistants a
LEFT JOIN organizations o ON o.id = a.org_id
WHERE a.active = true;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN assistants.integrations_enabled IS 'Enable integration functionality for this assistant';
COMMENT ON COLUMN assistants.integration_settings IS 'Assistant-specific integration configuration (which integrations to use for each use case)';
COMMENT ON FUNCTION get_effective_integration IS 'Get the correct integration for an assistant based on cascading settings';
COMMENT ON FUNCTION get_assistant_active_integrations IS 'Get all active integrations that should fire for an assistant/event';
