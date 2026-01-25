# VAPI Takeover - Self-Service Admin Portal Guide

## Overview

The VAPI Takeover Admin Portal provides a complete self-service interface for managing your voice and chat AI platform. **No code changes required** - everything is managed through the web interface.

---

## Features

✅ **Organization Management** - Create councils/organizations with auto-generated UUIDs
✅ **Assistant Creation** - Create voice or chat bots with validation
✅ **Knowledge Base Upload** - Drag & drop files for automatic processing
✅ **Twilio Integration** - Validate phone numbers before activation
✅ **ElevenLabs Voices** - Configure voice IDs for each assistant
✅ **Custom Rubrics** - Set organization or assistant-level rubrics
✅ **Real-time Monitoring** - Track all organizations and assistants

---

## Accessing the Admin Portal

1. Navigate to your aspire-vapi-ghl portal
2. Log in as a **super_admin** user
3. Click on **Super Admin Dashboard**
4. Select the **VAPI Platform** tab

---

## Creating an Organization

### Step 1: Open Create Organization Modal

Click the **"New Organization"** button in the VAPI Platform tab.

### Step 2: Fill in Organization Details

| Field | Description | Example |
|-------|-------------|---------|
| **Organization Name** | Council or company name | `Moreton Bay Regional Council` |
| **Slug** | URL-friendly identifier (auto-generated) | `moreton-bay-regional-council` |
| **Monthly Interaction Limit** | Max interactions per month | `1000` |
| **Price per Interaction** | Billing rate per interaction ($) | `0.50` |
| **Default Rubric** | Optional: Custom rubric JSON | Leave blank for government default |

### Step 3: Create & Copy UUID

- Click **"Create Organization"**
- The system auto-generates a UUID (e.g., `a7f2c9d4-1234-5678-90ab-cdef12345678`)
- Click the **Copy** button to save the UUID
- **Important:** Save this UUID - you'll need it for creating assistants

### Example:

```
Organization: Moreton Bay Regional Council
UUID: a7f2c9d4-1234-5678-90ab-cdef12345678
```

---

## Creating an Assistant

### Step 1: Open Create Assistant Modal

Click the **"New Assistant"** button in the VAPI Platform tab.

### Step 2: Select Assistant Type

Choose between:
- **Chat Bot** - Text-based conversations
- **Voice Bot** - Phone call interactions (requires Twilio number)

### Step 3: Configure Basic Settings

| Field | Description | Required |
|-------|-------------|----------|
| **Organization** | Select from dropdown | ✅ Yes |
| **Friendly Name** | Descriptive name | ✅ Yes |
| **AI Model** | GPT-4o-mini (recommended), GPT-4o, GPT-3.5 | ✅ Yes |
| **System Prompt** | Instructions for AI behavior | ✅ Yes |

### Step 4: Voice Bot Configuration (Voice Only)

If creating a voice bot:

#### A. Twilio Phone Number
1. Enter your Twilio phone number (format: `+61732050555`)
2. Click **"Validate"** button
3. Wait for validation (checks if number exists in your Twilio account)
4. ✅ Green checkmark = Valid
5. ❌ Red X = Invalid (number not found or no voice capability)

**Important:** Number must already be purchased in your Twilio account.

#### B. ElevenLabs Voice ID (Optional)
- Leave blank to use default voice (`mWNaiDAPDAx080ro4nL5`)
- Or enter custom voice ID from ElevenLabs

### Step 5: Custom Rubric (Optional)

- Leave blank to inherit organization's default rubric
- Or paste custom rubric JSON for this specific assistant

### Step 6: Create Assistant

Click **"Create Assistant"** - the system will:
1. Validate all inputs
2. Check Twilio number (if voice bot)
3. Create assistant in database
4. Return assistant ID

---

## Uploading Knowledge Base

### Step 1: Open Knowledge Base Uploader

Click the **"Upload KB"** button in the VAPI Platform tab.

### Step 2: Select Organization

Choose which organization this knowledge belongs to.

### Step 3: Optional - Assign to Specific Assistant

- Leave blank for organization-wide knowledge base
- Enter Assistant ID to restrict knowledge to one assistant

### Step 4: Choose Upload Type

#### Option A: File Upload

**Supported formats:**
- `.txt` - Plain text files
- `.pdf` - PDF documents
- `.docx` - Microsoft Word documents

**File size limit:** 10MB

**Upload methods:**
- Drag & drop file into upload area
- Click to browse and select file

#### Option B: Paste Text

- Enter a title (optional)
- Paste text content directly

### Step 5: Upload & Process

Click **"Upload & Process"** - the system will:

1. **Extract Text** (for PDF/DOCX)
2. **Chunk Text** (split into 1000-character chunks with overlap)
3. **Generate Embeddings** (using OpenAI text-embedding-3-small)
4. **Save to Database** (Supabase with vector search enabled)

**Processing time:** Typically 5-15 seconds per file

**Success message:** `Successfully processed X knowledge chunks`

---

## What Happens Behind the Scenes?

### Organization Creation
```
User Input → API Call → Supabase Insert → UUID Auto-Generated → Display UUID
```

### Assistant Creation (Voice)
```
User Input → Validate Twilio Number → Check Capabilities → Create in DB → Configure Webhooks
```

### Knowledge Base Upload
```
File Upload → Extract Text → Chunk (1000 chars) → Generate Embeddings → Save to Supabase
```

**Cost per KB upload:**
- Text-embedding-3-small: $0.02 per 1M tokens
- Typical 10-page document: ~$0.001

---

## Twilio Number Validation

### What it checks:
1. ✅ Number exists in your Twilio account
2. ✅ Number has voice capabilities enabled
3. ✅ Number is active and not suspended

### Common validation errors:

| Error | Cause | Solution |
|-------|-------|----------|
| "Phone number not found" | Number doesn't exist in account | Purchase number in Twilio first |
| "No voice capabilities" | Number is SMS-only | Enable voice in Twilio settings |
| "Invalid credentials" | Wrong TWILIO_ACCOUNT_SID/AUTH_TOKEN | Check .env configuration |

---

## Knowledge Base Search

Once uploaded, knowledge is **automatically searched** during conversations:

1. User asks a question
2. System generates embedding for question
3. Vector similarity search finds relevant chunks
4. Top 5 most relevant chunks injected into GPT context
5. AI responds with knowledge-based answer

**No manual linking required!**

---

## Environment Variables Required

Backend (.env in vapi-takeover/backend/):

```bash
# Twilio (for voice validation)
TWILIO_ACCOUNT_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here

# OpenAI (for embeddings)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ElevenLabs (for TTS)
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_DEFAULT=mWNaiDAPDAx080ro4nL5

# Supabase (database)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Frontend (.env in aspire-vapi-ghl/):

```bash
VITE_API_URL=https://aspiredentaldemo.onrender.com
```

---

## Best Practices

### Organization Setup
1. Create organization first
2. **Copy and save UUID immediately**
3. Configure default rubric at org level
4. Set realistic interaction limits

### Assistant Configuration
1. **Always validate Twilio numbers** before creating voice assistants
2. Use GPT-4o-mini for cost savings (96% cheaper than GPT-4o)
3. Write detailed system prompts (50-200 words)
4. Test with sample conversations before going live

### Knowledge Base Management
1. Upload one document at a time for better tracking
2. Use descriptive titles for text uploads
3. Keep files under 5MB for faster processing
4. Update KB when policies/procedures change

### Monitoring
1. Check VAPI Platform tab regularly
2. Review created organizations and assistants
3. Monitor knowledge base size
4. Track assistant performance

---

## Troubleshooting

### "Failed to create organization"
- Check backend is running
- Verify VITE_API_URL is correct
- Check network console for errors

### "Phone validation failed"
- Verify number format includes country code (+61)
- Check number exists in Twilio account
- Ensure TWILIO_ACCOUNT_SID and AUTH_TOKEN are correct

### "Knowledge base upload failed"
- Check file size (must be < 10MB)
- Verify file type (TXT, PDF, or DOCX only)
- Ensure OPENAI_API_KEY is valid
- Check backend logs for errors

### "Assistant creation stuck"
- Ensure organization exists
- For voice bots, validate phone number first
- Check all required fields are filled
- Verify backend API is accessible

---

## API Endpoints

For advanced users or automation:

```bash
# Create Organization
POST /api/admin/organizations
Body: { name, slug, monthly_interaction_limit, price_per_interaction }

# Create Assistant
POST /api/admin/assistants
Body: { org_id, friendly_name, bot_type, phone_number, prompt, model }

# Upload Knowledge Base
POST /api/admin/knowledge-base/upload
Body: FormData with 'file', 'org_id', 'assistant_id'

# Validate Twilio Number
POST /api/admin/validate-twilio-number
Body: { phone_number }

# List Organizations
GET /api/admin/organizations

# List Assistants
GET /api/admin/assistants?org_id=<uuid>
```

---

## Cost Breakdown

### Per Organization
- Database storage: ~$0.001/month per organization
- No API costs until assistants are active

### Per Assistant
- Voice call (30s): $0.0105
  - Whisper STT: $0.003
  - GPT-4o-mini: $0.0015
  - ElevenLabs TTS: $0.0012
  - Twilio: $0.0048

- Chat message: $0.0003
  - GPT-4o-mini: $0.0003

- Rubric scoring: $0.0015 per conversation

### Per Knowledge Base Upload
- Embedding generation: ~$0.02 per 1M tokens
- Typical 10-page doc: $0.001
- Storage: Included in Supabase plan

---

## Support

### Backend Issues
- Check logs: `cd vapi-takeover/backend && npm start`
- Verify all environment variables are set
- Test health endpoint: `https://your-backend.com/health`

### Frontend Issues
- Check browser console for errors
- Verify VITE_API_URL points to backend
- Clear cache and reload

### Database Issues
- Check Supabase connection
- Verify RLS policies allow super_admin access
- Check migration status

---

## Next Steps

After creating your first organization and assistant:

1. **Upload Knowledge Base** - Add council policies, FAQs, procedures
2. **Test Assistant** - Make test calls/chats to verify behavior
3. **Configure Webhooks** - Set Twilio webhooks to voice endpoints
4. **Monitor Performance** - Track conversations in dashboard
5. **Adjust Rubric** - Refine scoring based on government requirements
6. **Scale Up** - Create more assistants for different departments

---

## Summary

The VAPI Takeover Admin Portal eliminates manual code changes:

✅ **No GitHub commits required** for new councils
✅ **No database migrations** for assistants
✅ **No manual chunking** for knowledge bases
✅ **No Twilio console** for webhook configuration

**Everything through the web interface!**

For questions or issues, check the troubleshooting section or review backend logs.
