-- Migration: Add pilot mode to assistants
-- Enables creating auto-generated demo/pilot pages for chat assistants

-- Pilot mode fields
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS pilot_enabled BOOLEAN DEFAULT false;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS pilot_slug TEXT UNIQUE;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS pilot_logo_url TEXT;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS pilot_config JSONB DEFAULT '{}'::jsonb;

-- Pilot config schema:
-- {
--   "companyName": "Company Name",
--   "primaryColor": "#3B82F6",
--   "greeting": "Hi, I'm the AI assistant...",
--   "title": "AI Chat Pilot",
--   "scope": ["Feature 1", "Feature 2"],
--   "testQuestions": ["Question 1?", "Question 2?"],
--   "supportContact": { "name": "Support", "phone": "123-456-7890", "email": "support@example.com" },
--   "showReviewerNotes": true,
--   "constraints": ["Constraint 1", "Constraint 2"]
-- }

-- Add comments for documentation
COMMENT ON COLUMN assistants.pilot_enabled IS 'Enable pilot/demo mode for this assistant';
COMMENT ON COLUMN assistants.pilot_slug IS 'Unique URL slug for pilot page (e.g., /pilot/my-company)';
COMMENT ON COLUMN assistants.pilot_logo_url IS 'URL to company logo for pilot page';
COMMENT ON COLUMN assistants.pilot_config IS 'JSON configuration for pilot page customization';

-- Create index for pilot slug lookups
CREATE INDEX IF NOT EXISTS idx_assistants_pilot_slug ON assistants(pilot_slug) WHERE pilot_enabled = true;

-- Function to generate unique pilot slug from company name
CREATE OR REPLACE FUNCTION generate_pilot_slug(company_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Generate base slug from company name
  base_slug := lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := regexp_replace(base_slug, '^-|-$', '', 'g');

  -- If empty, use random string
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'pilot-' || substr(md5(random()::text), 1, 8);
  END IF;

  final_slug := base_slug;

  -- Check for uniqueness and add number if needed
  WHILE EXISTS (SELECT 1 FROM assistants WHERE pilot_slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_pilot_slug IS 'Generates a unique URL-safe slug for pilot pages based on company name';
