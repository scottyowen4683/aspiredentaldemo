-- Migration: Fix interaction_logs foreign key constraint
-- The conversation_id FK references chat_conversations but voice calls use conversations table
-- Solution: Drop the FK constraint to allow both chat and voice conversation IDs

-- Drop the existing foreign key constraint
ALTER TABLE interaction_logs
DROP CONSTRAINT IF EXISTS interaction_logs_conversation_id_fkey;

-- Also fix campaign_contacts which has the same issue
ALTER TABLE campaign_contacts
DROP CONSTRAINT IF EXISTS campaign_contacts_conversation_id_fkey;

-- Add comment explaining the change
COMMENT ON COLUMN interaction_logs.conversation_id IS 'Reference to conversation ID (from either conversations or chat_conversations table)';
COMMENT ON COLUMN campaign_contacts.conversation_id IS 'Reference to conversation ID (from either conversations or chat_conversations table)';
