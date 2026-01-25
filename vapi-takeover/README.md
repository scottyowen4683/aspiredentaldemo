# VAPI Takeover - Self-Hosted AI Platform

Complete replacement for VAPI with direct API integrations for voice and chat AI assistants.

## 🎯 What This Does

- **Removes VAPI dependency** - Direct Twilio + OpenAI + ElevenLabs integration
- **76% cost savings** - $1,800/month → $425/month
- **Full control** - Customize everything, no platform limitations
- **Council billing** - Track interactions per council for accurate billing
- **Bot management** - Register and rank both voice and chat bots
- **Admin portal** - Super admin + org admin views with Google OAuth + MFA

## 📊 Architecture

```
Frontend (React + TypeScript)
  ├── Super Admin Dashboard (you)
  ├── Organization Dashboard (councils)
  ├── Google OAuth + MFA
  └── Cost tracking, analytics, conversations

Backend (Node.js + Express + WebSocket)
  ├── Voice Platform (Twilio → Whisper → GPT → ElevenLabs)
  ├── Chat Platform (Direct OpenAI GPT)
  ├── Session Management (15min timeout = 1 interaction)
  └── Direct cost tracking (no VAPI fees!)

Database (YOUR Supabase)
  ├── Organizations (councils)
  ├── Assistants (voice + chat bots)
  ├── Conversations (full transcripts)
  ├── Cost tracking (direct API costs)
  └── Billing views (interactions per council)
```

## 🚀 Quick Start

### 1. Database Setup

```bash
# Run migration on YOUR Supabase
psql $DATABASE_URL < supabase/migrations/001_initial_schema.sql
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your API keys
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your Supabase URL
npm run dev
```

## 🔑 Environment Variables

### Backend (.env)
```bash
# Server
PORT=3000
NODE_ENV=development

# Twilio
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER_MORETON=+61...

# OpenAI
OPENAI_API_KEY=sk-...

# ElevenLabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_MORETON=...

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ... # Service role key

# Session
SESSION_TIMEOUT_MS=900000 # 15 minutes
```

### Frontend (.env)
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ... # Anon public key

# Google OAuth (from Supabase dashboard)
# Configure in Supabase Auth settings
```

## 📝 Usage

### Register a Voice Assistant

```sql
INSERT INTO assistants (org_id, friendly_name, bot_type, phone_number, prompt, elevenlabs_voice_id, active)
VALUES (
  'your-org-uuid',
  'Moreton Bay Voice Assistant',
  'voice',
  '+61732050555',
  'You are a helpful voice assistant for Moreton Bay Regional Council...',
  'your-elevenlabs-voice-id',
  true
);
```

### Register a Chat Assistant

```sql
INSERT INTO assistants (org_id, friendly_name, bot_type, prompt, widget_config, active)
VALUES (
  'your-org-uuid',
  'Gold Coast Chat Assistant',
  'chat',
  'You are a helpful chat assistant for Gold Coast City Council...',
  '{"primaryColor": "#0072ce", "greeting": "Hi! How can I help?", "title": "Gold Coast AI Assistant"}',
  true
);
```

### View Interactions for Billing

```sql
SELECT * FROM council_monthly_interactions
WHERE month = DATE_TRUNC('month', NOW())
ORDER BY total_interactions DESC;
```

## 💰 Cost Savings

### Voice Call Costs (per minute)
- **Whisper (STT):** $0.006/min
- **GPT-4o-mini:** ~$0.005/min
- **ElevenLabs (TTS):** ~$0.015/min
- **Twilio:** ~$0.009/min
- **Total:** ~$0.035/min

vs VAPI: ~$0.18/min

**Savings: 81% per minute**

### Monthly Costs (10,000 minutes)
- **Direct APIs:** $350/month
- **Backend hosting (Fly.io):** $25/month
- **Frontend (Netlify):** Free
- **Database (Supabase):** Current usage
- **Total:** ~$425/month

vs VAPI: ~$1,800/month

**Savings: $1,375/month (76%)**

## 📊 Features

### Session Management
- Auto-timeout after 15 minutes of inactivity
- Each session = 1 interaction (for billing)
- Tracks average interaction time per assistant

### Cost Tracking
- Real-time direct API cost calculation
- No VAPI platform fees
- Breakdown by: Whisper, GPT, ElevenLabs, Twilio
- Monthly rollups per organization

### Assistant Ranking
- Auto-ranks based on:
  - Total interactions
  - Average score
  - Success rate
- Performance leaderboard in dashboard

### Admin Portal
- **Super Admin:** See all councils, all costs, all interactions
- **Org Admin:** See only their council's data
- Google OAuth + MFA authentication
- Real-time analytics and reporting

## 🗄️ Database Schema

See `supabase/migrations/001_initial_schema.sql` for complete schema.

**Key Tables:**
- `organizations` - Councils
- `assistants` - Voice + chat bots
- `conversations` - Individual sessions
- `conversation_messages` - Turn-by-turn transcript
- `knowledge_chunks` - Vector embeddings for RAG
- `cost_usage` - Monthly billing data

**Key Views:**
- `council_monthly_interactions` - Billing summary
- `assistant_performance` - Leaderboard

## 📱 Deployment

### Backend (Fly.io)
```bash
cd backend
fly launch
fly secrets set OPENAI_API_KEY=... TWILIO_ACCOUNT_SID=... ...
fly deploy
```

### Frontend (Netlify)
```bash
cd frontend
netlify init
netlify env:set VITE_SUPABASE_URL=...
netlify deploy --prod
```

## 🧪 Testing

### Test Voice Assistant
1. Register voice assistant in database
2. Call the Twilio phone number
3. Speak naturally
4. Verify conversation logged in dashboard

### Test Chat Assistant
1. Register chat assistant in database
2. Embed widget on test page
3. Send messages
4. Verify conversation logged in dashboard

## 📚 Documentation

- `SETUP_GUIDE.md` - Detailed setup instructions
- `API.md` - Backend API documentation
- `DEPLOYMENT.md` - Production deployment guide
- `BILLING.md` - How interaction billing works

## 🔐 Security

- Google OAuth for authentication
- MFA (TOTP) support
- Row Level Security (RLS) in Supabase
- Super admin vs org admin roles
- Audit logging for all admin actions

## 📞 Support

Questions? Contact Scott: 0408 062 129

---

**Built with Claude Code**
Session: https://claude.ai/code/session_01SzWtiFsuWYryC35c4FtGwY
