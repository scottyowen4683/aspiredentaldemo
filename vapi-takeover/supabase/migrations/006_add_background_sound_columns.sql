-- Add background sound columns to assistants table
-- These control the ambient background noise for voice calls

-- Add background_sound column (office, cafe, none)
ALTER TABLE assistants
ADD COLUMN IF NOT EXISTS background_sound TEXT DEFAULT 'office';

-- Add background_volume column (0.0 to 1.0)
ALTER TABLE assistants
ADD COLUMN IF NOT EXISTS background_volume DECIMAL(3,2) DEFAULT 0.20;

-- Add first_message column for voice greeting (if not exists)
ALTER TABLE assistants
ADD COLUMN IF NOT EXISTS first_message TEXT;

-- Comment the columns for documentation
COMMENT ON COLUMN assistants.background_sound IS 'Background ambient sound for voice calls: office, cafe, or none';
COMMENT ON COLUMN assistants.background_volume IS 'Volume level for background sound (0.0 to 1.0)';
COMMENT ON COLUMN assistants.first_message IS 'Initial greeting message for voice calls';
