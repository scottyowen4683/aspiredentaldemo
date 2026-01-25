# Backend Setup Guide - Aspire AI Platform

This guide walks you through setting up and running the Aspire AI Platform backend server locally, then deploying to Fly.io Sydney.

## Prerequisites

✅ Supabase migrations completed (you just did this!)
✅ Node.js 18+ installed
✅ API keys ready (Twilio, OpenAI, ElevenLabs)

## Step 1: Create Environment File

Navigate to the backend directory:

```bash
cd /home/user/aspiredentaldemo/vapi-takeover/backend
```

Copy the example environment file:

```bash
cp ../.env.example .env
```

## Step 2: Configure Environment Variables

Open the `.env` file and fill in your actual values:

### 🔧 Required API Keys

1. **Supabase** (you already have this):
   - Go to https://supabase.com → Your Project → Settings → API
   - Copy `URL` → Set as `SUPABASE_URL`
   - Copy `anon/public` key → Set as `SUPABASE_ANON_KEY`
   - Copy `service_role` key → Set as `SUPABASE_SERVICE_KEY`

2. **Twilio** (for voice calls):
   - Go to https://console.twilio.com/
   - Copy Account SID → Set as `TWILIO_ACCOUNT_SID`
   - Copy Auth Token → Set as `TWILIO_AUTH_TOKEN`
   - Your Twilio phone numbers → Set as `TWILIO_PHONE_NUMBER_*`

3. **OpenAI** (for GPT, Whisper, Embeddings):
   - Go to https://platform.openai.com/api-keys
   - Create new key → Set as `OPENAI_API_KEY`

4. **ElevenLabs** (for text-to-speech):
   - Go to https://elevenlabs.io/app/settings/api-keys
   - Copy API key → Set as `ELEVENLABS_API_KEY`
   - (Optional) Choose voice IDs from https://elevenlabs.io/voice-library

### 📝 Example .env File

```bash
# Backend Server
PORT=3000
NODE_ENV=development

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_actual_auth_token_here
TWILIO_PHONE_NUMBER_MORETON=+61732050555
TWILIO_PHONE_NUMBER_GOLDCOAST=+61755828211

# OpenAI
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ElevenLabs
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_DEFAULT=21m00Tcm4TlvDq8ikWAM

# Supabase (YOUR ACTUAL VALUES)
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4eHh4eHh4eHh4eHgiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDE1NTc2MDAwfQ.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4eHh4eHh4eHh4eCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAxNTU3NjAwMH0.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Session
SESSION_TIMEOUT_MS=900000

# Email (Optional - for notifications)
BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BREVO_FROM_EMAIL=noreply@aspireexecutive.com.au
BREVO_FROM_NAME=Aspire AI
```

## Step 3: Install Dependencies

Still in the backend directory:

```bash
npm install
```

This installs:
- Express (API server)
- Twilio SDK (voice calls)
- OpenAI SDK (GPT + embeddings)
- @supabase/supabase-js (database)
- ElevenLabs API client
- WebSocket support
- CSV parser (for campaigns)
- And more...

## Step 4: Start the Server

```bash
npm start
```

You should see:
```
[INFO] Aspire AI Platform - Voice & Chat API Server
[INFO] Port: 3000
[INFO] Environment: development
[INFO] Supabase: Connected
[INFO] Server running on http://localhost:3000
```

## Step 5: Test the Server

### Test 1: Health Check

Open a browser or use curl:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-25T03:30:00.000Z"
}
```

### Test 2: Admin Stats

```bash
curl http://localhost:3000/api/admin/stats
```

Expected response:
```json
{
  "success": true,
  "stats": {
    "organizations": 1,
    "assistants": 2,
    "conversations": 0
  }
}
```

### Test 3: Usage Dashboard (replace ORG_ID with yours)

```bash
curl http://localhost:3000/api/admin/usage/YOUR_ORG_ID_HERE
```

Expected response:
```json
{
  "success": true,
  "usage": {
    "org_id": "...",
    "org_name": "Test Org",
    "flat_rate_fee": 500,
    "included_interactions": 5000,
    "current_period_interactions": 0,
    "remaining_interactions": 5000,
    "overage_cost": 0,
    "total_cost_this_period": 500
  }
}
```

### Test 4: Chat Endpoint (Optional)

Open this HTML file in your browser:
```
vapi-takeover/backend/test-chat.html
```

This provides a live chat interface to test the chat bot.

## Common Issues

### ❌ "Port 3000 already in use"

Change the PORT in your `.env` file:
```bash
PORT=3001
```

### ❌ "Supabase connection failed"

Double-check your Supabase credentials in `.env`:
- Make sure `SUPABASE_URL` doesn't have trailing slash
- Make sure `SUPABASE_SERVICE_KEY` is the service_role key, not anon key
- Verify the keys are valid in Supabase dashboard

### ❌ "Cannot find module"

Run `npm install` again:
```bash
cd /home/user/aspiredentaldemo/vapi-takeover/backend
npm install
```

### ❌ Twilio/OpenAI/ElevenLabs errors

These won't affect basic server startup. You'll only need them when:
- Making actual voice calls (Twilio + ElevenLabs)
- Using AI features (OpenAI)

For initial testing, you can use placeholder values.

## What Each Endpoint Does

### Admin Endpoints
- `GET /api/admin/stats` - System-wide statistics
- `GET /api/admin/organizations` - List all organizations
- `POST /api/admin/organizations` - Create new organization
- `GET /api/admin/usage/:org_id` - Get org usage/billing data
- `POST /api/admin/assistants` - Create new assistant
- `GET /api/admin/assistants` - List assistants

### Voice Endpoints
- `POST /api/voice/incoming` - Twilio webhook for inbound calls
- `POST /api/voice/outbound` - Initiate outbound call
- `POST /api/voice/recording` - Recording callback handler

### Chat Endpoints
- `POST /api/chat/:assistant_id/session` - Start new chat session
- `POST /api/chat/:assistant_id/message` - Send message
- `GET /api/chat/:assistant_id/history/:session_id` - Get chat history

### Campaign Endpoints
- `GET /api/campaigns` - List campaigns (by org)
- `POST /api/campaigns` - Create new campaign
- `POST /api/campaigns/:id/contacts/upload` - Upload CSV contacts
- `POST /api/campaigns/:id/start` - Start campaign
- `POST /api/campaigns/:id/pause` - Pause campaign
- `GET /api/campaigns/:id/stats` - Campaign statistics

## Server Logs

The server creates a `server.log` file in the backend directory with detailed logs.

To watch logs in real-time:
```bash
tail -f server.log
```

## Next Steps

Once the backend is running locally:

1. ✅ Test the chat endpoint with `test-chat.html`
2. ✅ Test creating an organization via the admin portal
3. ✅ Test the usage dashboard
4. ✅ Deploy to Fly.io Sydney (I'll help with this)

## Development Mode

The server uses `nodemon` in development mode (watches for file changes and auto-restarts).

To run without auto-restart:
```bash
node server.js
```

## Production Mode

Set `NODE_ENV=production` in your `.env` file:
```bash
NODE_ENV=production
npm start
```

This enables:
- Production logging
- Better error handling
- Performance optimizations

## Ready for Deployment?

Once you've tested the backend locally, we'll deploy to Fly.io Sydney. This will:
- ✅ Deploy backend to Sydney region (low latency for Australia)
- ✅ Configure environment variables
- ✅ Set up health checks
- ✅ Configure custom domain (optional)
- ✅ Enable auto-scaling

Let me know when the backend is running successfully!
