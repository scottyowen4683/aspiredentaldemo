-- Enhance Integrations for Versatility
-- Adds assistant-specific linking, event triggers, and use case configurations
-- Allows multiple integrations with different purposes per organization

-- ============================================================================
-- ADD ASSISTANT LINKING (Optional - integrations can be org-wide or assistant-specific)
-- ============================================================================

-- Add assistant_id column to link integrations to specific assistants
ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL;

-- Add index for assistant lookups
CREATE INDEX IF NOT EXISTS idx_org_integrations_assistant_id ON organization_integrations(assistant_id);

-- ============================================================================
-- ADD EVENT TRIGGERS & USE CASE CONFIGURATION
-- ============================================================================

-- Add event_triggers to specify which events trigger this integration
ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS event_triggers JSONB DEFAULT '[]';
-- Example: ["conversation_ended", "contact_request", "escalation", "kb_sync"]

-- Add use_case to clearly identify the purpose of each integration
ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS use_case TEXT DEFAULT 'general';
-- Options: 'kb_import', 'job_logging', 'call_logging', 'ticket_creation', 'contact_sync', 'general'

-- Add description field for user notes
ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add priority for ordering when multiple integrations match
ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100;

-- ============================================================================
-- ADD ADVANCED KB IMPORT SETTINGS
-- ============================================================================

-- Add KB import specific settings
ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS kb_import_settings JSONB DEFAULT '{}';
-- Example: {
--   "targetAssistantId": "uuid",      -- Which assistant gets the KB (null = all)
--   "categoryMapping": {},             -- Map external categories to our sections
--   "excludeCategories": [],           -- Categories to skip
--   "contentTransform": "default",     -- How to process content
--   "autoSync": false,                 -- Enable scheduled auto-sync
--   "syncSchedule": "0 2 * * *"        -- Cron expression for auto-sync
-- }

-- ============================================================================
-- ADD OUTBOUND EVENT SETTINGS
-- ============================================================================

-- Add outbound specific settings for each use case
ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS outbound_settings JSONB DEFAULT '{}';
-- Example: {
--   "includeTranscript": true,
--   "includeScore": true,
--   "minimumScore": 0,                 -- Only send if score >= this
--   "onlyEscalations": false,          -- Only send escalated calls
--   "customPayload": {}                -- Additional static fields to include
-- }

-- ============================================================================
-- CREATE INTEGRATION ASSIGNMENTS TABLE
-- For linking integrations to multiple assistants (many-to-many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS integration_assistant_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES organization_integrations(id) ON DELETE CASCADE NOT NULL,
  assistant_id UUID REFERENCES assistants(id) ON DELETE CASCADE NOT NULL,

  -- Assignment-specific overrides
  enabled BOOLEAN DEFAULT true,
  event_triggers_override JSONB,        -- Override org integration triggers for this assistant
  settings_override JSONB,              -- Override other settings for this assistant

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(integration_id, assistant_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_assignments_integration ON integration_assistant_assignments(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_assignments_assistant ON integration_assistant_assignments(assistant_id);

-- RLS for assignments table
ALTER TABLE integration_assistant_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY super_admin_all ON integration_assistant_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY org_admin_own_org ON integration_assistant_assignments
  FOR ALL USING (
    integration_id IN (
      SELECT oi.id FROM organization_integrations oi
      WHERE oi.org_id IN (
        SELECT org_id FROM users
        WHERE auth_id = auth.uid()
        AND role = 'org_admin'
      )
    )
  );

-- ============================================================================
-- CREATE VIEW FOR EASY INTEGRATION LOOKUP
-- ============================================================================

CREATE OR REPLACE VIEW v_assistant_integrations AS
SELECT
  a.id AS assistant_id,
  a.friendly_name AS assistant_name,
  a.org_id,
  oi.id AS integration_id,
  oi.name AS integration_name,
  oi.provider,
  oi.direction,
  oi.status,
  oi.use_case,
  COALESCE(iaa.event_triggers_override, oi.event_triggers) AS event_triggers,
  COALESCE(iaa.settings_override, '{}') AS settings_override,
  COALESCE(iaa.enabled, true) AS enabled,
  oi.base_url,
  oi.last_sync_at,
  oi.last_sync_status
FROM assistants a
LEFT JOIN integration_assistant_assignments iaa ON iaa.assistant_id = a.id
LEFT JOIN organization_integrations oi ON (
  oi.id = iaa.integration_id
  OR (oi.org_id = a.org_id AND oi.assistant_id IS NULL AND iaa.id IS NULL)
)
WHERE oi.id IS NOT NULL AND oi.status = 'active';

-- ============================================================================
-- UPDATE TEMPLATES WITH USE CASE INFO
-- ============================================================================

UPDATE integration_templates SET
  default_endpoints = jsonb_set(
    default_endpoints,
    '{supportedUseCases}',
    '["kb_import", "ticket_creation", "call_logging"]'::jsonb
  )
WHERE provider IN ('techone', 'sap', 'salesforce', 'dynamics365', 'zendesk', 'freshdesk');

UPDATE integration_templates SET
  default_endpoints = jsonb_set(
    default_endpoints,
    '{supportedUseCases}',
    '["call_logging", "call_transfer"]'::jsonb
  )
WHERE provider = 'genesys';

UPDATE integration_templates SET
  default_endpoints = jsonb_set(
    default_endpoints,
    '{supportedUseCases}',
    '["kb_import", "job_logging", "ticket_creation", "call_logging", "contact_sync"]'::jsonb
  )
WHERE provider = 'custom';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN organization_integrations.assistant_id IS 'Optional: Link integration to specific assistant. NULL = org-wide integration';
COMMENT ON COLUMN organization_integrations.event_triggers IS 'Array of event types that trigger this integration';
COMMENT ON COLUMN organization_integrations.use_case IS 'Primary use case: kb_import, job_logging, call_logging, ticket_creation, contact_sync, general';
COMMENT ON COLUMN organization_integrations.kb_import_settings IS 'Settings specific to KB import use case';
COMMENT ON COLUMN organization_integrations.outbound_settings IS 'Settings for outbound data sync (filters, payload customization)';
COMMENT ON TABLE integration_assistant_assignments IS 'Many-to-many linking of integrations to assistants with per-assistant overrides';
