-- Migration: Add call recording fields to conversations

DO $$
BEGIN
  -- Add recording_url column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_conversations' AND column_name = 'recording_url'
  ) THEN
    ALTER TABLE chat_conversations ADD COLUMN recording_url TEXT;
  END IF;

  -- Add recording_sid column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_conversations' AND column_name = 'recording_sid'
  ) THEN
    ALTER TABLE chat_conversations ADD COLUMN recording_sid TEXT;
  END IF;

  -- Add recording_duration column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_conversations' AND column_name = 'recording_duration'
  ) THEN
    ALTER TABLE chat_conversations ADD COLUMN recording_duration INTEGER;
  END IF;

END $$;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_recording_sid ON chat_conversations(recording_sid);

COMMENT ON COLUMN chat_conversations.recording_url IS 'Twilio recording URL for voice calls';
COMMENT ON COLUMN chat_conversations.recording_sid IS 'Twilio recording SID';
COMMENT ON COLUMN chat_conversations.recording_duration IS 'Recording duration in seconds';
