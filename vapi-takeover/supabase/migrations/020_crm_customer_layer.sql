-- CRM Customer Layer
-- Comprehensive CRM for managing customers, activities, follow-ups, and email campaigns
-- Integrates with existing Brevo email service

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE customer_status AS ENUM (
  'lead',           -- Initial contact, not yet qualified
  'prospect',       -- Qualified lead, actively pursuing
  'customer',       -- Active customer
  'churned',        -- Lost customer
  'inactive'        -- Dormant, no recent activity
);

CREATE TYPE relationship_stage AS ENUM (
  'new',            -- Just added
  'contacted',      -- Initial contact made
  'qualified',      -- Needs identified, budget confirmed
  'proposal',       -- Proposal sent
  'negotiation',    -- In active negotiation
  'closed_won',     -- Deal won
  'closed_lost'     -- Deal lost
);

CREATE TYPE activity_type AS ENUM (
  'call',           -- Phone call
  'email',          -- Email sent/received
  'meeting',        -- In-person or video meeting
  'note',           -- General note
  'task',           -- Task completed
  'voicemail',      -- Left voicemail
  'sms',            -- Text message
  'chat',           -- Chat interaction
  'demo',           -- Product demo
  'proposal'        -- Proposal sent
);

CREATE TYPE campaign_status AS ENUM (
  'draft',          -- Being created
  'scheduled',      -- Scheduled to send
  'sending',        -- Currently sending
  'sent',           -- Completed
  'paused',         -- Paused mid-send
  'cancelled'       -- Cancelled
);

CREATE TYPE email_status AS ENUM (
  'pending',        -- In queue
  'sent',           -- Sent successfully
  'delivered',      -- Confirmed delivered
  'opened',         -- Recipient opened
  'clicked',        -- Link clicked
  'bounced',        -- Hard/soft bounce
  'unsubscribed',   -- Recipient unsubscribed
  'failed'          -- Send failed
);

CREATE TYPE followup_status AS ENUM (
  'pending',        -- Not yet actioned
  'completed',      -- Completed
  'overdue',        -- Past due date
  'cancelled'       -- Cancelled
);

CREATE TYPE followup_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

-- ============================================================================
-- CORE CRM TABLES
-- ============================================================================

-- Customers / Contacts
CREATE TABLE IF NOT EXISTS crm_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Basic info
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,

  -- Company info
  company_name TEXT,
  job_title TEXT,
  industry TEXT,
  website TEXT,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'Australia',

  -- Australian state for filtering
  australian_state TEXT,  -- QLD, NSW, VIC, SA, WA, NT, TAS, ACT

  -- Council-specific fields
  mayor_name TEXT,
  ceo_name TEXT,
  council_type TEXT,      -- e.g., 'City', 'Shire', 'Regional', 'Town'

  -- CRM status
  status customer_status NOT NULL DEFAULT 'lead',
  stage relationship_stage NOT NULL DEFAULT 'new',
  source TEXT,                           -- Where did this lead come from?
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,  -- Sales rep

  -- Value
  estimated_value DECIMAL(12,2),         -- Potential deal value
  lifetime_value DECIMAL(12,2) DEFAULT 0, -- Total value to date

  -- Scoring
  lead_score INTEGER DEFAULT 0,          -- 0-100 lead quality score

  -- Communication preferences
  email_opt_in BOOLEAN DEFAULT true,
  sms_opt_in BOOLEAN DEFAULT false,
  preferred_contact_method TEXT DEFAULT 'email',

  -- Tags and categories
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',

  -- Tracking
  last_contacted_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Customer Activities / Interactions
CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES crm_customers(id) ON DELETE CASCADE NOT NULL,

  -- Activity details
  activity_type activity_type NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,

  -- Related entities
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,  -- Link to voice/chat
  campaign_id UUID,                      -- Will reference email campaigns

  -- Outcome
  outcome TEXT,                          -- e.g., 'positive', 'negative', 'neutral', 'no_answer'
  next_steps TEXT,

  -- Duration (for calls/meetings)
  duration_minutes INTEGER,

  -- Metadata
  activity_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Follow-up Tasks
CREATE TABLE IF NOT EXISTS crm_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES crm_customers(id) ON DELETE CASCADE NOT NULL,

  -- Task details
  title TEXT NOT NULL,
  description TEXT,

  -- Scheduling
  due_date TIMESTAMPTZ NOT NULL,
  reminder_date TIMESTAMPTZ,

  -- Assignment
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Status
  status followup_status NOT NULL DEFAULT 'pending',
  priority followup_priority NOT NULL DEFAULT 'medium',

  -- Completion
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completion_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Email Templates
CREATE TABLE IF NOT EXISTS crm_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Template info
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,

  -- Categories
  category TEXT DEFAULT 'general',       -- e.g., 'welcome', 'followup', 'promotional', 'newsletter'

  -- Personalization placeholders
  -- {{first_name}}, {{last_name}}, {{company_name}}, etc.
  available_placeholders TEXT[] DEFAULT ARRAY['first_name', 'last_name', 'company_name', 'email'],

  -- Stats
  times_used INTEGER DEFAULT 0,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Email Campaigns
CREATE TABLE IF NOT EXISTS crm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Campaign info
  name TEXT NOT NULL,
  description TEXT,

  -- Template
  template_id UUID REFERENCES crm_email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,

  -- Targeting
  target_filter JSONB DEFAULT '{}',      -- Filter criteria for recipients
  recipient_count INTEGER DEFAULT 0,

  -- Scheduling
  status campaign_status NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Stats
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Campaign Recipients (join table)
CREATE TABLE IF NOT EXISTS crm_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES crm_campaigns(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES crm_customers(id) ON DELETE CASCADE NOT NULL,

  -- Email sending status
  status email_status NOT NULL DEFAULT 'pending',

  -- Tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,

  -- Error tracking
  error_message TEXT,

  -- Brevo tracking
  message_id TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(campaign_id, customer_id)
);

-- Customer Notes (quick notes without activity type)
CREATE TABLE IF NOT EXISTS crm_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES crm_customers(id) ON DELETE CASCADE NOT NULL,

  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Customers indexes
CREATE INDEX IF NOT EXISTS idx_crm_customers_org_id ON crm_customers(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_customers_status ON crm_customers(status);
CREATE INDEX IF NOT EXISTS idx_crm_customers_stage ON crm_customers(stage);
CREATE INDEX IF NOT EXISTS idx_crm_customers_email ON crm_customers(email);
CREATE INDEX IF NOT EXISTS idx_crm_customers_assigned_to ON crm_customers(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_customers_next_followup ON crm_customers(next_followup_at);
CREATE INDEX IF NOT EXISTS idx_crm_customers_created_at ON crm_customers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_customers_search ON crm_customers USING gin(
  to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(company_name, '') || ' ' || coalesce(email, ''))
);
CREATE INDEX IF NOT EXISTS idx_crm_customers_australian_state ON crm_customers(australian_state);

-- Activities indexes
CREATE INDEX IF NOT EXISTS idx_crm_activities_org_id ON crm_activities(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_customer_id ON crm_activities(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_crm_activities_date ON crm_activities(activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_conversation_id ON crm_activities(conversation_id);

-- Follow-ups indexes
CREATE INDEX IF NOT EXISTS idx_crm_followups_org_id ON crm_followups(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_followups_customer_id ON crm_followups(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_followups_status ON crm_followups(status);
CREATE INDEX IF NOT EXISTS idx_crm_followups_due_date ON crm_followups(due_date);
CREATE INDEX IF NOT EXISTS idx_crm_followups_assigned_to ON crm_followups(assigned_to);

-- Campaigns indexes
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_org_id ON crm_campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_status ON crm_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_scheduled_at ON crm_campaigns(scheduled_at);

-- Campaign recipients indexes
CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_campaign_id ON crm_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_customer_id ON crm_campaign_recipients(customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_status ON crm_campaign_recipients(status);

-- Templates indexes
CREATE INDEX IF NOT EXISTS idx_crm_email_templates_org_id ON crm_email_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_templates_category ON crm_email_templates(category);

-- Notes indexes
CREATE INDEX IF NOT EXISTS idx_crm_notes_customer_id ON crm_notes(customer_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_crm_customers_updated_at
  BEFORE UPDATE ON crm_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_crm_followups_updated_at
  BEFORE UPDATE ON crm_followups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_crm_campaigns_updated_at
  BEFORE UPDATE ON crm_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_crm_email_templates_updated_at
  BEFORE UPDATE ON crm_email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_crm_notes_updated_at
  BEFORE UPDATE ON crm_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;

-- Super admins see everything
CREATE POLICY super_admin_all ON crm_customers FOR ALL USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'super_admin')
);

CREATE POLICY super_admin_all ON crm_activities FOR ALL USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'super_admin')
);

CREATE POLICY super_admin_all ON crm_followups FOR ALL USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'super_admin')
);

CREATE POLICY super_admin_all ON crm_email_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'super_admin')
);

CREATE POLICY super_admin_all ON crm_campaigns FOR ALL USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'super_admin')
);

CREATE POLICY super_admin_all ON crm_campaign_recipients FOR ALL USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'super_admin')
);

CREATE POLICY super_admin_all ON crm_notes FOR ALL USING (
  EXISTS (SELECT 1 FROM users u WHERE u.auth_id = auth.uid() AND u.role = 'super_admin')
);

-- Org admins see their own org's data
CREATE POLICY org_admin_own_org ON crm_customers FOR ALL USING (
  org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'org_admin')
);

CREATE POLICY org_admin_own_org ON crm_activities FOR ALL USING (
  org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'org_admin')
);

CREATE POLICY org_admin_own_org ON crm_followups FOR ALL USING (
  org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'org_admin')
);

CREATE POLICY org_admin_own_org ON crm_email_templates FOR ALL USING (
  org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'org_admin')
);

CREATE POLICY org_admin_own_org ON crm_campaigns FOR ALL USING (
  org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'org_admin')
);

CREATE POLICY org_admin_own_org ON crm_campaign_recipients FOR ALL USING (
  campaign_id IN (
    SELECT id FROM crm_campaigns WHERE org_id IN (
      SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'org_admin'
    )
  )
);

CREATE POLICY org_admin_own_org ON crm_notes FOR ALL USING (
  org_id IN (SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'org_admin')
);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Customer summary view with activity stats
CREATE OR REPLACE VIEW crm_customer_summary AS
SELECT
  c.*,
  o.name as organization_name,
  u.full_name as assigned_user_name,
  (SELECT COUNT(*) FROM crm_activities a WHERE a.customer_id = c.id) as total_activities,
  (SELECT COUNT(*) FROM crm_followups f WHERE f.customer_id = c.id AND f.status = 'pending') as pending_followups,
  (SELECT MAX(activity_date) FROM crm_activities a WHERE a.customer_id = c.id) as last_activity_date,
  (SELECT activity_type FROM crm_activities a WHERE a.customer_id = c.id ORDER BY activity_date DESC LIMIT 1) as last_activity_type
FROM crm_customers c
LEFT JOIN organizations o ON o.id = c.org_id
LEFT JOIN users u ON u.id = c.assigned_to;

-- Pipeline summary by stage
CREATE OR REPLACE VIEW crm_pipeline_summary AS
SELECT
  org_id,
  stage,
  COUNT(*) as customer_count,
  SUM(estimated_value) as total_value,
  AVG(lead_score) as avg_lead_score
FROM crm_customers
WHERE status IN ('lead', 'prospect')
GROUP BY org_id, stage;

-- Campaign performance view
CREATE OR REPLACE VIEW crm_campaign_performance AS
SELECT
  c.*,
  CASE WHEN c.total_sent > 0 THEN ROUND((c.total_delivered::NUMERIC / c.total_sent) * 100, 2) ELSE 0 END as delivery_rate,
  CASE WHEN c.total_delivered > 0 THEN ROUND((c.total_opened::NUMERIC / c.total_delivered) * 100, 2) ELSE 0 END as open_rate,
  CASE WHEN c.total_opened > 0 THEN ROUND((c.total_clicked::NUMERIC / c.total_opened) * 100, 2) ELSE 0 END as click_rate,
  CASE WHEN c.total_sent > 0 THEN ROUND((c.total_bounced::NUMERIC / c.total_sent) * 100, 2) ELSE 0 END as bounce_rate
FROM crm_campaigns c;

-- ============================================================================
-- SEED DATA - Default email templates
-- ============================================================================

-- We'll create default templates when the first customer is added via the API
-- This ensures org_id is valid

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE crm_customers IS 'CRM contacts/leads/customers for each organization';
COMMENT ON TABLE crm_activities IS 'Activity log for customer interactions (calls, emails, meetings, etc.)';
COMMENT ON TABLE crm_followups IS 'Scheduled follow-up tasks for customers';
COMMENT ON TABLE crm_email_templates IS 'Reusable email templates for campaigns';
COMMENT ON TABLE crm_campaigns IS 'Email marketing campaigns';
COMMENT ON TABLE crm_campaign_recipients IS 'Individual recipients in a campaign with tracking status';
COMMENT ON TABLE crm_notes IS 'Quick notes attached to customers';

COMMENT ON COLUMN crm_customers.lead_score IS 'Quality score 0-100, higher is better';
COMMENT ON COLUMN crm_customers.tags IS 'Flexible tags for categorization';
COMMENT ON COLUMN crm_customers.custom_fields IS 'Custom fields as JSON object';
COMMENT ON COLUMN crm_campaigns.target_filter IS 'JSON filter criteria to select recipients (status, tags, etc.)';
