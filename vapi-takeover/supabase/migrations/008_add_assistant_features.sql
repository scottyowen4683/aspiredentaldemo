-- Migration: Add assistant features (call transfer, SMS, email, prompt settings)
-- This enables per-assistant configuration of advanced features

-- Prompt settings
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS use_default_prompt BOOLEAN DEFAULT true;

-- Call transfer feature
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS call_transfer_enabled BOOLEAN DEFAULT false;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS call_transfer_number TEXT;

-- SMS notification feature
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN DEFAULT false;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS sms_notification_number TEXT;

-- Email notification feature (per-assistant override)
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS email_notification_address TEXT;

-- Add comments for documentation
COMMENT ON COLUMN assistants.use_default_prompt IS 'If true, uses universal prompt from system_settings. If false, uses custom prompt field.';
COMMENT ON COLUMN assistants.call_transfer_enabled IS 'Enable call transfer capability for this assistant';
COMMENT ON COLUMN assistants.call_transfer_number IS 'Phone number to transfer calls to when requested';
COMMENT ON COLUMN assistants.sms_enabled IS 'Enable SMS sending capability for this assistant';
COMMENT ON COLUMN assistants.sms_notification_number IS 'Phone number to send SMS notifications to';
COMMENT ON COLUMN assistants.email_notifications_enabled IS 'Enable email notifications for contact requests';
COMMENT ON COLUMN assistants.email_notification_address IS 'Email address for notifications (overrides org default)';

-- Ensure system_settings has a default row for universal prompt
INSERT INTO system_settings (id, universal_system_prompt, updated_at)
VALUES (1, 'You are a helpful, professional AI assistant. Always be courteous, accurate, and helpful. Use only the information provided in your knowledge base to answer questions. If you don''t have the information, say so honestly and offer to help connect the caller with someone who can assist.', NOW())
ON CONFLICT (id) DO NOTHING;
