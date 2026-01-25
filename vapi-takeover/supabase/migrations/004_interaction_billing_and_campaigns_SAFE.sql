-- SAFE Migration: Add interaction billing and campaigns WITHOUT dropping existing columns
-- This migration is purely ADDITIVE - it won't break existing chatbot functionality

-- Add new flat rate billing columns to organizations table (keeps existing columns)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS flat_rate_fee DECIMAL(10,2) DEFAULT 500.00;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS included_interactions INTEGER DEFAULT 5000;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS overage_rate_per_1000 DECIMAL(10,2) DEFAULT 50.00;

-- Add interaction tracking columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_start DATE DEFAULT CURRENT_DATE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_end DATE DEFAULT (CURRENT_DATE + INTERVAL '1 month');
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_interactions INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS total_interactions INTEGER DEFAULT 0;

-- Create interactions log table for detailed tracking
CREATE TABLE IF NOT EXISTS interaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL,

  -- Interaction type
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('sms_inbound', 'sms_outbound', 'call_inbound', 'call_outbound', 'chat_session')),

  -- Reference to conversation
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  session_id TEXT,

  -- Contact info
  contact_number TEXT,

  -- Metadata
  duration_seconds INTEGER,
  message_count INTEGER,
  cost DECIMAL(10,6) DEFAULT 0,

  -- Campaign tracking (for outbound)
  campaign_id UUID,

  -- Billing period
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interaction_logs_org_id ON interaction_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_created_at ON interaction_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_billing_period ON interaction_logs(org_id, billing_period_start, billing_period_end);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_campaign_id ON interaction_logs(campaign_id);

-- Create outbound campaigns table
CREATE TABLE IF NOT EXISTS outbound_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Campaign details
  name TEXT NOT NULL,
  description TEXT,
  assistant_id UUID NOT NULL REFERENCES assistants(id) ON DELETE RESTRICT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),

  -- Contact list
  total_contacts INTEGER DEFAULT 0,
  contacted INTEGER DEFAULT 0,
  successful INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,

  -- Scheduling
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  call_hours_start TIME DEFAULT '09:00:00',
  call_hours_end TIME DEFAULT '17:00:00',
  timezone TEXT DEFAULT 'Australia/Brisbane',

  -- Throttling
  max_concurrent_calls INTEGER DEFAULT 5,
  calls_per_minute INTEGER DEFAULT 10,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_outbound_campaigns_org_id ON outbound_campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_outbound_campaigns_status ON outbound_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_outbound_campaigns_created_at ON outbound_campaigns(created_at DESC);

-- Create campaign contacts table
CREATE TABLE IF NOT EXISTS campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES outbound_campaigns(id) ON DELETE CASCADE,

  -- Contact details
  phone_number TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  custom_fields JSONB,

  -- Call status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'calling', 'completed', 'failed', 'skipped', 'no_answer', 'busy', 'voicemail')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Call results
  last_attempt_at TIMESTAMPTZ,
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  call_duration INTEGER,
  call_recording_url TEXT,

  -- Scheduling
  scheduled_for TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_id ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON campaign_contacts(status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_phone ON campaign_contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_scheduled_for ON campaign_contacts(scheduled_for);

-- Now add the foreign key constraint for interaction_logs.campaign_id
-- (We couldn't add it earlier because the table didn't exist yet)
ALTER TABLE interaction_logs
  DROP CONSTRAINT IF EXISTS interaction_logs_campaign_id_fkey,
  ADD CONSTRAINT interaction_logs_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES outbound_campaigns(id) ON DELETE SET NULL;

-- Create usage summary view for org users
CREATE OR REPLACE VIEW organization_usage_summary AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.flat_rate_fee,
  o.included_interactions,
  o.overage_rate_per_1000,
  o.current_period_start,
  o.current_period_end,
  o.current_period_interactions,

  -- Calculate overage
  GREATEST(0, o.current_period_interactions - o.included_interactions) AS overage_interactions,

  -- Calculate overage cost
  CASE
    WHEN o.current_period_interactions > o.included_interactions
    THEN CEIL((o.current_period_interactions - o.included_interactions)::DECIMAL / 1000) * o.overage_rate_per_1000
    ELSE 0
  END AS overage_cost,

  -- Total cost this period
  o.flat_rate_fee +
  CASE
    WHEN o.current_period_interactions > o.included_interactions
    THEN CEIL((o.current_period_interactions - o.included_interactions)::DECIMAL / 1000) * o.overage_rate_per_1000
    ELSE 0
  END AS total_cost_this_period,

  -- Remaining interactions
  GREATEST(0, o.included_interactions - o.current_period_interactions) AS remaining_interactions,

  -- Usage percentage
  ROUND((o.current_period_interactions::DECIMAL / NULLIF(o.included_interactions, 0) * 100), 2) AS usage_percentage

FROM organizations o;

-- Function to reset monthly interaction counters
CREATE OR REPLACE FUNCTION reset_monthly_interactions()
RETURNS void AS $$
BEGIN
  UPDATE organizations
  SET
    current_period_start = CURRENT_DATE,
    current_period_end = CURRENT_DATE + INTERVAL '1 month',
    current_period_interactions = 0
  WHERE current_period_end <= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to increment interaction count
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
RETURNS void AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  -- Get current billing period
  SELECT current_period_start, current_period_end
  INTO v_period_start, v_period_end
  FROM organizations
  WHERE id = p_org_id;

  -- Increment organization counter
  UPDATE organizations
  SET
    current_period_interactions = current_period_interactions + 1,
    total_interactions = total_interactions + 1
  WHERE id = p_org_id;

  -- Log the interaction
  INSERT INTO interaction_logs (
    org_id,
    assistant_id,
    interaction_type,
    conversation_id,
    session_id,
    contact_number,
    duration_seconds,
    message_count,
    cost,
    campaign_id,
    billing_period_start,
    billing_period_end
  ) VALUES (
    p_org_id,
    p_assistant_id,
    p_interaction_type,
    p_conversation_id,
    p_session_id,
    p_contact_number,
    p_duration_seconds,
    p_message_count,
    p_cost,
    p_campaign_id,
    v_period_start,
    v_period_end
  );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
COMMENT ON TABLE interaction_logs IS 'Detailed log of all interactions (SMS, calls, chat sessions) for billing tracking';
COMMENT ON TABLE outbound_campaigns IS 'Outbound calling campaigns for proactive customer outreach';
COMMENT ON TABLE campaign_contacts IS 'Contact list for outbound campaigns with call status tracking';
COMMENT ON VIEW organization_usage_summary IS 'Real-time view of organization usage, overage, and costs';
COMMENT ON FUNCTION increment_interaction IS 'Increments interaction counter and logs the interaction for billing';
