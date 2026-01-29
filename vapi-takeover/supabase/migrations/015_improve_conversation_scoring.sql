-- Migration: Improve conversation scoring with KB tracking and simplified success
-- This adds fields for tracking KB usage and simplifies success evaluation

-- Add kb_used field to conversations table (for voice)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS kb_used BOOLEAN DEFAULT false;

-- Add sentiment field for easier querying
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sentiment TEXT;

-- Ensure success_evaluation is stored as boolean (extracted from scoring)
-- The full scoring details are in score_details JSONB
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS success_evaluation BOOLEAN;

-- Add kb_results_count to track how many KB results were available
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS kb_results_count INTEGER DEFAULT 0;

-- Add same fields to chat_conversations table
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS kb_used BOOLEAN DEFAULT false;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS success_evaluation BOOLEAN;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS kb_results_count INTEGER DEFAULT 0;

-- Add overall_score to chat_conversations if not exists (to match voice table)
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS overall_score INTEGER;

-- Add scored field to chat_conversations if not exists
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS scored BOOLEAN DEFAULT false;

-- Add score_details JSONB to chat_conversations for full scoring data
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS score_details JSONB;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_kb_used ON conversations(kb_used);
CREATE INDEX IF NOT EXISTS idx_conversations_sentiment ON conversations(sentiment);
CREATE INDEX IF NOT EXISTS idx_conversations_success_evaluation ON conversations(success_evaluation);
CREATE INDEX IF NOT EXISTS idx_conversations_scored ON conversations(scored);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_kb_used ON chat_conversations(kb_used);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_sentiment ON chat_conversations(sentiment);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_success_evaluation ON chat_conversations(success_evaluation);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_scored ON chat_conversations(scored);

-- Add comments
COMMENT ON COLUMN conversations.kb_used IS 'Whether knowledge base content was used in the response';
COMMENT ON COLUMN conversations.sentiment IS 'Overall customer sentiment: positive, neutral, negative';
COMMENT ON COLUMN conversations.success_evaluation IS 'Boolean indicating if conversation was successful';
COMMENT ON COLUMN conversations.kb_results_count IS 'Number of KB results that were available during conversation';

COMMENT ON COLUMN chat_conversations.kb_used IS 'Whether knowledge base content was used in the response';
COMMENT ON COLUMN chat_conversations.sentiment IS 'Overall customer sentiment: positive, neutral, negative';
COMMENT ON COLUMN chat_conversations.success_evaluation IS 'Boolean indicating if conversation was successful';
COMMENT ON COLUMN chat_conversations.kb_results_count IS 'Number of KB results that were available during conversation';
