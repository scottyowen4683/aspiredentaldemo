-- ============================================================================
-- ASPIRE AI PLATFORM - TEST DATA SEED SCRIPT
-- Based on actual database schema as of Jan 2026
-- Run this in your Supabase SQL Editor to populate test data
-- ============================================================================

-- ============================================================================
-- 1. ORGANIZATIONS (with billing tiers)
-- Columns: id, name, slug, contact_email, contact_phone, billing_email,
--          monthly_interaction_limit, price_per_interaction, settings, active,
--          created_at, updated_at, flat_rate_fee, included_interactions,
--          overage_rate_per_1000, current_period_start, current_period_end,
--          current_period_interactions, total_interactions
-- ============================================================================

INSERT INTO organizations (
  id, name, slug, contact_email, billing_email,
  monthly_interaction_limit, price_per_interaction,
  flat_rate_fee, included_interactions, overage_rate_per_1000,
  current_period_start, current_period_end,
  current_period_interactions, total_interactions,
  active, created_at
)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Greenfield City Council', 'greenfield', 'admin@greenfield.gov', 'billing@greenfield.gov', 5000, 0.50, 2500.00, 5000, 45.00, CURRENT_DATE - 15, CURRENT_DATE + 15, 3250, 12500, true, NOW() - INTERVAL '60 days'),
  ('22222222-2222-2222-2222-222222222222', 'Riverside Municipality', 'riverside', 'admin@riverside.gov', 'billing@riverside.gov', 12000, 0.45, 5000.00, 12000, 40.00, CURRENT_DATE - 15, CURRENT_DATE + 15, 9500, 35000, true, NOW() - INTERVAL '45 days'),
  ('33333333-3333-3333-3333-333333333333', 'Lakewood Township', 'lakewood', 'admin@lakewood.gov', 'billing@lakewood.gov', 3000, 0.55, 1500.00, 3000, 50.00, CURRENT_DATE - 15, CURRENT_DATE + 15, 3800, 8500, true, NOW() - INTERVAL '30 days'),
  ('44444444-4444-4444-4444-444444444444', 'Mountain View District', 'mountainview', 'admin@mountainview.gov', 'billing@mountainview.gov', 8000, 0.48, 3500.00, 8000, 42.00, CURRENT_DATE - 15, CURRENT_DATE + 15, 6200, 18000, true, NOW() - INTERVAL '20 days'),
  ('55555555-5555-5555-5555-555555555555', 'Coastal County Admin', 'coastal', 'admin@coastal.gov', 'billing@coastal.gov', 20000, 0.40, 7500.00, 20000, 35.00, CURRENT_DATE - 15, CURRENT_DATE + 15, 15000, 62000, true, NOW() - INTERVAL '90 days')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  current_period_interactions = EXCLUDED.current_period_interactions,
  total_interactions = EXCLUDED.total_interactions;

-- ============================================================================
-- 2. ASSISTANTS (voice and chat)
-- Columns: id, org_id, friendly_name, bot_type, active, phone_number,
--          elevenlabs_voice_id, widget_config, prompt, model, temperature,
--          max_tokens, kb_enabled, kb_match_count, total_interactions,
--          avg_interaction_time, performance_rank, auto_score, created_at, updated_at
-- ============================================================================

INSERT INTO assistants (
  id, org_id, friendly_name, bot_type, phone_number, elevenlabs_voice_id,
  prompt, model, temperature, max_tokens,
  kb_enabled, kb_match_count, total_interactions, avg_interaction_time, performance_rank,
  auto_score, active, created_at
)
VALUES
  -- Greenfield assistants
  ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Greenfield General Inquiries', 'voice', '+14155551001', '21m00Tcm4TlvDq8ikWAM', 'You are a helpful assistant for Greenfield City Council. Help residents with general inquiries about city services, permits, and events.', 'gpt-4o-mini', 0.7, 800, true, 5, 2500, 180, 1, true, true, NOW() - INTERVAL '55 days'),
  ('aaaa2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Greenfield Web Chat', 'chat', NULL, NULL, 'You are the Greenfield City Council web assistant. Help visitors find information and answer questions.', 'gpt-4o-mini', 0.5, 600, true, 5, 1800, 120, 2, true, true, NOW() - INTERVAL '50 days'),

  -- Riverside assistants
  ('bbbb1111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Riverside Customer Service', 'voice', '+14155552001', 'ErXwobaYiN019PkySvjV', 'You are the Riverside Municipality customer service assistant. Help with utility bills, permits, and municipal services.', 'gpt-4o-mini', 0.6, 1000, true, 5, 4200, 210, 1, true, true, NOW() - INTERVAL '40 days'),
  ('bbbb2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Riverside Chat Support', 'chat', NULL, NULL, 'You are the Riverside chat support bot. Provide quick answers about municipal services.', 'gpt-4o-mini', 0.5, 500, true, 5, 3100, 90, 2, true, true, NOW() - INTERVAL '38 days'),

  -- Lakewood assistants
  ('cccc1111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Lakewood Info Line', 'voice', '+14155553001', 'TxGEqnHWrfWFTfGW9XjX', 'You are Lakewood Township information line. Help with zoning, permits, and township services.', 'gpt-4o-mini', 0.7, 800, true, 5, 1500, 195, 1, true, true, NOW() - INTERVAL '25 days'),

  -- Mountain View assistants
  ('dddd1111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'Mountain View Assistant', 'chat', NULL, NULL, 'You are the Mountain View District virtual assistant. Help with all district services.', 'gpt-4o-mini', 0.6, 700, true, 5, 2800, 105, 1, true, true, NOW() - INTERVAL '15 days'),

  -- Coastal assistants
  ('eeee1111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 'Coastal County Hotline', 'voice', '+14155555001', 'onwK4e9ZLuTAKqWW03F9', 'You are Coastal County Admin hotline. Assist with county services, taxes, and administration.', 'gpt-4o-mini', 0.5, 1200, true, 5, 8500, 240, 1, true, true, NOW() - INTERVAL '85 days'),
  ('eeee2222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'Coastal Support Bot', 'chat', NULL, NULL, 'You are Coastal County support bot. Provide information about county services and programs.', 'gpt-4o-mini', 0.5, 600, true, 5, 6200, 85, 2, true, true, NOW() - INTERVAL '80 days')
ON CONFLICT (id) DO UPDATE SET
  friendly_name = EXCLUDED.friendly_name,
  total_interactions = EXCLUDED.total_interactions;

-- ============================================================================
-- 3. CONVERSATIONS (voice and chat with various outcomes)
-- Columns: id, org_id, assistant_id, session_id, channel, started_at, ended_at,
--          duration_seconds, transcript, transcript_text, whisper_cost, gpt_cost,
--          elevenlabs_cost, twilio_cost, total_cost, tokens_in, tokens_out,
--          end_reason, success, scored, overall_score, score_details,
--          customer_name, customer_email, customer_phone, metadata, created_at, updated_at
-- ============================================================================

DO $$
DECLARE
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
  customer_names TEXT[] := ARRAY['John Smith', 'Jane Doe', 'Bob Wilson', 'Alice Brown', 'Charlie Davis', 'Diana Miller', 'Edward Jones', 'Fiona Garcia'];
  i INTEGER;
  j INTEGER;
  conv_id UUID;
  assistant_idx INTEGER;
  days_ago INTEGER;
  hour_of_day INTEGER;
  duration_sec INTEGER;
  is_voice BOOLEAN;
  score INTEGER;
  gpt_cost NUMERIC;
  whisper_cost NUMERIC;
  elevenlabs_cost NUMERIC;
  twilio_cost NUMERIC;
  total_cost NUMERIC;
  channel_val TEXT;
  conv_timestamp TIMESTAMPTZ;
BEGIN
  FOR i IN 1..250 LOOP
    conv_id := gen_random_uuid();
    assistant_idx := (i % 8) + 1;
    days_ago := (random() * 89)::INTEGER;
    hour_of_day := 8 + (random() * 10)::INTEGER;
    is_voice := is_voice_assistant[assistant_idx];
    duration_sec := CASE WHEN is_voice THEN 60 + (random() * 300)::INTEGER ELSE 30 + (random() * 120)::INTEGER END;
    score := 50 + (random() * 50)::INTEGER;
    channel_val := CASE WHEN is_voice THEN 'voice' ELSE 'chat' END;
    conv_timestamp := NOW() - (days_ago || ' days')::INTERVAL + (hour_of_day || ' hours')::INTERVAL;

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
      customer_name,
      created_at, updated_at
    ) VALUES (
      conv_id,
      org_for_assistant[assistant_idx],
      assistant_ids[assistant_idx],
      'session_' || i || '_' || substr(md5(random()::text), 1, 8),
      channel_val::channel_type,
      conv_timestamp,
      conv_timestamp + (duration_sec || ' seconds')::INTERVAL,
      duration_sec,
      gpt_cost, whisper_cost, elevenlabs_cost, twilio_cost, total_cost,
      100 + (random() * 500)::INTEGER,
      50 + (random() * 300)::INTEGER,
      score,
      end_reasons[1 + (random() * 5)::INTEGER],
      random() > 0.15,
      true,
      customer_names[1 + (random() * 7)::INTEGER],
      conv_timestamp,
      conv_timestamp
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
        conv_timestamp + ((j * 30) || ' seconds')::INTERVAL
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- 4. INTERACTION LOGS (for billing)
-- Columns: id, org_id, assistant_id, interaction_type, conversation_id,
--          session_id, contact_number, duration_seconds, message_count, cost,
--          campaign_id, billing_period_start (NOT NULL), billing_period_end (NOT NULL), created_at
-- Note: Skipping conversation_id due to FK constraint to chat_conversations
-- ============================================================================

INSERT INTO interaction_logs (
  id, org_id, assistant_id, interaction_type,
  session_id, duration_seconds, message_count, cost,
  billing_period_start, billing_period_end, created_at
)
SELECT
  gen_random_uuid(),
  c.org_id,
  c.assistant_id,
  CASE
    WHEN c.channel = 'voice' AND random() < 0.7 THEN 'call_inbound'
    WHEN c.channel = 'voice' THEN 'call_outbound'
    WHEN random() < 0.8 THEN 'chat_session'
    WHEN random() < 0.5 THEN 'sms_inbound'
    ELSE 'sms_outbound'
  END,
  c.session_id,
  c.duration_seconds,
  2 + (random() * 8)::INTEGER,
  c.total_cost,
  DATE_TRUNC('month', c.created_at)::DATE,
  (DATE_TRUNC('month', c.created_at) + INTERVAL '1 month')::DATE,
  c.created_at
FROM conversations c
LIMIT 250;

-- ============================================================================
-- 5. OUTBOUND CAMPAIGNS (sample campaigns)
-- Columns: id, org_id, name, description, assistant_id, status,
--          total_contacts, contacted, successful, failed,
--          start_date, end_date, call_hours_start, call_hours_end, timezone,
--          max_concurrent_calls, calls_per_minute, created_at, updated_at, created_by
-- ============================================================================

INSERT INTO outbound_campaigns (
  id, org_id, assistant_id, name, description, status,
  total_contacts, contacted, successful, failed,
  call_hours_start, call_hours_end, timezone, max_concurrent_calls,
  created_at
)
VALUES
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbb1111-1111-1111-1111-111111111111', 'Utility Payment Reminder', 'Automated calls to remind residents about upcoming utility payments', 'completed', 500, 485, 412, 73, '09:00', '17:00', 'America/Los_Angeles', 5, NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'eeee1111-1111-1111-1111-111111111111', 'License Renewal Outreach', 'Proactive outreach for business license renewals', 'active', 1200, 650, 520, 130, '08:00', '18:00', 'America/New_York', 10, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111', 'Community Event Invitations', 'Inviting residents to upcoming community events', 'paused', 300, 120, 95, 25, '10:00', '16:00', 'America/Chicago', 3, NOW() - INTERVAL '10 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. UPDATE STATISTICS
-- ============================================================================

-- Update organization interaction counts based on actual conversations
UPDATE organizations o
SET
  current_period_interactions = COALESCE((
    SELECT COUNT(*) FROM conversations c
    WHERE c.org_id = o.id
    AND c.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  ), 0) + COALESCE(o.current_period_interactions, 0),
  total_interactions = COALESCE((
    SELECT COUNT(*) FROM conversations c WHERE c.org_id = o.id
  ), 0) + COALESCE(o.total_interactions, 0);

-- ============================================================================
-- VERIFICATION QUERIES (run these to verify data)
-- ============================================================================

-- Check organization counts and billing
SELECT
  o.name,
  o.flat_rate_fee,
  o.included_interactions,
  o.current_period_interactions,
  GREATEST(0, o.current_period_interactions - o.included_interactions) as overage_interactions,
  CASE
    WHEN o.current_period_interactions > o.included_interactions
    THEN o.flat_rate_fee + CEIL((o.current_period_interactions - o.included_interactions)::DECIMAL / 1000) * o.overage_rate_per_1000
    ELSE o.flat_rate_fee
  END as total_bill
FROM organizations o
ORDER BY total_bill DESC;

-- Check assistant stats
SELECT
  a.friendly_name,
  a.bot_type,
  a.total_interactions,
  a.avg_interaction_time,
  o.name as organization
FROM assistants a
JOIN organizations o ON a.org_id = o.id
ORDER BY a.total_interactions DESC;

-- Check conversation counts by org
SELECT
  o.name,
  COUNT(c.id) as conversations,
  SUM(CASE WHEN c.channel = 'voice' THEN 1 ELSE 0 END) as voice_calls,
  SUM(CASE WHEN c.channel = 'chat' THEN 1 ELSE 0 END) as chat_sessions,
  ROUND(AVG(c.overall_score)::numeric, 1) as avg_score,
  ROUND(SUM(c.total_cost)::numeric, 2) as total_cost
FROM organizations o
LEFT JOIN conversations c ON c.org_id = o.id
GROUP BY o.name
ORDER BY conversations DESC;

-- Check interaction log distribution
SELECT
  interaction_type,
  COUNT(*) as count,
  ROUND(SUM(cost)::numeric, 2) as total_cost
FROM interaction_logs
GROUP BY interaction_type
ORDER BY count DESC;

-- Check campaigns
SELECT name, status, total_contacts, contacted, successful, failed
FROM outbound_campaigns
ORDER BY created_at DESC;

-- Success message
SELECT 'Test data seeded successfully!' as status;
