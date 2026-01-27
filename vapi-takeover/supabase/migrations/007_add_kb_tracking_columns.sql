-- Migration: Add KB tracking columns to assistants table
-- This adds columns to track when KB was last uploaded and how many chunks exist

-- Add last_kb_upload_at column to track when KB was last updated
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS last_kb_upload_at TIMESTAMPTZ;

-- Add kb_chunks_count to show how many KB chunks exist for quick display
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS kb_chunks_count INTEGER DEFAULT 0;

-- Add foreign key relationship between audit_logs and assistants (if not exists)
-- This fixes the "Could not find a relationship" error in audit logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audit_logs_assistant_id_fkey'
  ) THEN
    -- Only add if audit_logs table exists and has assistant_id column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'assistant_id') THEN
      ALTER TABLE audit_logs
        ADD CONSTRAINT audit_logs_assistant_id_fkey
        FOREIGN KEY (assistant_id) REFERENCES assistants(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Add foreign key relationship between audit_logs and organizations (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audit_logs_org_id_fkey'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'org_id') THEN
      ALTER TABLE audit_logs
        ADD CONSTRAINT audit_logs_org_id_fkey
        FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Add foreign key relationship between audit_logs and users (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audit_logs_user_id_fkey'
  ) THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'user_id') THEN
      ALTER TABLE audit_logs
        ADD CONSTRAINT audit_logs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Create index on last_kb_upload_at for faster queries
CREATE INDEX IF NOT EXISTS idx_assistants_last_kb_upload ON assistants(last_kb_upload_at);

COMMENT ON COLUMN assistants.last_kb_upload_at IS 'Timestamp of last knowledge base upload';
COMMENT ON COLUMN assistants.kb_chunks_count IS 'Number of KB chunks stored for this assistant';
