-- Migration: Add reviewed flag to conversations for Review Queue
-- This allows flagged conversations to be marked as reviewed/cleared

-- Add reviewed fields to voice conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Add reviewed fields to chat conversations
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT false;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Create indexes for reviewed queries
CREATE INDEX IF NOT EXISTS idx_conversations_reviewed ON conversations(reviewed);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_reviewed ON chat_conversations(reviewed);

-- Comments
COMMENT ON COLUMN conversations.reviewed IS 'Whether this flagged conversation has been reviewed by a human';
COMMENT ON COLUMN conversations.reviewed_at IS 'When the conversation was reviewed';
COMMENT ON COLUMN conversations.reviewed_by IS 'User ID who reviewed the conversation';
COMMENT ON COLUMN conversations.review_notes IS 'Notes from the reviewer';

COMMENT ON COLUMN chat_conversations.reviewed IS 'Whether this flagged conversation has been reviewed by a human';
COMMENT ON COLUMN chat_conversations.reviewed_at IS 'When the conversation was reviewed';
COMMENT ON COLUMN chat_conversations.reviewed_by IS 'User ID who reviewed the conversation';
COMMENT ON COLUMN chat_conversations.review_notes IS 'Notes from the reviewer';
