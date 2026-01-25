# Deploy to Render - Step by Step

## Prerequisites
- GitHub account with vapi-takeover repo pushed
- Render account (free tier works fine for testing)
- Your API keys ready

## Step 1: Push to GitHub

If you haven't already, push this repo to GitHub:

```bash
# On your local machine
git remote add origin https://github.com/scottyowen4683/vapi-takeover.git
git push -u origin master
```

## Step 2: Create New Web Service on Render

1. Go to https://dashboard.render.com/
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account if not already connected
4. Select the **`vapi-takeover`** repository
5. Configure the service:

### Basic Settings:
- **Name:** `vapi-takeover-backend`
- **Region:** Oregon (US West) or closest to you
- **Branch:** `master`
- **Root Directory:** Leave blank
- **Runtime:** `Node`
- **Build Command:** `cd backend && npm install`
- **Start Command:** `cd backend && npm start`

### Advanced Settings:
- **Health Check Path:** `/health`
- **Auto-Deploy:** Yes

## Step 3: Add Environment Variables

In the Render dashboard, go to **Environment** tab and add these:

**Required Variables:**

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `SESSION_TIMEOUT_MS` | `900000` |
| `OPENAI_API_KEY` | `sk-proj-TJFnoSr6NhBKPVlXJZ5vv9CV...` (your actual key) |
| `SUPABASE_URL` | `https://zykdlsvtofzojgojmkdg.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (your service role key) |

**Optional (for voice platform later):**

| Key | Value |
|-----|-------|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token |
| `ELEVENLABS_API_KEY` | Your ElevenLabs API Key |

## Step 4: Deploy

1. Click **"Create Web Service"**
2. Render will automatically:
   - Clone your repo
   - Install dependencies
   - Start the server
   - Assign you a URL like: `https://vapi-takeover-backend.onrender.com`

## Step 5: Test Your Deployment

Once deployed, test the API:

```bash
curl -X POST https://vapi-takeover-backend.onrender.com/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "assistantId": "5a7afafc-073d-4c2c-8db2-757b6c4699ed",
    "message": "Hello, can you help me?"
  }'
```

You should get a JSON response with:
- `sessionId`
- `response` (AI-generated message)
- `cost` (in dollars)
- `latencyMs`

## Step 6: Update Test Page

Update `backend/test-chat.html` to use your Render URL:

```javascript
// Change this line:
const API_URL = 'http://localhost:3000/api/chat';

// To this:
const API_URL = 'https://vapi-takeover-backend.onrender.com/api/chat';
```

Then deploy the HTML page to Netlify or GitHub Pages for easy testing.

## Monitoring

In Render dashboard:
- **Logs:** View real-time server logs
- **Metrics:** CPU, memory usage
- **Events:** Deployment history

## Troubleshooting

**Build fails:**
- Check that all package.json dependencies are listed
- Verify Build Command is correct: `cd backend && npm install`

**Server crashes:**
- Check Logs tab for error messages
- Verify all environment variables are set correctly
- Make sure SUPABASE_URL and SUPABASE_SERVICE_KEY are correct

**API returns 500 errors:**
- Check that OpenAI API key is valid and has credits
- Verify Supabase connection in logs
- Check that assistant ID exists in database

## Costs

**Render Free Tier:**
- 750 hours/month (enough for 24/7 uptime)
- Service spins down after 15 min inactivity
- 512 MB RAM, 0.1 CPU

**Render Starter ($7/month):**
- Always-on (no spin-down)
- 512 MB RAM, 0.5 CPU
- Better for production

**Your Direct Costs:**
- OpenAI: ~$0.0002 per message (GPT-4o-mini)
- Supabase: Free tier (up to 500 MB database)
- Total: **~$7/month + $0.0002/message** 🎉

**vs VAPI: $1,800/month → 96% cost savings!**

## Next Steps

1. Deploy backend to Render ✅
2. Test chat API with assistant ✅
3. Add Twilio voice integration
4. Build admin portal frontend (deploy to Netlify)
5. Set up custom domain

---

**Questions?** Check logs in Render dashboard or contact support.
