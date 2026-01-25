# Deploy to Fly.io (Sydney, Australia) - Complete Guide

## Why Fly.io for Australian Hosting?

✅ **Sydney Region** - 100% hosted in Australia
✅ **Docker Support** - Easy deployment
✅ **Similar Cost** - ~$7-10/month for starter
✅ **Better Performance** - Closer to Supabase AU
✅ **Full Control** - No vendor lock-in

---

## Prerequisites

1. **Fly.io Account:** https://fly.io/app/sign-up
2. **Fly CLI installed** on your computer:

**Windows:**
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

**Mac/Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

---

## Step 1: Login to Fly.io

```bash
fly auth login
```

This opens your browser for authentication.

---

## Step 2: Create Dockerfile

The project already has a Dockerfile, but we need to optimize it for Fly.io:

Create `/vapi-takeover/backend/fly.Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev for build if needed)
RUN npm install

# Copy application code
COPY . .

# Expose port (Fly.io uses PORT env var)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["npm", "start"]
```

---

## Step 3: Initialize Fly.io App

In the `vapi-takeover/backend/` directory:

```bash
cd /path/to/vapi-takeover/backend
fly launch --no-deploy
```

When prompted:
- **App name:** `aspire-voice-platform` (or your choice)
- **Region:** Select **`syd` (Sydney, Australia)** ✅
- **PostgreSQL database:** No (you have Supabase)
- **Redis:** No

---

## Step 4: Configure fly.toml

Fly.io creates `fly.toml`. Update it:

```toml
app = "aspire-voice-platform"
primary_region = "syd"  # Sydney, Australia

[build]
  dockerfile = "fly.Dockerfile"

[env]
  PORT = "8080"
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false  # Keep always running
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "connections"
    hard_limit = 1000
    soft_limit = 500

  [[http_service.checks]]
    interval = "15s"
    timeout = "5s"
    grace_period = "10s"
    method = "GET"
    path = "/health"

[[vm]]
  size = "shared-cpu-1x"  # 256MB RAM, 1 shared CPU (~$7/month)
  memory = "256mb"

# For WebSocket support
[[services]]
  protocol = "tcp"
  internal_port = 8080

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 1000
    soft_limit = 500
```

---

## Step 5: Set Environment Variables (Secrets)

```bash
# OpenAI - Get from: https://platform.openai.com/api-keys
fly secrets set OPENAI_API_KEY=YOUR_OPENAI_API_KEY_HERE

# Supabase - Get from: https://supabase.com/dashboard/project/[project-id]/settings/api
fly secrets set SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
fly secrets set SUPABASE_SERVICE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE

# ElevenLabs - Get from: https://elevenlabs.io/app/settings/api-keys
fly secrets set ELEVENLABS_API_KEY=YOUR_ELEVENLABS_API_KEY_HERE
# Voice ID from: https://elevenlabs.io/app/voice-library
fly secrets set ELEVENLABS_VOICE_DEFAULT=mWNaiDAPDAx080ro4nL5

# Twilio - Get from: https://console.twilio.com/
fly secrets set TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID_HERE
fly secrets set TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN_HERE

# Session timeout
fly secrets set SESSION_TIMEOUT_MS=900000
```

---

## Step 6: Deploy!

```bash
fly deploy
```

Fly.io will:
1. Build your Docker image
2. Deploy to Sydney region
3. Start the app
4. Give you a URL: `https://aspire-voice-platform.fly.dev`

---

## Step 7: Check Deployment

```bash
# View logs
fly logs

# Check status
fly status

# SSH into machine (if needed)
fly ssh console

# Scale (if needed)
fly scale count 2  # Run 2 instances
fly scale vm shared-cpu-2x  # Upgrade to 512MB RAM
```

---

## Step 8: Configure Twilio

Update Twilio webhooks to use Fly.io URL:

**Voice Webhook:**
```
https://aspire-voice-platform.fly.dev/api/voice/incoming
```

**WebSocket Stream:**
```
wss://aspire-voice-platform.fly.dev/voice/stream
```

---

## Costs Comparison

| Service | Cost/Month | Location |
|---------|-----------|----------|
| **Fly.io (shared-cpu-1x)** | $7 | Sydney, AU ✅ |
| **Render (Starter)** | $7 | Oregon, US ❌ |
| **Fly.io (shared-cpu-2x)** | $15 | Sydney, AU ✅ |

**100% Australian hosting achieved!** 🇦🇺

---

## Monitoring

**View metrics:**
```bash
fly dashboard
```

**Set up alerts:**
1. Go to https://fly.io/dashboard/[your-app]/metrics
2. Configure alerts for:
   - High CPU usage
   - Memory issues
   - Response time
   - Error rate

---

## Auto-Deploy from GitHub (Optional)

Create `.github/workflows/fly-deploy.yml`:

```yaml
name: Deploy to Fly.io Sydney

on:
  push:
    branches: [claude/vapi-takeover-VsXM8]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        working-directory: ./vapi-takeover/backend
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Get FLY_API_TOKEN:
```bash
fly tokens create deploy
```

Add to GitHub Secrets: Repository Settings → Secrets → New repository secret

---

## Troubleshooting

**Build fails:**
```bash
fly logs --app aspire-voice-platform
```

**Connection issues:**
```bash
fly ping --app aspire-voice-platform
```

**Restart app:**
```bash
fly apps restart aspire-voice-platform
```

---

## Migration from Render

1. Deploy to Fly.io (steps above)
2. Test with Twilio webhooks
3. Once working, update Twilio to Fly.io URLs
4. Delete Render app

**No downtime if you:**
- Deploy to Fly.io first
- Test with test phone number
- Switch Twilio webhooks when ready

---

## Summary

✅ **100% Australian hosting** - Sydney region
✅ **Supabase in AU** - Low latency
✅ **WebSocket support** - For Twilio Media Streams
✅ **Always-on** - No spin-down delays
✅ **$7/month** - Same as Render
✅ **Full control** - Docker-based

**Your voice platform is now fully Australian-hosted!** 🎉
