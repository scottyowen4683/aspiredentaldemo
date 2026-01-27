-- Migration: Add data retention policy to assistants
-- Allows configuring how long conversation data is retained per assistant
-- Default: 90 days - data older than this will be eligible for cleanup

-- Add retention policy column to assistants
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS data_retention_days INTEGER DEFAULT 90;

-- Add comment for documentation
COMMENT ON COLUMN assistants.data_retention_days IS 'Number of days to retain conversation data for this assistant. Default 90 days. Set to 0 for indefinite retention.';

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_conversations_assistant_retention
ON conversations(assistant_id, created_at DESC);

-- Function to get conversations eligible for deletion based on retention policy
CREATE OR REPLACE FUNCTION get_expired_conversations()
RETURNS TABLE (
  conversation_id UUID,
  assistant_id UUID,
  org_id UUID,
  created_at TIMESTAMPTZ,
  retention_days INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as conversation_id,
    c.assistant_id,
    c.org_id,
    c.created_at,
    COALESCE(a.data_retention_days, 90) as retention_days
  FROM conversations c
  JOIN assistants a ON c.assistant_id = a.id
  WHERE
    COALESCE(a.data_retention_days, 90) > 0  -- Skip if retention is 0 (indefinite)
    AND c.created_at < NOW() - (COALESCE(a.data_retention_days, 90) || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired conversations (call via scheduled job)
CREATE OR REPLACE FUNCTION cleanup_expired_conversations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete conversation messages first (due to FK constraint)
  DELETE FROM conversation_messages
  WHERE conversation_id IN (
    SELECT c.id
    FROM conversations c
    JOIN assistants a ON c.assistant_id = a.id
    WHERE
      COALESCE(a.data_retention_days, 90) > 0
      AND c.created_at < NOW() - (COALESCE(a.data_retention_days, 90) || ' days')::INTERVAL
  );

  -- Delete the conversations
  WITH deleted AS (
    DELETE FROM conversations c
    USING assistants a
    WHERE c.assistant_id = a.id
      AND COALESCE(a.data_retention_days, 90) > 0
      AND c.created_at < NOW() - (COALESCE(a.data_retention_days, 90) || ' days')::INTERVAL
    RETURNING c.id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_expired_conversations IS 'Returns conversations that have exceeded their retention period based on assistant settings';
COMMENT ON FUNCTION cleanup_expired_conversations IS 'Deletes conversations and their messages that have exceeded retention period. Returns count of deleted conversations.';
