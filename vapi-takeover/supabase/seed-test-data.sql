-- ============================================================================
-- ASPIRE AI PLATFORM - TEST DATA SEED SCRIPT
-- Run this in your Supabase SQL Editor to populate test data
-- ============================================================================

-- Clear existing test data (optional - uncomment if you want fresh start)
-- DELETE FROM conversation_scores;
-- DELETE FROM conversation_messages;
-- DELETE FROM conversations;
-- DELETE FROM interaction_logs;
-- DELETE FROM knowledge_chunks;
-- DELETE FROM campaign_contacts;
-- DELETE FROM outbound_campaigns;
-- DELETE FROM assistants;
-- DELETE FROM organizations WHERE name LIKE 'Test%' OR name LIKE 'Demo%' OR name LIKE '%Council%' OR name LIKE '%Municipality%';

-- ============================================================================
-- 1. ORGANIZATIONS (with billing tiers)
-- ============================================================================

INSERT INTO organizations (id, name, slug, flat_rate_fee, included_interactions, overage_rate_per_1000, current_period_interactions, total_interactions, active, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Greenfield City Council', 'greenfield', 2500.00, 5000, 45.00, 3250, 12500, true, NOW() - INTERVAL '60 days'),
  ('22222222-2222-2222-2222-222222222222', 'Riverside Municipality', 'riverside', 5000.00, 12000, 40.00, 9500, 35000, true, NOW() - INTERVAL '45 days'),
  ('33333333-3333-3333-3333-333333333333', 'Lakewood Township', 'lakewood', 1500.00, 3000, 50.00, 3800, 8500, true, NOW() - INTERVAL '30 days'),
  ('44444444-4444-4444-4444-444444444444', 'Mountain View District', 'mountainview', 3500.00, 8000, 42.00, 6200, 18000, true, NOW() - INTERVAL '20 days'),
  ('55555555-5555-5555-5555-555555555555', 'Coastal County Admin', 'coastal', 7500.00, 20000, 35.00, 15000, 62000, true, NOW() - INTERVAL '90 days')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  current_period_interactions = EXCLUDED.current_period_interactions,
  total_interactions = EXCLUDED.total_interactions;

-- ============================================================================
-- 2. ASSISTANTS (voice and chat)
-- ============================================================================

INSERT INTO assistants (id, org_id, friendly_name, bot_type, phone_number, elevenlabs_voice_id, prompt, model, temperature, max_tokens, kb_enabled, auto_score, active, created_at)
VALUES
  -- Greenfield assistants
  ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Greenfield General Inquiries', 'voice', '+14155551001', '21m00Tcm4TlvDq8ikWAM', 'You are a helpful assistant for Greenfield City Council. Help residents with general inquiries about city services, permits, and events.', 'gpt-4o-mini', 0.7, 800, true, true, true, NOW() - INTERVAL '55 days'),
  ('aaaa2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Greenfield Web Chat', 'chat', NULL, NULL, 'You are the Greenfield City Council web assistant. Help visitors find information and answer questions.', 'gpt-4o-mini', 0.5, 600, true, true, true, NOW() - INTERVAL '50 days'),

  -- Riverside assistants
  ('bbbb1111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Riverside Customer Service', 'voice', '+14155552001', 'ErXwobaYiN019PkySvjV', 'You are the Riverside Municipality customer service assistant. Help with utility bills, permits, and municipal services.', 'gpt-4o-mini', 0.6, 1000, true, true, true, NOW() - INTERVAL '40 days'),
  ('bbbb2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Riverside Chat Support', 'chat', NULL, NULL, 'You are the Riverside chat support bot. Provide quick answers about municipal services.', 'gpt-4o-mini', 0.5, 500, true, true, true, NOW() - INTERVAL '38 days'),

  -- Lakewood assistants
  ('cccc1111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Lakewood Info Line', 'voice', '+14155553001', 'TxGEqnHWrfWFTfGW9XjX', 'You are Lakewood Township information line. Help with zoning, permits, and township services.', 'gpt-4o-mini', 0.7, 800, true, true, true, NOW() - INTERVAL '25 days'),

  -- Mountain View assistants
  ('dddd1111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'Mountain View Assistant', 'chat', NULL, NULL, 'You are the Mountain View District virtual assistant. Help with all district services.', 'gpt-4o-mini', 0.6, 700, true, true, true, NOW() - INTERVAL '15 days'),

  -- Coastal assistants
  ('eeee1111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'Coastal County Hotline', 'voice', '+14155555001', 'onwK4e9ZLuTAKqWW03F9', 'You are Coastal County Admin hotline. Assist with county services, taxes, and administration.', 'gpt-4o-mini', 0.5, 1200, true, true, true, NOW() - INTERVAL '85 days'),
  ('eeee2222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'Coastal Support Bot', 'chat', NULL, NULL, 'You are Coastal County support bot. Provide information about county services and programs.', 'gpt-4o-mini', 0.5, 600, true, true, true, NOW() - INTERVAL '80 days')
ON CONFLICT (id) DO UPDATE SET
  friendly_name = EXCLUDED.friendly_name;

-- ============================================================================
-- 3. CONVERSATIONS (voice and chat with various outcomes)
-- ============================================================================

-- Generate 200+ conversations across organizations
DO $$
DECLARE
  org_ids UUID[] := ARRAY[
    '11111111-1111-1111-1111-111111111111'::UUID,
    '22222222-2222-2222-2222-222222222222'::UUID,
    '33333333-3333-3333-3333-333333333333'::UUID,
    '44444444-4444-4444-4444-444444444444'::UUID,
    '55555555-5555-5555-5555-555555555555'::UUID
  ];
  assistant_ids UUID[] := ARRAY[
    'aaaa1111-1111-1111-1111-111111111111'::UUID,
    'aaaa2222-2222-2222-2222-222222222222'::UUID,
    'bbbb1111-1111-1111-1111-111111111111'::UUID,
    'bbbb2222-2222-2222-2222-222222222222'::UUID,
    'cccc1111-1111-1111-1111-111111111111'::UUID,
    'dddd1111-1111-1111-1111-111111111111'::UUID,
    'eeee1111-1111-1111-1111-111111111111'::UUID,
    'eeee2222-2222-2222-2222-222222222222'::UUID
  ];
  org_for_assistant UUID[] := ARRAY[
    '11111111-1111-1111-1111-111111111111'::UUID,
    '11111111-1111-1111-1111-111111111111'::UUID,
    '22222222-2222-2222-2222-222222222222'::UUID,
    '22222222-2222-2222-2222-222222222222'::UUID,
    '33333333-3333-3333-3333-333333333333'::UUID,
    '44444444-4444-4444-4444-444444444444'::UUID,
    '55555555-5555-5555-5555-555555555555'::UUID,
    '55555555-5555-5555-5555-555555555555'::UUID
  ];
  is_voice_assistant BOOLEAN[] := ARRAY[true, false, true, false, true, false, true, false];
  end_reasons TEXT[] := ARRAY['completed', 'completed', 'completed', 'timeout', 'hangup', 'error'];
  i INTEGER;
  j INTEGER;
  conv_id UUID;
  assistant_idx INTEGER;
  days_ago INTEGER;
  hour_of_day INTEGER;
  duration_sec INTEGER;
  is_voice BOOLEAN;
  score NUMERIC;
  gpt_cost NUMERIC;
  whisper_cost NUMERIC;
  elevenlabs_cost NUMERIC;
  twilio_cost NUMERIC;
  total_cost NUMERIC;
  channel_val TEXT;
BEGIN
  FOR i IN 1..250 LOOP
    conv_id := gen_random_uuid();
    assistant_idx := (i % 8) + 1;
    days_ago := (random() * 89)::INTEGER;
    hour_of_day := 8 + (random() * 10)::INTEGER; -- 8 AM to 6 PM
    is_voice := is_voice_assistant[assistant_idx];
    duration_sec := CASE WHEN is_voice THEN 60 + (random() * 300)::INTEGER ELSE 30 + (random() * 120)::INTEGER END;
    score := 50 + (random() * 50);
    channel_val := CASE WHEN is_voice THEN 'voice' ELSE 'chat' END;

    -- Calculate costs
    gpt_cost := 0.001 + (random() * 0.02);
    whisper_cost := CASE WHEN is_voice THEN 0.0005 + (random() * 0.005) ELSE 0 END;
    elevenlabs_cost := CASE WHEN is_voice THEN 0.002 + (random() * 0.01) ELSE 0 END;
    twilio_cost := CASE WHEN is_voice THEN 0.01 + (random() * 0.05) ELSE 0 END;
    total_cost := gpt_cost + whisper_cost + elevenlabs_cost + twilio_cost;

    INSERT INTO conversations (
      id, org_id, assistant_id, session_id, channel,
      started_at, ended_at, duration_seconds,
      gpt_cost, whisper_cost, elevenlabs_cost, twilio_cost, total_cost,
      tokens_in, tokens_out, overall_score,
      end_reason, success, scored,
      created_at, updated_at
    ) VALUES (
      conv_id,
      org_for_assistant[assistant_idx],
      assistant_ids[assistant_idx],
      'session_' || i || '_' || substr(md5(random()::text), 1, 8),
      channel_val::channel_type,
      NOW() - (days_ago || ' days')::INTERVAL + (hour_of_day || ' hours')::INTERVAL,
      NOW() - (days_ago || ' days')::INTERVAL + (hour_of_day || ' hours')::INTERVAL + (duration_sec || ' seconds')::INTERVAL,
      duration_sec,
      gpt_cost, whisper_cost, elevenlabs_cost, twilio_cost, total_cost,
      100 + (random() * 500)::INTEGER, -- tokens_in
      50 + (random() * 300)::INTEGER,  -- tokens_out
      score::INTEGER,
      end_reasons[1 + (random() * 5)::INTEGER],
      random() > 0.15, -- 85% success rate
      true,
      NOW() - (days_ago || ' days')::INTERVAL,
      NOW() - (days_ago || ' days')::INTERVAL
    )
    ON CONFLICT (id) DO NOTHING;

    -- Add conversation messages (2-6 per conversation)
    FOR j IN 1..(2 + (random() * 4)::INTEGER) LOOP
      INSERT INTO conversation_messages (
        id, conversation_id, role, content, latency_ms, timestamp
      ) VALUES (
        gen_random_uuid(),
        conv_id,
        CASE WHEN j % 2 = 1 THEN 'user' ELSE 'assistant' END,
        CASE
          WHEN j % 2 = 1 THEN
            (ARRAY['How do I apply for a permit?', 'What are your office hours?', 'I need help with my utility bill', 'Can you explain the zoning regulations?', 'How do I register for a program?', 'I have a complaint about noise', 'What documents do I need for license renewal?', 'Can you help with property taxes?'])[1 + (random() * 7)::INTEGER]
          ELSE
            'I can help you with that. ' || (ARRAY['Let me provide the information you need.', 'Here are the steps to follow.', 'I will guide you through the process.', 'Please note the following details.'])[1 + (random() * 3)::INTEGER]
        END,
        100 + (random() * 2000)::INTEGER,
        NOW() - (days_ago || ' days')::INTERVAL + ((j * 30) || ' seconds')::INTERVAL
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 4. INTERACTION LOGS (for billing)
-- Note: conversation_id references chat_conversations table, so we skip it
-- ============================================================================

INSERT INTO interaction_logs (id, org_id, assistant_id, interaction_type, duration_seconds, message_count, cost, billing_period_start, billing_period_end, created_at)
SELECT
  gen_random_uuid(),
  sub.org_id,
  sub.assistant_id,
  CASE
    WHEN sub.channel = 'voice' AND random() < 0.7 THEN 'call_inbound'
    WHEN sub.channel = 'voice' THEN 'call_outbound'
    WHEN random() < 0.8 THEN 'chat_session'
    WHEN random() < 0.5 THEN 'sms_inbound'
    ELSE 'sms_outbound'
  END,
  sub.duration_seconds,
  2 + (random() * 8)::INTEGER,
  sub.total_cost,
  DATE_TRUNC('month', sub.created_at)::DATE,
  (DATE_TRUNC('month', sub.created_at) + INTERVAL '1 month')::DATE,
  sub.created_at
FROM (
  SELECT c.org_id, c.assistant_id, c.channel::TEXT, c.duration_seconds, c.total_cost, c.created_at
  FROM conversations c
  LIMIT 250
) sub;

-- ============================================================================
-- 5. KNOWLEDGE CHUNKS (for KB search)
-- ============================================================================

INSERT INTO knowledge_chunks (id, org_id, tenant_id, heading, content, source_file, created_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'greenfield', 'Building Permits', 'To apply for a building permit, visit our office at 123 Main St or apply online through our portal. Required documents include site plans, construction drawings, and proof of contractor license. Processing time is typically 5-10 business days.', 'permits-guide.pdf', NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'greenfield', 'Office Hours', 'Greenfield City Council offices are open Monday through Friday, 8:00 AM to 5:00 PM. We are closed on weekends and federal holidays. For after-hours emergencies, call our emergency line at 555-0199.', 'general-info.txt', NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'riverside', 'Utility Billing', 'Pay your utility bills online at riverside.gov/pay, by phone at 555-0200, or by mail. Automatic payment plans are available. Bills are due on the 15th of each month. Late fees of 5% apply after 30 days.', 'billing-faq.pdf', NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'lakewood', 'Zoning Regulations', 'Lakewood Township zoning is divided into residential, commercial, and industrial zones. Home-based businesses require a special use permit. Contact the zoning office for specific questions about your property.', 'zoning-guide.pdf', NOW() - INTERVAL '20 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'coastal', 'Business Licensing', 'All businesses operating in Coastal County require a valid business license. Licenses must be renewed annually by December 31. Fees vary based on business type and revenue. Apply online or in person.', 'business-license.pdf', NOW() - INTERVAL '60 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. OUTBOUND CAMPAIGNS (sample campaigns)
-- ============================================================================

INSERT INTO outbound_campaigns (id, org_id, assistant_id, name, status, total_contacts, contacted, successful, failed, call_hours_start, call_hours_end, timezone, max_concurrent_calls, created_at)
VALUES
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbb1111-1111-1111-1111-111111111111', 'Utility Payment Reminder', 'completed', 500, 485, 412, 73, '09:00', '17:00', 'America/Los_Angeles', 5, NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'eeee1111-1111-1111-1111-111111111111', 'License Renewal Outreach', 'active', 1200, 650, 520, 130, '08:00', '18:00', 'America/New_York', 10, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111', 'Community Event Invitations', 'paused', 300, 120, 95, 25, '10:00', '16:00', 'America/Chicago', 3, NOW() - INTERVAL '10 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 7. UPDATE STATISTICS
-- ============================================================================

-- Update organization interaction counts based on actual conversations
UPDATE organizations o
SET
  current_period_interactions = COALESCE((
    SELECT COUNT(*) FROM conversations c
    WHERE c.org_id = o.id
    AND c.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  ), 0),
  total_interactions = COALESCE((
    SELECT COUNT(*) FROM conversations c WHERE c.org_id = o.id
  ), 0);

-- ============================================================================
-- VERIFICATION QUERIES (run these to verify data)
-- ============================================================================

-- Check organization counts
SELECT 'Organizations' as table_name, COUNT(*) as count FROM organizations;

-- Check assistant counts
SELECT 'Assistants' as table_name, COUNT(*) as count FROM assistants;

-- Check conversation counts by org
SELECT o.name, COUNT(c.id) as conversations,
       SUM(CASE WHEN c.channel = 'voice' THEN 1 ELSE 0 END) as voice_calls,
       SUM(CASE WHEN c.channel = 'chat' THEN 1 ELSE 0 END) as chat_sessions,
       ROUND(AVG(c.overall_score)::numeric, 1) as avg_score,
       ROUND(SUM(c.total_cost)::numeric, 2) as total_cost
FROM organizations o
LEFT JOIN conversations c ON c.org_id = o.id
GROUP BY o.name
ORDER BY conversations DESC;

-- Check interaction log distribution
SELECT interaction_type, COUNT(*) as count, ROUND(SUM(cost)::numeric, 2) as total_cost
FROM interaction_logs
GROUP BY interaction_type
ORDER BY count DESC;

-- Check billing summary by org
SELECT
  o.name,
  o.flat_rate_fee,
  o.included_interactions,
  o.current_period_interactions,
  GREATEST(0, o.current_period_interactions - o.included_interactions) as overage,
  CASE
    WHEN o.current_period_interactions > o.included_interactions
    THEN o.flat_rate_fee + CEIL((o.current_period_interactions - o.included_interactions)::DECIMAL / 1000) * o.overage_rate_per_1000
    ELSE o.flat_rate_fee
  END as total_bill
FROM organizations o
ORDER BY total_bill DESC;

-- Check campaigns
SELECT name, status, total_contacts, contacted, successful, failed
FROM outbound_campaigns
ORDER BY created_at DESC;

-- Success message
SELECT 'Test data seeded successfully! Check the tables above for verification.' as status;
