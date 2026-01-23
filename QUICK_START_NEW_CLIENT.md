# Quick Start: Adding a New Client

This is a simplified checklist for onboarding new clients to the AI chat platform.

## Prerequisites
- Knowledge base content ready to upload
- Client branding/greeting text
- Tenant identifier (lowercase, no spaces, e.g., "goldcoast")

---

## 5-Step Process

### 1️⃣ Upload Knowledge Base
Upload to Supabase `knowledge_chunks` table with `tenant_id` matching your client.

**Via Supabase Dashboard:**
- Go to Table Editor → knowledge_chunks
- Import CSV or use existing ingestion script
- Ensure `tenant_id` matches your chosen identifier (e.g., "goldcoast")

---

### 2️⃣ Add Assistant Configuration

Edit: `/frontend/netlify/functions/config/assistants.json`

```json
{
  "goldcoast": {
    "name": "Gold Coast City Assistant",
    "tenantId": "goldcoast",
    "systemPrompt": "You are a helpful AI assistant for Gold Coast City Council. Provide accurate information about council services...",
    "model": "gpt-4o-mini",
    "temperature": 0.3,
    "maxTokens": 500,
    "kbEnabled": true,
    "kbMatchCount": 5
  }
}
```

**Prompt Template:**
```
You are a helpful AI assistant for [CLIENT NAME]. Your role is to assist [AUDIENCE] with [SCOPE].

You should:
- Provide clear, accurate information based on the knowledge base provided
- Maintain a [TONE: professional/friendly/etc.] tone
- Stay within the scope of [WHAT THEY CAN DO]
- Not handle: [WHAT THEY CANNOT DO]
- For urgent matters, direct users to [ESCALATION PATH]

When answering:
1. Use the knowledge base excerpts as your primary source of truth
2. If the KB doesn't contain the answer, politely say you don't have that information
3. Be concise but complete
4. If uncertain, escalate to [ESCALATION]
```

---

### 3️⃣ Add Environment Variable

**Netlify Dashboard:**
1. Go to Site Settings → Environment Variables
2. Add new variable:
   - Key: `VITE_VAPI_ASSISTANT_GOLDCOAST`
   - Value: `goldcoast-12345` (unique ID)
   - Scope: Production & Deploy Previews

---

### 4️⃣ Map Assistant ID

Edit: `/frontend/netlify/functions/tenants/assistant-map.json`

```json
{
  "goldcoast-12345": "goldcoast",
  "moreton-assistant-id": "moreton"
}
```

This maps your frontend assistant ID to the backend tenant configuration.

---

### 5️⃣ Create Page or Embed Widget

**Option A: Create New Page**

Create: `/frontend/src/pages/pilots/goldcoast.jsx`

```jsx
import React from "react";
import VapiWidget from "../../components/Vapi-Widget.jsx";

const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_GOLDCOAST;
const tenantId = "goldcoast";

export default function GoldCoastPilot() {
  const isConfigured = Boolean(assistantId);

  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      {/* Your page content */}

      <VapiWidget
        assistantId={assistantId}
        tenantId={tenantId}
        title="Gold Coast City • AI Chat"
        greeting="Hi — I'm the Gold Coast City AI assistant. How can I help you today?"
        brandUrl="https://aspireexecutive.ai"
      />
    </div>
  );
}
```

**Option B: Embed in Existing Page**

```jsx
import VapiWidget from "../../components/Vapi-Widget.jsx";

const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_GOLDCOAST;

<VapiWidget
  assistantId={assistantId}
  tenantId="goldcoast"
  title="Gold Coast Chat"
  greeting="Hello! How can I help you?"
/>
```

---

## Deploy

```bash
git add .
git commit -m "Add new client: goldcoast"
git push
```

Netlify will automatically deploy.

---

## Verify

1. **Visit the page** where the widget is embedded
2. **Open chat** and ask a test question
3. **Check Supabase** `chat_conversations` table for new rows
4. **Monitor OpenAI** usage in OpenAI dashboard
5. **Test KB search** by asking questions from the knowledge base

---

## Configuration Options

### Basic Client (Budget-friendly)
```json
{
  "model": "gpt-4o-mini",
  "temperature": 0.3,
  "maxTokens": 500,
  "kbMatchCount": 5
}
```
**Cost**: ~$0.15 per 1000 messages (very cheap)

### Premium Client (Better quality)
```json
{
  "model": "gpt-4o",
  "temperature": 0.2,
  "maxTokens": 1000,
  "kbMatchCount": 8
}
```
**Cost**: ~$7.50 per 1000 messages (higher quality)

### Chat-Only (No KB)
```json
{
  "kbEnabled": false,
  "model": "gpt-4o-mini",
  "systemPrompt": "You are a general assistant..."
}
```

---

## Common Issues

### Widget shows "Configuration error"
→ Missing `assistantId` or `tenantId` prop

### "Missing tenantId" error
→ Check assistant-map.json has the correct mapping

### "No configuration found"
→ Add tenant to assistants.json

### KB not working
→ Verify knowledge_chunks table has data with correct tenant_id

### Conversation not persisting
→ Run database migration (001_create_chat_conversations.sql)

---

## Support

Questions? Contact Scott: 0408 062 129

---

## That's It!

You can now scale to unlimited clients by repeating these 5 steps. No external platform configuration needed. Total time: ~15 minutes per client.
