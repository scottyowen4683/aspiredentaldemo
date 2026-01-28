-- Fix contact_requests foreign key constraints to use CASCADE delete
-- This allows assistants and conversations to be properly deleted

-- Drop existing foreign key constraints and recreate with CASCADE
DO $$
BEGIN
    -- Drop conversation_id foreign key if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'contact_requests_conversation_id_fkey'
        AND table_name = 'contact_requests'
    ) THEN
        ALTER TABLE contact_requests DROP CONSTRAINT contact_requests_conversation_id_fkey;
    END IF;

    -- Drop org_id foreign key if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'contact_requests_org_id_fkey'
        AND table_name = 'contact_requests'
    ) THEN
        ALTER TABLE contact_requests DROP CONSTRAINT contact_requests_org_id_fkey;
    END IF;

    -- Drop assistant_id foreign key if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'contact_requests_assistant_id_fkey'
        AND table_name = 'contact_requests'
    ) THEN
        ALTER TABLE contact_requests DROP CONSTRAINT contact_requests_assistant_id_fkey;
    END IF;
END $$;

-- Re-add foreign keys with CASCADE delete
ALTER TABLE contact_requests
    ADD CONSTRAINT contact_requests_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE contact_requests
    ADD CONSTRAINT contact_requests_org_id_fkey
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE contact_requests
    ADD CONSTRAINT contact_requests_assistant_id_fkey
    FOREIGN KEY (assistant_id) REFERENCES assistants(id) ON DELETE CASCADE;
