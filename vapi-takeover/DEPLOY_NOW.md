# Deploy to Fly.io Sydney - Simple Steps

## 🚀 Quick Deployment Guide

Follow these steps to deploy your Aspire AI Platform to Sydney, Australia.

---

## Step 1: Install Fly CLI

**If you haven't already:**

**Mac/Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

**Windows (PowerShell as Administrator):**
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

---

## Step 2: Login to Fly.io

```bash
fly auth login
```

This opens your browser. Create a free account if you don't have one.

---

## Step 3: Navigate to Backend Directory

```bash
cd /home/user/aspiredentaldemo/vapi-takeover/backend
```

---

## Step 4: Launch App (Don't Deploy Yet)

```bash
fly launch --no-deploy
```

**Answer the prompts:**
- App name: `aspire-ai-platform` (or choose your own)
- Region: **Select `syd` (Sydney, Australia)**  ← IMPORTANT!
- PostgreSQL database? **No** (you have Supabase)
- Redis? **No**

This creates your app but doesn't deploy yet.

---

## Step 5: Set Environment Variables (Secrets)

Replace `YOUR_...` with your actual values:

### Supabase (Required)
Get from: https://supabase.com → Your Project → Settings → API

```bash
fly secrets set SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
fly secrets set SUPABASE_SERVICE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
fly secrets set SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

### OpenAI (Required)
Get from: https://platform.openai.com/api-keys

```bash
fly secrets set OPENAI_API_KEY=sk-proj-YOUR_OPENAI_KEY_HERE
```

### ElevenLabs (Required for Voice)
Get from: https://elevenlabs.io/app/settings/api-keys

```bash
fly secrets set ELEVENLABS_API_KEY=YOUR_ELEVENLABS_KEY
fly secrets set ELEVENLABS_VOICE_DEFAULT=21m00Tcm4TlvDq8ikWAM
```

### Twilio (Required for Voice Calls)
Get from: https://console.twilio.com/

```bash
fly secrets set TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID
fly secrets set TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN
fly secrets set TWILIO_PHONE_NUMBER_MORETON=+61732050555
fly secrets set TWILIO_PHONE_NUMBER_GOLDCOAST=+61755828211
```

### Session Timeout (Optional but Recommended)
```bash
fly secrets set SESSION_TIMEOUT_MS=900000
```

---

## Step 6: Deploy!

```bash
fly deploy
```

This will:
1. Build a Docker container
2. Deploy to Sydney
3. Start your app
4. Give you a URL like: `https://aspire-ai-platform.fly.dev`

**First deployment takes 2-3 minutes.**

---

## Step 7: Check It's Working

### View logs:
```bash
fly logs
```

Look for:
```
[INFO] Aspire AI Platform - Voice & Chat API Server
[INFO] Server running on port 8080
```

### Check status:
```bash
fly status
```

Should show: `running` and `syd` region

### Test health endpoint:
```bash
curl https://aspire-ai-platform.fly.dev/health
```

Should return:
```json
{"status":"healthy","timestamp":"..."}
```

---

## Step 8: Update Twilio Webhooks

Go to https://console.twilio.com/ → Phone Numbers

For each of your Twilio numbers, set the webhook to:

**Voice URL (HTTP POST):**
```
https://aspire-ai-platform.fly.dev/api/voice/incoming
```

**Replace `aspire-ai-platform` with your actual app name from Step 4.**

---

## 🎉 Done!

Your Aspire AI Platform is now running in **Sydney, Australia**!

- ✅ Backend API: `https://your-app-name.fly.dev`
- ✅ Health check: `https://your-app-name.fly.dev/health`
- ✅ Admin stats: `https://your-app-name.fly.dev/api/admin/stats`

---

## Useful Commands

**View logs in real-time:**
```bash
fly logs -a aspire-ai-platform
```

**Restart app:**
```bash
fly apps restart aspire-ai-platform
```

**Scale up (if needed):**
```bash
fly scale vm shared-cpu-2x -a aspire-ai-platform  # Upgrade to 512MB RAM
```

**View dashboard:**
```bash
fly dashboard aspire-ai-platform
```

**SSH into server (for debugging):**
```bash
fly ssh console -a aspire-ai-platform
```

---

## Update Environment Variables Later

To update any secret:
```bash
fly secrets set VARIABLE_NAME=new_value -a aspire-ai-platform
```

To list all secrets (names only, not values):
```bash
fly secrets list -a aspire-ai-platform
```

---

## Costs

**Fly.io Sydney:**
- shared-cpu-1x (256MB RAM): ~$7/month ← You're starting with this
- shared-cpu-2x (512MB RAM): ~$15/month (if you need to upgrade)

**First deployment is FREE** (Fly.io gives you free credits to start).

---

## Troubleshooting

### Build fails?
```bash
fly logs -a aspire-ai-platform
```
Check for missing dependencies or Dockerfile issues.

### App won't start?
```bash
fly logs -a aspire-ai-platform
```
Check for missing environment variables or port issues.

### Can't access app?
```bash
fly status -a aspire-ai-platform
```
Make sure status shows "running" and health checks pass.

### Need to redeploy?
```bash
fly deploy
```
Run this any time you make code changes.

---

## Next Steps After Deployment

1. ✅ Test the API endpoints
2. ✅ Update Twilio webhooks
3. ✅ Make a test voice call
4. ✅ Test the chat endpoint
5. ✅ Update your frontend VITE_API_URL to point to Fly.io

---

**Questions? Check the full guide:** `DEPLOY_FLYIO_SYDNEY.md`
