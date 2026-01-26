-- ============================================================================
-- ASPIRE AI PLATFORM - TEST DATA SEED SCRIPT
-- Run this in your Supabase SQL Editor to populate test data
-- ============================================================================

-- Clear existing test data (optional - uncomment if you want fresh start)
-- DELETE FROM conversation_scores;
-- DELETE FROM review_queue;
-- DELETE FROM conversation_messages;
-- DELETE FROM conversations;
-- DELETE FROM interaction_logs;
-- DELETE FROM knowledge_chunks;
-- DELETE FROM campaign_contacts;
-- DELETE FROM outbound_campaigns;
-- DELETE FROM resident_questions;
-- DELETE FROM assistants;
-- DELETE FROM organizations WHERE name LIKE 'Test%' OR name LIKE 'Demo%';

-- ============================================================================
-- 1. ORGANIZATIONS (with billing tiers)
-- ============================================================================

INSERT INTO organizations (id, name, slug, flat_rate_fee, included_interactions, overage_rate_per_1000, monthly_service_fee, baseline_human_cost_per_call, current_period_interactions, status, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Greenfield City Council', 'greenfield', 2500.00, 5000, 45.00, 2500.00, 7.50, 3250, 'active', NOW() - INTERVAL '60 days'),
  ('22222222-2222-2222-2222-222222222222', 'Riverside Municipality', 'riverside', 5000.00, 12000, 40.00, 5000.00, 8.00, 9500, 'active', NOW() - INTERVAL '45 days'),
  ('33333333-3333-3333-3333-333333333333', 'Lakewood Township', 'lakewood', 1500.00, 3000, 50.00, 1500.00, 7.00, 3800, 'active', NOW() - INTERVAL '30 days'),
  ('44444444-4444-4444-4444-444444444444', 'Mountain View District', 'mountainview', 3500.00, 8000, 42.00, 3500.00, 7.50, 6200, 'active', NOW() - INTERVAL '20 days'),
  ('55555555-5555-5555-5555-555555555555', 'Coastal County Admin', 'coastal', 7500.00, 20000, 35.00, 7500.00, 9.00, 15000, 'active', NOW() - INTERVAL '90 days')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  current_period_interactions = EXCLUDED.current_period_interactions;

-- ============================================================================
-- 2. ASSISTANTS (voice and chat)
-- ============================================================================

INSERT INTO assistants (id, org_id, friendly_name, assistant_type, phone_number, elevenlabs_voice_id, prompt, model, temperature, max_tokens, kb_enabled, auto_score, active, created_at)
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
  sentiments TEXT[] := ARRAY['positive', 'neutral', 'negative', 'positive', 'neutral'];
  end_reasons TEXT[] := ARRAY['completed', 'completed', 'completed', 'escalated', 'timeout', 'hangup'];
  i INTEGER;
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
  was_escalated BOOLEAN;
BEGIN
  FOR i IN 1..250 LOOP
    conv_id := gen_random_uuid();
    assistant_idx := (i % 8) + 1;
    days_ago := (random() * 89)::INTEGER;
    hour_of_day := 8 + (random() * 10)::INTEGER; -- 8 AM to 6 PM
    is_voice := is_voice_assistant[assistant_idx];
    duration_sec := CASE WHEN is_voice THEN 60 + (random() * 300)::INTEGER ELSE 30 + (random() * 120)::INTEGER END;
    score := 50 + (random() * 50);
    was_escalated := random() < 0.15; -- 15% escalation rate

    -- Calculate costs
    gpt_cost := 0.001 + (random() * 0.02);
    whisper_cost := CASE WHEN is_voice THEN 0.0005 + (random() * 0.005) ELSE 0 END;
    elevenlabs_cost := CASE WHEN is_voice THEN 0.002 + (random() * 0.01) ELSE 0 END;
    twilio_cost := CASE WHEN is_voice THEN 0.01 + (random() * 0.05) ELSE 0 END;
    total_cost := gpt_cost + whisper_cost + elevenlabs_cost + twilio_cost;

    INSERT INTO conversations (
      id, org_id, assistant_id, session_id, channel,
      started_at, ended_at, call_duration,
      gpt_cost, whisper_cost, elevenlabs_cost, twilio_cost, total_cost,
      tokens_in, tokens_out, overall_score, confidence_score,
      escalation, end_reason, sentiment, is_voice, scored,
      created_at, updated_at
    ) VALUES (
      conv_id,
      org_for_assistant[assistant_idx],
      assistant_ids[assistant_idx],
      'session_' || i || '_' || substr(md5(random()::text), 1, 8),
      CASE WHEN is_voice THEN 'voice' ELSE 'chat' END,
      NOW() - (days_ago || ' days')::INTERVAL + (hour_of_day || ' hours')::INTERVAL,
      NOW() - (days_ago || ' days')::INTERVAL + (hour_of_day || ' hours')::INTERVAL + (duration_sec || ' seconds')::INTERVAL,
      duration_sec,
      gpt_cost, whisper_cost, elevenlabs_cost, twilio_cost, total_cost,
      100 + (random() * 500)::INTEGER, -- tokens_in
      50 + (random() * 300)::INTEGER,  -- tokens_out
      score,
      70 + (random() * 25), -- confidence
      was_escalated,
      end_reasons[1 + (random() * 5)::INTEGER],
      sentiments[1 + (random() * 4)::INTEGER],
      is_voice,
      true,
      NOW() - (days_ago || ' days')::INTERVAL,
      NOW() - (days_ago || ' days')::INTERVAL
    )
    ON CONFLICT (id) DO NOTHING;

    -- Add conversation messages (2-6 per conversation)
    FOR j IN 1..(2 + (random() * 4)::INTEGER) LOOP
      INSERT INTO conversation_messages (
        id, conversation_id, role, content, latency_ms, created_at
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
-- 4. CONVERSATION SCORES (with flags for deferrals)
-- ============================================================================

INSERT INTO conversation_scores (id, conversation_id, overall_score, dimension_scores, flags, sentiment, feedback, resident_intent, created_at)
SELECT
  gen_random_uuid(),
  sub.id,
  sub.overall_score,
  jsonb_build_object(
    'governance', 70 + (random() * 30),
    'accuracy', 65 + (random() * 35),
    'quality', 70 + (random() * 30),
    'resolution', 60 + (random() * 40),
    'accountability', 75 + (random() * 25)
  ),
  -- Flags for escalated conversations
  CASE
    WHEN sub.escalation = true THEN
      jsonb_build_object(
        (ARRAY['requires_escalation', 'policy_violation', 'privacy_breach', 'resident_complaint', 'incomplete_resolution', 'compliance_risk', 'technical_limitation', 'customer_request', 'low_confidence', 'billing_dispute'])[1 + (random() * 9)::INTEGER],
        true
      )
    WHEN sub.overall_score < 70 THEN
      jsonb_build_object(
        (ARRAY['low_confidence', 'incomplete_resolution', 'requires_escalation'])[1 + (random() * 2)::INTEGER],
        true
      )
    ELSE '{}'::jsonb
  END,
  sub.sentiment,
  CASE
    WHEN sub.overall_score >= 90 THEN 'Excellent interaction. Resident query fully resolved.'
    WHEN sub.overall_score >= 80 THEN 'Good interaction with satisfactory resolution.'
    WHEN sub.overall_score >= 70 THEN 'Acceptable interaction. Some areas for improvement.'
    ELSE 'Interaction needs review. Consider additional training.'
  END,
  (ARRAY['permit_inquiry', 'billing_question', 'service_request', 'complaint', 'information_request', 'appointment_booking', 'document_request', 'general_inquiry'])[1 + (random() * 7)::INTEGER],
  sub.created_at
FROM (
  SELECT c.id, c.overall_score, c.escalation, c.sentiment, c.created_at
  FROM conversations c
  WHERE NOT EXISTS (SELECT 1 FROM conversation_scores cs WHERE cs.conversation_id = c.id)
  LIMIT 200
) sub;

-- ============================================================================
-- 5. REVIEW QUEUE (flagged conversations)
-- ============================================================================

INSERT INTO review_queue (id, org_id, conversation_id, flag_reason, urgency, reviewed, reviewer_id, reviewed_at, notes, created_at)
SELECT
  gen_random_uuid(),
  sub.org_id,
  sub.id,
  (ARRAY['Low confidence score', 'Policy violation detected', 'Customer complaint', 'Requires escalation', 'Privacy concern', 'Incomplete resolution', 'Compliance issue', 'Billing dispute'])[1 + (random() * 7)::INTEGER],
  (ARRAY['low', 'medium', 'high', 'critical'])[1 + (random() * 3)::INTEGER],
  random() < 0.6, -- 60% reviewed
  NULL,
  CASE WHEN random() < 0.6 THEN NOW() - ((random() * 5)::INTEGER || ' days')::INTERVAL ELSE NULL END,
  CASE WHEN random() < 0.6 THEN 'Reviewed and addressed.' ELSE NULL END,
  sub.created_at
FROM (
  SELECT c.id, c.org_id, c.created_at
  FROM conversations c
  WHERE c.escalation = true OR c.overall_score < 75
  LIMIT 50
) sub
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. INTERACTION LOGS (for billing)
-- ============================================================================

INSERT INTO interaction_logs (id, org_id, assistant_id, conversation_id, interaction_type, duration_seconds, message_count, cost, created_at)
SELECT
  gen_random_uuid(),
  sub.org_id,
  sub.assistant_id,
  sub.id,
  CASE
    WHEN sub.is_voice AND random() < 0.7 THEN 'call_inbound'
    WHEN sub.is_voice THEN 'call_outbound'
    WHEN random() < 0.8 THEN 'chat_session'
    WHEN random() < 0.5 THEN 'sms_inbound'
    ELSE 'sms_outbound'
  END,
  sub.call_duration,
  2 + (random() * 8)::INTEGER,
  sub.total_cost,
  sub.created_at
FROM (
  SELECT c.id, c.org_id, c.assistant_id, c.is_voice, c.call_duration, c.total_cost, c.created_at
  FROM conversations c
  WHERE NOT EXISTS (SELECT 1 FROM interaction_logs il WHERE il.conversation_id = c.id)
  LIMIT 250
) sub;

-- ============================================================================
-- 7. RESIDENT QUESTIONS (for Top 10 Questions)
-- ============================================================================

INSERT INTO resident_questions (id, org_id, assistant_id, intent, question_text, frequency, created_at)
VALUES
  -- Greenfield questions
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111', 'permit_inquiry', 'How do I apply for a building permit?', 145, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111', 'hours', 'What are your office hours?', 132, NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaa2222-2222-2222-2222-222222222222', 'billing', 'How can I pay my water bill online?', 98, NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaa2222-2222-2222-2222-222222222222', 'events', 'What events are happening this month?', 87, NOW() - INTERVAL '2 days'),

  -- Riverside questions
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbb1111-1111-1111-1111-111111111111', 'utility', 'How do I set up automatic bill pay?', 156, NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbb1111-1111-1111-1111-111111111111', 'service_request', 'How do I report a pothole?', 124, NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbb2222-2222-2222-2222-222222222222', 'permit', 'What permits do I need for a fence?', 89, NOW() - INTERVAL '1 day'),

  -- Lakewood questions
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'cccc1111-1111-1111-1111-111111111111', 'zoning', 'Can I run a business from home?', 78, NOW() - INTERVAL '8 days'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'cccc1111-1111-1111-1111-111111111111', 'tax', 'When are property taxes due?', 112, NOW() - INTERVAL '5 days'),

  -- Mountain View questions
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'dddd1111-1111-1111-1111-111111111111', 'registration', 'How do I register for recreation programs?', 95, NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', 'dddd1111-1111-1111-1111-111111111111', 'parking', 'Where can I get a parking permit?', 67, NOW() - INTERVAL '9 days'),

  -- Coastal questions
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'eeee1111-1111-1111-1111-111111111111', 'license', 'How do I renew my business license?', 189, NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'eeee1111-1111-1111-1111-111111111111', 'records', 'How can I request public records?', 134, NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'eeee2222-2222-2222-2222-222222222222', 'complaint', 'How do I file a noise complaint?', 76, NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'eeee2222-2222-2222-2222-222222222222', 'appointment', 'How do I schedule an appointment?', 145, NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 8. KNOWLEDGE CHUNKS (for KB search)
-- ============================================================================

INSERT INTO knowledge_chunks (id, org_id, heading, content, source_file, created_at)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Building Permits', 'To apply for a building permit, visit our office at 123 Main St or apply online through our portal. Required documents include site plans, construction drawings, and proof of contractor license. Processing time is typically 5-10 business days.', 'permits-guide.pdf', NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Office Hours', 'Greenfield City Council offices are open Monday through Friday, 8:00 AM to 5:00 PM. We are closed on weekends and federal holidays. For after-hours emergencies, call our emergency line at 555-0199.', 'general-info.txt', NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Utility Billing', 'Pay your utility bills online at riverside.gov/pay, by phone at 555-0200, or by mail. Automatic payment plans are available. Bills are due on the 15th of each month. Late fees of 5% apply after 30 days.', 'billing-faq.pdf', NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', 'Zoning Regulations', 'Lakewood Township zoning is divided into residential, commercial, and industrial zones. Home-based businesses require a special use permit. Contact the zoning office for specific questions about your property.', 'zoning-guide.pdf', NOW() - INTERVAL '20 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'Business Licensing', 'All businesses operating in Coastal County require a valid business license. Licenses must be renewed annually by December 31. Fees vary based on business type and revenue. Apply online or in person.', 'business-license.pdf', NOW() - INTERVAL '60 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 9. OUTBOUND CAMPAIGNS (sample campaigns)
-- ============================================================================

INSERT INTO outbound_campaigns (id, org_id, assistant_id, name, status, total_contacts, completed_contacts, successful_contacts, failed_contacts, call_hours_start, call_hours_end, timezone, max_concurrent_calls, created_at)
VALUES
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbb1111-1111-1111-1111-111111111111', 'Utility Payment Reminder', 'completed', 500, 485, 412, 73, '09:00', '17:00', 'America/Los_Angeles', 5, NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', 'eeee1111-1111-1111-1111-111111111111', 'License Renewal Outreach', 'active', 1200, 650, 520, 130, '08:00', '18:00', 'America/New_York', 10, NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111', 'Community Event Invitations', 'paused', 300, 120, 95, 25, '10:00', '16:00', 'America/Chicago', 3, NOW() - INTERVAL '10 days')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 10. UPDATE STATISTICS
-- ============================================================================

-- Update organization interaction counts
UPDATE organizations o
SET
  current_period_interactions = (
    SELECT COUNT(*) FROM conversations c
    WHERE c.org_id = o.id
    AND c.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  ),
  total_interactions = (
    SELECT COUNT(*) FROM conversations c WHERE c.org_id = o.id
  );

-- ============================================================================
-- VERIFICATION QUERIES (run these to verify data)
-- ============================================================================

-- Check organization counts
SELECT 'Organizations' as table_name, COUNT(*) as count FROM organizations;

-- Check assistant counts
SELECT 'Assistants' as table_name, COUNT(*) as count FROM assistants;

-- Check conversation counts by org
SELECT o.name, COUNT(c.id) as conversations,
       SUM(CASE WHEN c.is_voice THEN 1 ELSE 0 END) as voice_calls,
       SUM(CASE WHEN NOT c.is_voice THEN 1 ELSE 0 END) as chat_sessions,
       SUM(CASE WHEN c.escalation THEN 1 ELSE 0 END) as escalations,
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

-- Check review queue status
SELECT
  CASE WHEN reviewed THEN 'Reviewed' ELSE 'Pending' END as status,
  urgency,
  COUNT(*) as count
FROM review_queue
GROUP BY reviewed, urgency
ORDER BY reviewed, urgency;

-- Check top questions
SELECT org_id, question_text, frequency
FROM resident_questions
ORDER BY frequency DESC
LIMIT 10;

-- Success message
SELECT 'Test data seeded successfully! Check the tables above for verification.' as status;
