-- CRM Integration Module
-- Supports bidirectional integrations with TechOne, SAP, Genesys, and custom APIs
-- - Outbound: Push data to CRMs (tickets, logs, updates)
-- - Inbound: Pull knowledge base content from external systems

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE integration_provider AS ENUM (
  'techone',      -- TechOne (popular with AU councils)
  'sap',          -- SAP CRM/ERP
  'genesys',      -- Genesys Cloud contact center
  'salesforce',   -- Salesforce CRM
  'dynamics365',  -- Microsoft Dynamics 365
  'zendesk',      -- Zendesk support
  'freshdesk',    -- Freshdesk
  'custom'        -- Custom API endpoint
);

CREATE TYPE integration_direction AS ENUM (
  'outbound',     -- Push data TO the external system
  'inbound',      -- Pull data FROM the external system (KB import)
  'bidirectional' -- Both directions
);

CREATE TYPE integration_status AS ENUM (
  'active',
  'inactive',
  'error',
  'pending_setup'
);

CREATE TYPE sync_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'failed'
);

-- ============================================================================
-- MAIN TABLES
-- ============================================================================

-- Organization Integrations - Stores CRM/API connection configurations
CREATE TABLE IF NOT EXISTS organization_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Integration identity
  name TEXT NOT NULL,                    -- Friendly name: "Council TechOne CRM"
  provider integration_provider NOT NULL,
  direction integration_direction NOT NULL DEFAULT 'outbound',
  status integration_status NOT NULL DEFAULT 'pending_setup',

  -- Connection settings (encrypted in app layer)
  base_url TEXT NOT NULL,                -- API base URL
  auth_type TEXT NOT NULL DEFAULT 'api_key', -- 'api_key', 'oauth2', 'basic', 'bearer'
  auth_config JSONB DEFAULT '{}',        -- { apiKey, clientId, clientSecret, username, password, etc }

  -- Endpoint configuration
  endpoints JSONB DEFAULT '{}',          -- { createTicket: '/api/tickets', getKB: '/api/kb', etc }

  -- Data mapping configuration
  field_mappings JSONB DEFAULT '{}',     -- Maps our fields to their fields

  -- Sync settings
  sync_enabled BOOLEAN DEFAULT false,
  sync_interval_minutes INTEGER DEFAULT 60,  -- How often to sync (for inbound)
  last_sync_at TIMESTAMPTZ,
  last_sync_status sync_status,
  last_sync_message TEXT,

  -- Rate limiting
  rate_limit_per_minute INTEGER DEFAULT 60,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Integration Sync Logs - Track all sync operations
CREATE TABLE IF NOT EXISTS integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES organization_integrations(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Sync details
  direction integration_direction NOT NULL,
  status sync_status NOT NULL DEFAULT 'pending',

  -- What was synced
  records_processed INTEGER DEFAULT 0,
  records_succeeded INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,

  -- KB import specific
  kb_chunks_created INTEGER DEFAULT 0,
  kb_chunks_updated INTEGER DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,

  -- Error details
  error_message TEXT,
  error_details JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Integration Event Queue - Outbound events waiting to be sent
CREATE TABLE IF NOT EXISTS integration_event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES organization_integrations(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Event details
  event_type TEXT NOT NULL,              -- 'conversation_ended', 'contact_request', 'escalation'
  payload JSONB NOT NULL,                -- The data to send

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),

  -- Response tracking
  response_status INTEGER,               -- HTTP status code
  response_body JSONB,

  -- Error handling
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Integration Templates - Pre-configured settings for known providers
CREATE TABLE IF NOT EXISTS integration_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider integration_provider NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,

  -- Default configuration
  default_auth_type TEXT NOT NULL DEFAULT 'api_key',
  default_endpoints JSONB DEFAULT '{}',
  default_field_mappings JSONB DEFAULT '{}',

  -- Documentation
  setup_instructions TEXT,
  api_docs_url TEXT,

  -- Capabilities
  supports_outbound BOOLEAN DEFAULT true,
  supports_inbound BOOLEAN DEFAULT true,
  supports_kb_import BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_org_integrations_org_id ON organization_integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_integrations_provider ON organization_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_org_integrations_status ON organization_integrations(status);

CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_integration_id ON integration_sync_logs(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_org_id ON integration_sync_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_created_at ON integration_sync_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_event_queue_integration_id ON integration_event_queue(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_event_queue_status ON integration_event_queue(status);
CREATE INDEX IF NOT EXISTS idx_integration_event_queue_next_attempt ON integration_event_queue(next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_organization_integrations_updated_at
  BEFORE UPDATE ON organization_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_integration_templates_updated_at
  BEFORE UPDATE ON integration_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_event_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_templates ENABLE ROW LEVEL SECURITY;

-- Super admins see everything
CREATE POLICY super_admin_all ON organization_integrations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY super_admin_all ON integration_sync_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY super_admin_all ON integration_event_queue
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

CREATE POLICY super_admin_all ON integration_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
      AND u.role = 'super_admin'
    )
  );

-- Org admins see their own integrations
CREATE POLICY org_admin_own_org ON organization_integrations
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
      AND role = 'org_admin'
    )
  );

CREATE POLICY org_admin_own_org ON integration_sync_logs
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
      AND role = 'org_admin'
    )
  );

CREATE POLICY org_admin_own_org ON integration_event_queue
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM users
      WHERE auth_id = auth.uid()
      AND role = 'org_admin'
    )
  );

-- Everyone can read templates
CREATE POLICY public_read ON integration_templates
  FOR SELECT USING (true);

-- ============================================================================
-- SEED DATA - Pre-configured templates for known providers
-- ============================================================================

INSERT INTO integration_templates (provider, display_name, description, default_auth_type, default_endpoints, supports_kb_import, setup_instructions) VALUES
(
  'techone',
  'TechOne',
  'TechOne enterprise platform - popular with Australian local councils for CRM, finance, and HR',
  'oauth2',
  '{
    "createRequest": "/api/crm/requests",
    "updateRequest": "/api/crm/requests/{id}",
    "getKnowledgeBase": "/api/kb/articles",
    "searchKB": "/api/kb/search",
    "logInteraction": "/api/crm/interactions"
  }',
  true,
  'To connect TechOne:\n1. Log into your TechOne admin portal\n2. Navigate to API Management > OAuth Applications\n3. Create a new application and copy the Client ID and Secret\n4. Enter your TechOne base URL (e.g., https://yourcouncil.techone.com.au/api)\n5. Paste the credentials below and test the connection'
),
(
  'sap',
  'SAP',
  'SAP CRM and S/4HANA integration for enterprise resource planning and customer management',
  'oauth2',
  '{
    "createServiceTicket": "/sap/opu/odata/sap/API_SERVICEREQUEST_SRV/A_ServiceRequest",
    "getKnowledgeArticles": "/sap/opu/odata/sap/API_KNOWLEDGE_SRV/KnowledgeArticles",
    "searchKB": "/sap/opu/odata/sap/API_KNOWLEDGE_SRV/KnowledgeArticles?$search={query}",
    "logActivity": "/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner/{id}/to_Activity"
  }',
  true,
  'To connect SAP:\n1. Access your SAP Business Technology Platform\n2. Create an OAuth 2.0 client in your SAP system\n3. Configure the required API scopes for CRM and Knowledge Base\n4. Copy your SAP API endpoint URL\n5. Enter credentials and test the connection'
),
(
  'genesys',
  'Genesys Cloud',
  'Genesys Cloud contact center platform for call routing, analytics, and workforce management',
  'oauth2',
  '{
    "createInteraction": "/api/v2/conversations",
    "logConversation": "/api/v2/analytics/conversations/details/jobs",
    "getQueues": "/api/v2/routing/queues",
    "transferCall": "/api/v2/conversations/calls/{id}/participants/{participantId}/replace",
    "getAgentStatus": "/api/v2/users/{id}/presences"
  }',
  false,
  'To connect Genesys Cloud:\n1. Log into Genesys Cloud Admin\n2. Navigate to Admin > Integrations > OAuth\n3. Add a new OAuth client with Client Credentials grant\n4. Assign required roles: Conversation, Analytics, Routing\n5. Copy the Client ID and Secret\n6. Enter your region-specific API URL (e.g., https://api.mypurecloud.com.au)'
),
(
  'salesforce',
  'Salesforce',
  'Salesforce CRM for sales, service, and marketing automation',
  'oauth2',
  '{
    "createCase": "/services/data/v58.0/sobjects/Case",
    "createLead": "/services/data/v58.0/sobjects/Lead",
    "getKnowledgeArticles": "/services/data/v58.0/support/knowledgeArticles",
    "searchKB": "/services/data/v58.0/search/?q=FIND+{query}+IN+ALL+FIELDS+RETURNING+Knowledge__kav",
    "logActivity": "/services/data/v58.0/sobjects/Task"
  }',
  true,
  'To connect Salesforce:\n1. Go to Setup > Apps > App Manager\n2. Create a new Connected App\n3. Enable OAuth and select required scopes\n4. Copy Consumer Key and Secret\n5. Enter your Salesforce instance URL'
),
(
  'dynamics365',
  'Microsoft Dynamics 365',
  'Microsoft Dynamics 365 for customer engagement, sales, and service',
  'oauth2',
  '{
    "createCase": "/api/data/v9.2/incidents",
    "createContact": "/api/data/v9.2/contacts",
    "getKnowledgeArticles": "/api/data/v9.2/knowledgearticles",
    "searchKB": "/api/data/v9.2/knowledgearticles?$filter=contains(title,''{query}'')",
    "logActivity": "/api/data/v9.2/tasks"
  }',
  true,
  'To connect Dynamics 365:\n1. Register an app in Azure Active Directory\n2. Configure API permissions for Dynamics CRM\n3. Create a client secret\n4. Copy Application ID and Secret\n5. Enter your Dynamics 365 organization URL'
),
(
  'zendesk',
  'Zendesk',
  'Zendesk support platform for ticketing and customer service',
  'api_key',
  '{
    "createTicket": "/api/v2/tickets",
    "updateTicket": "/api/v2/tickets/{id}",
    "getArticles": "/api/v2/help_center/articles",
    "searchArticles": "/api/v2/help_center/articles/search?query={query}",
    "createUser": "/api/v2/users"
  }',
  true,
  'To connect Zendesk:\n1. Go to Admin Center > Apps and Integrations > APIs > Zendesk API\n2. Create a new API token\n3. Copy your subdomain (e.g., yourcompany.zendesk.com)\n4. Enter your email and API token below'
),
(
  'freshdesk',
  'Freshdesk',
  'Freshdesk helpdesk and customer support platform',
  'api_key',
  '{
    "createTicket": "/api/v2/tickets",
    "updateTicket": "/api/v2/tickets/{id}",
    "getArticles": "/api/v2/solutions/articles",
    "searchArticles": "/api/v2/search/solutions?term={query}",
    "createContact": "/api/v2/contacts"
  }',
  true,
  'To connect Freshdesk:\n1. Log into Freshdesk as admin\n2. Go to Profile Settings > API Key\n3. Copy your API key\n4. Enter your Freshdesk domain (e.g., yourcompany.freshdesk.com)'
),
(
  'custom',
  'Custom API',
  'Connect to any REST API with custom configuration',
  'api_key',
  '{
    "createRecord": "/api/records",
    "updateRecord": "/api/records/{id}",
    "getRecords": "/api/records",
    "searchRecords": "/api/search?q={query}"
  }',
  true,
  'For custom API integration:\n1. Enter your API base URL\n2. Configure authentication (API Key, OAuth2, or Basic Auth)\n3. Set up endpoint paths for the actions you need\n4. Map your data fields to match your API schema\n5. Test the connection before enabling'
)
ON CONFLICT (provider) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  default_auth_type = EXCLUDED.default_auth_type,
  default_endpoints = EXCLUDED.default_endpoints,
  supports_kb_import = EXCLUDED.supports_kb_import,
  setup_instructions = EXCLUDED.setup_instructions,
  updated_at = NOW();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE organization_integrations IS 'CRM and external API integrations configured per organization';
COMMENT ON TABLE integration_sync_logs IS 'History of all sync operations (inbound KB imports and outbound data pushes)';
COMMENT ON TABLE integration_event_queue IS 'Queue of outbound events waiting to be sent to external systems';
COMMENT ON TABLE integration_templates IS 'Pre-configured templates for known CRM/API providers';

COMMENT ON COLUMN organization_integrations.auth_config IS 'Encrypted authentication credentials (API keys, OAuth tokens, etc)';
COMMENT ON COLUMN organization_integrations.endpoints IS 'Configured API endpoints for this integration';
COMMENT ON COLUMN organization_integrations.field_mappings IS 'Maps internal fields to external API field names';
