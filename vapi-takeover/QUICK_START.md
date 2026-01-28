# Quick Start Guide - VAPI Takeover

## Step 1: Database Setup

Run the migration on your Supabase database:

```bash
# Option 1: Using Supabase CLI
supabase db push

# Option 2: Direct SQL (from Supabase dashboard)
# Copy contents of supabase/migrations/001_initial_schema.sql
# Paste into SQL Editor and run
```

## Step 2: Create Test Organization & Assistant

Run this in your Supabase SQL Editor:

```sql
-- 1. Create a test organization
INSERT INTO organizations (name, slug, contact_email)
VALUES ('Test Council', 'test-council', 'test@example.com')
RETURNING id;
-- Copy the returned ID

-- 2. Create a test chat assistant
INSERT INTO assistants (
  org_id,  -- Use the ID from step 1
  friendly_name,
  bot_type,
  prompt,
  active
)
VALUES (
  'YOUR-ORG-ID-HERE',  -- Replace with actual org ID
  'Test Chat Assistant',
  'chat',
  'You are a helpful AI assistant for Test Council. Answer questions politely and concisely.',
  true
)
RETURNING id;
-- Copy this assistant ID for testing
```

## Step 3: Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp ../.env.example .env

# Edit .env and add your keys:
# - OPENAI_API_KEY=sk-...
# - SUPABASE_URL=https://...
# - SUPABASE_SERVICE_KEY=eyJ...

# Start server
npm run dev
```

You should see:
```
🚀 VAPI Takeover server running on port 3000
   Environment: development
   WebSocket endpoint: ws://localhost:3000/voice/stream
   API endpoint: http://localhost:3000/api
```

## Step 4: Test Chat API

### Using curl:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "assistantId": "YOUR-ASSISTANT-ID-HERE",
    "message": "Hello, can you help me?"
  }'
```

### Using the test page:

1. Open `backend/test-chat.html` in your browser
2. Enter your assistant ID
3. Send messages
4. See responses and costs in real-time

## Step 5: Verify in Database

```sql
-- Check conversations
SELECT * FROM conversations ORDER BY created_at DESC LIMIT 5;

-- Check messages
SELECT * FROM conversation_messages ORDER BY timestamp DESC LIMIT 10;

-- Check costs
SELECT
  session_id,
  gpt_cost,
  total_cost,
  tokens_in,
  tokens_out
FROM conversations
ORDER BY created_at DESC
LIMIT 5;
```

## What You'll See:

✅ Chat API responds with AI-generated messages
✅ Costs calculated automatically (GPT-4o-mini pricing)
✅ Session timeout after 15 minutes of inactivity
✅ All conversations saved to database
✅ Ready to add knowledge base chunks for RAG

## Next Steps:

1. **Add knowledge base:**
   ```sql
   -- Get embedding from OpenAI, then:
   INSERT INTO knowledge_chunks (org_id, tenant_id, heading, content, embedding)
   VALUES (...);
   ```

2. **Test with knowledge base:**
   - Chat will automatically search KB and include relevant context

3. **Add voice platform:**
   - Configure Twilio webhook
   - Test voice calls
   - See transcripts in database

4. **Build admin portal:**
   - View conversations
   - Track costs
   - Monitor interactions

## Troubleshooting:

**Server won't start:**
- Check .env file has all required variables
- Verify Supabase keys are correct
- Check port 3000 is available

**Chat returns errors:**
- Verify assistant ID is correct
- Check OpenAI API key is valid
- Check Supabase connection

**No knowledge base results:**
- Need to add chunks with embeddings first
- Check tenant_id matches org_id

---

**Questions?** Check the main README.md or server logs for details.
