# Supabase Setup Instructions - SAFE Migration

This guide will help you add the new Aspire AI Platform features to your existing Supabase database WITHOUT breaking your current chatbot functionality.

## Important Notes

✅ **SAFE**: These migrations only ADD new tables and columns
✅ **NO DELETION**: Your existing chatbot tables remain untouched
✅ **REVERSIBLE**: You can drop the new tables if needed without affecting existing functionality

## What Gets Added

1. **New Billing Fields** on `organizations` table (existing chatbot fields remain):
   - `flat_rate_fee` - Monthly base cost (default: $500)
   - `included_interactions` - Included in base price (default: 5000)
   - `overage_rate_per_1000` - Overage charge (default: $50)
   - `current_period_start`, `current_period_end` - Billing period tracking
   - `current_period_interactions`, `total_interactions` - Usage counters

2. **New Tables**:
   - `interaction_logs` - Detailed tracking of all interactions for billing
   - `outbound_campaigns` - Campaign management
   - `campaign_contacts` - Contact lists for campaigns

3. **New Features**:
   - `organization_usage_summary` view - Real-time billing calculations
   - `increment_interaction()` function - Automatic interaction tracking
   - Call recording fields on `chat_conversations`
   - Conversation scoring fields

## Step-by-Step Instructions

### Step 1: Access Supabase SQL Editor

1. Go to https://supabase.com
2. Select your project
3. Click on **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Run Migration 005 (Call Recording Fields)

This adds recording fields to your existing `chat_conversations` table.

1. Open the file: `vapi-takeover/supabase/migrations/005_add_recording_fields.sql`
2. Copy the entire contents
3. Paste into the Supabase SQL Editor
4. Click **Run** (or press Ctrl+Enter)

**Expected result**: Success message, adds 3 new columns

### Step 3: Run Migration 004 SAFE (Billing and Campaigns)

This adds all the new billing and campaign features.

1. Open the file: `vapi-takeover/supabase/migrations/004_interaction_billing_and_campaigns_SAFE.sql`
2. Copy the entire contents
3. Paste into the Supabase SQL Editor
4. Click **Run**

**Expected result**: Success message, creates:
- 7 new columns on `organizations`
- 3 new tables
- 1 view
- 2 functions

### Step 4: Run Migration 003 (Conversation Scoring) - OPTIONAL

Only run this if you want the government rubric scoring feature.

1. Open the file: `vapi-takeover/supabase/migrations/003_conversation_scoring.sql`
2. Copy the entire contents
3. Paste into the Supabase SQL Editor
4. Click **Run**

**Expected result**: Success message, adds scoring fields to conversations

### Step 5: Verify Migrations

Run this query to verify everything was created:

```sql
-- Check new organizations columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'organizations'
  AND column_name IN (
    'flat_rate_fee',
    'included_interactions',
    'overage_rate_per_1000',
    'current_period_interactions'
  );

-- Check new tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'interaction_logs',
    'outbound_campaigns',
    'campaign_contacts'
  );

-- Check view exists
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'organization_usage_summary';

-- Check functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'increment_interaction',
    'reset_monthly_interactions'
  );
```

**Expected result**: You should see:
- 4 columns listed for organizations
- 3 tables listed
- 1 view listed
- 2 functions listed

### Step 6: Initialize Billing for Existing Organizations (IMPORTANT)

If you already have organizations in your database, run this to set up their billing:

```sql
-- Set default billing values for existing organizations
UPDATE organizations
SET
  flat_rate_fee = 500.00,
  included_interactions = 5000,
  overage_rate_per_1000 = 50.00,
  current_period_start = CURRENT_DATE,
  current_period_end = CURRENT_DATE + INTERVAL '1 month',
  current_period_interactions = 0,
  total_interactions = 0
WHERE flat_rate_fee IS NULL;
```

**Expected result**: X rows updated (where X = number of existing organizations)

## Troubleshooting

### Error: "relation already exists"
This is fine - it means the table was already created. The migration uses `IF NOT EXISTS` to handle this safely.

### Error: "column already exists"
This is fine - it means the column was already added. The migration uses `IF NOT EXISTS` to handle this safely.

### Error: "foreign key constraint"
This could mean:
1. The referenced table doesn't exist yet - run migrations in order
2. There's orphaned data - check the error message for details

### Error: "permission denied"
Make sure you're running these queries as a superuser in Supabase (you should be by default in the SQL Editor).

## What About My Existing Chatbot?

**Your chatbot will continue to work exactly as before.** These migrations:
- ✅ Don't modify existing columns
- ✅ Don't delete any data
- ✅ Don't change existing tables (except adding new columns)
- ✅ Don't affect existing queries or API calls

The old `monthly_interaction_limit` and `price_per_interaction` columns (if they exist) are **kept** in the SAFE migration, so nothing breaks.

## Testing After Migration

1. **Test your existing chatbot** - Make sure it still works normally
2. **Create a test organization** - Use the new billing fields
3. **Check the usage view**:
   ```sql
   SELECT * FROM organization_usage_summary LIMIT 5;
   ```

## Next Steps

After successful migration:
1. ✅ Set up your backend environment variables
2. ✅ Install backend dependencies: `cd vapi-takeover/backend && npm install`
3. ✅ Start the backend server: `npm start`
4. ✅ Test the voice/chat endpoints
5. ✅ Deploy to Fly.io Sydney

## Rollback (If Needed)

If something goes wrong and you need to undo these changes:

```sql
-- Drop new tables (this won't affect your chatbot)
DROP TABLE IF EXISTS campaign_contacts CASCADE;
DROP TABLE IF EXISTS outbound_campaigns CASCADE;
DROP TABLE IF EXISTS interaction_logs CASCADE;

-- Drop new columns from organizations (optional)
ALTER TABLE organizations
  DROP COLUMN IF EXISTS flat_rate_fee,
  DROP COLUMN IF EXISTS included_interactions,
  DROP COLUMN IF EXISTS overage_rate_per_1000,
  DROP COLUMN IF EXISTS current_period_start,
  DROP COLUMN IF EXISTS current_period_end,
  DROP COLUMN IF EXISTS current_period_interactions,
  DROP COLUMN IF EXISTS total_interactions;

-- Drop functions
DROP FUNCTION IF EXISTS increment_interaction;
DROP FUNCTION IF EXISTS reset_monthly_interactions;

-- Drop view
DROP VIEW IF EXISTS organization_usage_summary;
```

## Questions or Issues?

If you encounter any issues:
1. Check the error message in Supabase SQL Editor
2. Verify you ran migrations in the correct order
3. Check that all referenced tables exist
4. Make sure you have proper permissions
