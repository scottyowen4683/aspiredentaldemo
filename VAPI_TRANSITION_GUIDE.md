# VAPI Transition Guide

## Overview

This guide documents the complete transition from VAPI platform to a self-hosted AI chat solution. The new implementation removes all dependencies on VAPI while maintaining the same user experience and adding improved scalability for multi-tenant deployments.

---

## What Changed

### Before (VAPI-dependent)
- **Chat orchestration**: VAPI API
- **Conversation management**: VAPI chat IDs
- **Prompt configuration**: VAPI dashboard
- **Cost**: VAPI subscription + OpenAI usage
- **Vendor lock-in**: Yes

### After (VAPI-free)
- **Chat orchestration**: Direct OpenAI API calls
- **Conversation management**: Supabase database
- **Prompt configuration**: JSON config files
- **Cost**: OpenAI usage only (significant savings)
- **Vendor lock-in**: No

---

## Architecture

### Components

```
Frontend (React)
└── Vapi-Widget.jsx (Updated)
    └── Calls /.netlify/functions/ai-chat

Backend (Netlify Functions)
├── ai-chat.js (NEW - replaces vapi-chat.js)
│   ├── Loads config from config/assistants.json
│   ├── Searches KB via Supabase
│   ├── Manages conversation history in Supabase
│   ├── Calls OpenAI chat completions API
│   └── Returns formatted responses
├── config/assistants.json (NEW)
│   └── Multi-tenant prompt configurations
└── migrations/001_create_chat_conversations.sql
    └── Database schema for conversation history

Database (Supabase)
├── chat_conversations (NEW)
│   └── Stores message-by-message conversation history
├── conversation_sessions (EXISTING)
│   └── Stores rolling conversation summaries
└── knowledge_chunks (EXISTING)
    └── Vector embeddings for knowledge base
```

---

## File Changes

### New Files Created
1. **`/frontend/netlify/functions/ai-chat.js`**
   - Main chat endpoint (replaces vapi-chat.js)
   - Direct OpenAI integration
   - Full conversation history management

2. **`/frontend/netlify/functions/config/assistants.json`**
   - Multi-tenant assistant configurations
   - System prompts
   - Model settings
   - KB settings

3. **`/frontend/netlify/functions/migrations/001_create_chat_conversations.sql`**
   - Database schema for conversation history
   - Run this in your Supabase SQL editor

### Modified Files
1. **`/frontend/src/components/Vapi-Widget.jsx`**
   - Changed endpoint from `/vapi-chat` to `/ai-chat`
   - Improved session management with localStorage
   - Better session persistence

2. **`/frontend/src/pages/pilots/moretonbay.jsx`**
   - Added tenantId prop
   - Fixed import path

### Files to Keep (Still Used)
- `vapi-kb-tool.js` - Can be repurposed or removed
- `knowledge_chunks` table - Still used for KB search
- `conversation_sessions` table - Still used for summaries
- Supabase RPC `match_knowledge_chunks` - Still used

### Files to Remove (Optional Cleanup)
- `vapi-chat.js` - Replaced by ai-chat.js
- `vapi-webhook.js` - No longer needed
- `vapi-outbound-call.js` - Not related to chat (keep if needed)
- Environment variable: `VAPI_API_KEY` - No longer needed

---

## Configuration

### 1. Environment Variables

#### Required (Keep Existing)
```bash
OPENAI_API_KEY=sk-...                    # OpenAI API key
SUPABASE_URL=https://...                 # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=...            # Supabase service role key
```

#### Optional (Keep Existing)
```bash
# Knowledge Base
KB_ENABLED=true                          # Enable/disable KB search
EMBED_MODEL=text-embedding-3-small       # Embedding model
KB_MATCH_COUNT=5                         # Number of KB results

# Conversation Memory
ENABLE_MEMORY_READ=true                  # Read conversation summaries
ENABLE_MEMORY_WRITE=true                 # Write conversation summaries
MEMORY_MAX_CHARS=1200                    # Max summary length
MEMORY_SUMMARY_MODEL=gpt-4o-mini         # Model for summaries
CONVERSATION_HISTORY_LIMIT=10            # Messages to include in context
```

#### No Longer Needed (Can Remove)
```bash
VAPI_API_KEY=...                         # ❌ REMOVE
VAPI_PUBLIC_KEY=...                      # ❌ REMOVE
VAPI_PHONE_NUMBER_ID=...                 # Keep only if using outbound calls
```

### 2. Database Setup

Run the migration script in your Supabase SQL editor:

```bash
# File: /frontend/netlify/functions/migrations/001_create_chat_conversations.sql
```

This creates:
- `chat_conversations` table for message history
- `conversation_sessions` table (if not exists)
- Indexes for performance
- Row-level security policies

### 3. Assistant Configuration

Edit `/frontend/netlify/functions/config/assistants.json` to add new tenants:

```json
{
  "your-tenant-name": {
    "name": "Your Assistant Name",
    "tenantId": "your-tenant-name",
    "systemPrompt": "You are a helpful assistant for...",
    "model": "gpt-4o-mini",
    "temperature": 0.3,
    "maxTokens": 500,
    "kbEnabled": true,
    "kbMatchCount": 5
  }
}
```

### 4. Assistant ID Mapping

Update `/frontend/netlify/functions/tenants/assistant-map.json`:

```json
{
  "your-frontend-assistant-id": "your-tenant-name"
}
```

This maps frontend assistant IDs to tenant identifiers in the config.

---

## Adding a New Client

### Step 1: Add Knowledge Base Content
1. Upload knowledge base documents to Supabase `knowledge_chunks` table
2. Use tenant_id matching your configuration
3. Ensure embeddings are created (use existing ingestion process)

### Step 2: Create Assistant Configuration
Add to `/frontend/netlify/functions/config/assistants.json`:

```json
{
  "newclient": {
    "name": "New Client Assistant",
    "tenantId": "newclient",
    "systemPrompt": "You are a helpful assistant for New Client...",
    "model": "gpt-4o-mini",
    "temperature": 0.3,
    "maxTokens": 500,
    "kbEnabled": true,
    "kbMatchCount": 5
  }
}
```

### Step 3: Add Frontend Environment Variable
Add to your Netlify environment variables (or .env):

```bash
VITE_VAPI_ASSISTANT_NEWCLIENT=newclient-unique-id
```

### Step 4: Map Assistant ID
Update `/frontend/netlify/functions/tenants/assistant-map.json`:

```json
{
  "newclient-unique-id": "newclient"
}
```

### Step 5: Create Page/Widget
Create a new page or use the widget:

```jsx
import VapiWidget from "../../components/Vapi-Widget.jsx";

const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_NEWCLIENT;
const tenantId = "newclient";

<VapiWidget
  assistantId={assistantId}
  tenantId={tenantId}
  title="New Client Chat"
  greeting="Hello! How can I help you today?"
  brandUrl="https://aspireexecutive.ai"
/>
```

### Step 6: Deploy
```bash
git add .
git commit -m "Add new client: newclient"
git push
```

That's it! No external platform configuration needed.

---

## Testing

### Local Testing (Netlify CLI)
```bash
cd frontend
netlify dev
```

Visit your page and test the chat widget.

### Production Testing
1. Deploy to Netlify
2. Test the chat widget on your pilot page
3. Check Supabase tables:
   - `chat_conversations` - Should see messages
   - `conversation_sessions` - Should see summaries (if enabled)

### Debug Mode
Check browser console for debug information in the response:

```json
{
  "kb": {
    "tenantId": "moreton",
    "used": true,
    "matchCount": 5,
    "memorySummaryUsed": false
  }
}
```

---

## Migration Checklist

- [ ] Run database migration (`001_create_chat_conversations.sql`)
- [ ] Deploy new code to Netlify
- [ ] Verify `OPENAI_API_KEY` is set in Netlify environment
- [ ] Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- [ ] Remove `VAPI_API_KEY` from environment (optional)
- [ ] Test chat widget on pilot page
- [ ] Verify conversation history is persisted
- [ ] Verify KB search is working
- [ ] Monitor OpenAI API usage
- [ ] Update any documentation or links referencing VAPI

---

## Cost Comparison

### Before (VAPI)
- VAPI subscription: ~$100-500/month (varies)
- OpenAI API usage: ~$X/month
- **Total**: $100-500+ / month

### After (VAPI-free)
- OpenAI API usage: ~$X/month
- **Total**: $X / month (60-90% savings)

---

## Troubleshooting

### Issue: "Missing tenantId" error
**Solution**: Ensure you're passing both `assistantId` and `tenantId` to the widget:
```jsx
<VapiWidget assistantId={assistantId} tenantId="moreton" ... />
```

### Issue: "No configuration found for tenant"
**Solution**: Add tenant configuration to `/frontend/netlify/functions/config/assistants.json`

### Issue: Conversation history not persisting
**Solution**:
1. Verify database migration was run
2. Check `chat_conversations` table exists
3. Check browser localStorage for session ID
4. Check Netlify function logs for errors

### Issue: KB search not working
**Solution**:
1. Verify `knowledge_chunks` table has data with correct `tenant_id`
2. Check Supabase RPC `match_knowledge_chunks` exists
3. Verify `OPENAI_API_KEY` is set for embeddings

### Issue: OpenAI rate limits
**Solution**:
1. Add rate limiting to the frontend
2. Consider using GPT-3.5-turbo for high volume
3. Monitor OpenAI usage dashboard

---

## Advanced Configuration

### Custom Models
Change the model per tenant in `assistants.json`:

```json
{
  "premium-client": {
    "model": "gpt-4o",  // More expensive but better
    "temperature": 0.2,
    "maxTokens": 1000
  },
  "basic-client": {
    "model": "gpt-4o-mini",  // Cheaper
    "temperature": 0.3,
    "maxTokens": 500
  }
}
```

### Disable KB for Specific Tenants
```json
{
  "chat-only-client": {
    "kbEnabled": false,
    "systemPrompt": "You are a general assistant..."
  }
}
```

### Adjust Conversation History
Control how many messages are included in context:

```bash
CONVERSATION_HISTORY_LIMIT=20  # Include last 20 messages
```

---

## Support

For issues or questions:
- Check Netlify function logs
- Check Supabase logs
- Review OpenAI API logs
- Contact: Scott on 0408 062 129

---

## Future Enhancements

Possible improvements for the future:
1. **Admin UI**: Web interface for managing assistant configurations
2. **Analytics**: Track usage, popular questions, conversation metrics
3. **A/B Testing**: Test different prompts and models
4. **Streaming**: Implement streaming responses for better UX
5. **Voice**: Add speech-to-text and text-to-speech
6. **Multi-language**: Support for multiple languages per tenant
7. **Custom Tools**: Add function calling for specific actions
8. **Rate Limiting**: Per-tenant rate limiting and quotas

---

## Conclusion

You now have a fully self-hosted, scalable AI chat platform with:
✅ No vendor lock-in
✅ Full control over prompts and configuration
✅ Significant cost savings
✅ Easy onboarding for new clients
✅ Conversation history and memory management
✅ Knowledge base integration

The system is production-ready and easily scalable for 20+ tenants.
