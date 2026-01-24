-- Migration: Add conversation scoring table for government compliance
-- This allows tracking of rubric scores for both voice and chat conversations

-- Create conversation_scores table
CREATE TABLE IF NOT EXISTS conversation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,

  -- Scoring results
  overall_score DECIMAL(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  dimension_scores JSONB NOT NULL, -- Array of dimension scores
  flags TEXT[] DEFAULT '{}', -- Compliance flags (policy_violation, privacy_breach, etc.)
  feedback TEXT, -- Detailed feedback

  -- Metadata
  cost DECIMAL(10,6) NOT NULL, -- Cost of scoring operation
  model_used TEXT DEFAULT 'gpt-4o-mini',
  scoring_type TEXT DEFAULT 'chat', -- 'chat' or 'voice'

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  UNIQUE(conversation_id) -- One score per conversation
);

CREATE INDEX IF NOT EXISTS idx_conversation_scores_conversation_id ON conversation_scores(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_scores_overall_score ON conversation_scores(overall_score);
CREATE INDEX IF NOT EXISTS idx_conversation_scores_flags ON conversation_scores USING GIN(flags);
CREATE INDEX IF NOT EXISTS idx_conversation_scores_created_at ON conversation_scores(created_at DESC);

-- Add score and scored_at columns to chat_conversations if they don't exist
DO $$
BEGIN
  -- Add score column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_conversations' AND column_name = 'score'
  ) THEN
    ALTER TABLE chat_conversations ADD COLUMN score DECIMAL(5,2);
  END IF;

  -- Add scored_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_conversations' AND column_name = 'scored_at'
  ) THEN
    ALTER TABLE chat_conversations ADD COLUMN scored_at TIMESTAMPTZ;
  END IF;

  -- Add auto_score column to assistants if doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assistants' AND column_name = 'auto_score'
  ) THEN
    ALTER TABLE assistants ADD COLUMN auto_score BOOLEAN DEFAULT TRUE;
  END IF;

END $$;

-- Create view for flagged conversations requiring review
CREATE OR REPLACE VIEW flagged_conversations AS
SELECT
  cs.id AS score_id,
  cs.conversation_id,
  cc.org_id,
  cc.assistant_id,
  cs.overall_score,
  cs.flags,
  cs.feedback,
  cs.scoring_type,
  cc.started_at,
  cc.ended_at,
  cs.created_at AS scored_at
FROM conversation_scores cs
JOIN chat_conversations cc ON cs.conversation_id = cc.id
WHERE array_length(cs.flags, 1) > 0 -- Has at least one flag
ORDER BY cs.created_at DESC;

-- Grant permissions (adjust based on your RLS setup)
COMMENT ON TABLE conversation_scores IS 'Stores rubric-based scores for conversations with government compliance tracking';
COMMENT ON VIEW flagged_conversations IS 'Shows conversations that have been flagged for compliance review';
