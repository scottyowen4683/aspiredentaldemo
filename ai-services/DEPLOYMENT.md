# Aspire AI Services - Deployment Guide

This folder contains the Aspire AI Services website, a self-hosted AI platform that runs on Fly.io.

## Architecture

```
ai-services/
├── backend/
│   ├── server.js        # Express backend with Twilio outbound API
│   ├── fly.toml         # Fly.io configuration
│   ├── Dockerfile       # Multi-stage build
│   ├── package.json     # Backend dependencies
│   ├── .env.example     # Environment variables template
│   └── frontend/        # React frontend
│       ├── src/
│       ├── public/      # Static assets
│       ├── package.json
│       └── vite.config.js
```

## Features

- **Marketing Website**: Full Aspire AI Services website (no VAPI dependency)
- **Outbound Calling**: Self-hosted Twilio integration using +61731322220
- **Login Button**: Links to the AI Platform Portal (aspire-ai-platform.fly.dev)
- **ElevenLabs Voice**: Voice ID `mWNaiDAPDAx080ro4nL5`

## Prerequisites

1. [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/) installed
2. Fly.io account and logged in (`fly auth login`)
3. Twilio account with phone number +61731322220

## Deployment Steps

### 1. Navigate to Backend

```bash
cd ai-services/backend
```

### 2. Set Environment Secrets

```bash
fly secrets set TWILIO_ACCOUNT_SID=your_account_sid
fly secrets set TWILIO_AUTH_TOKEN=your_auth_token
fly secrets set ELEVENLABS_API_KEY=your_api_key
```

### 3. Deploy to Fly.io

```bash
fly deploy
```

The app will be available at: https://aspire-ai-services.fly.dev

## DNS Configuration for aspireexecutive.ai (Namecheap)

To point your domain `aspireexecutive.ai` to the Fly.io deployment:

### Option 1: CNAME Record (Recommended for subdomains)

If using a subdomain like `www.aspireexecutive.ai`:

1. Log into Namecheap
2. Go to **Domain List** → click **Manage** next to aspireexecutive.ai
3. Click **Advanced DNS** tab
4. Add a new record:
   - **Type**: CNAME
   - **Host**: www (or @ for root)
   - **Value**: aspire-ai-services.fly.dev
   - **TTL**: Automatic

### Option 2: A/AAAA Records (For root domain)

For the root domain `aspireexecutive.ai`:

1. Get Fly.io IP addresses:
   ```bash
   fly ips list -a aspire-ai-services
   ```

2. In Namecheap Advanced DNS, add:
   - **Type**: A Record
   - **Host**: @
   - **Value**: (IPv4 from fly ips list)
   - **TTL**: Automatic

   - **Type**: AAAA Record
   - **Host**: @
   - **Value**: (IPv6 from fly ips list)
   - **TTL**: Automatic

### Option 3: Use Fly.io Custom Domain (Recommended)

1. Add custom domain in Fly.io:
   ```bash
   fly certs add aspireexecutive.ai -a aspire-ai-services
   ```

2. Fly.io will provide instructions for DNS records

3. In Namecheap, follow Fly.io's instructions to add the required records

### Verify DNS

After updating DNS (may take 5-30 minutes):

```bash
# Check DNS propagation
dig aspireexecutive.ai

# Check Fly.io certificate
fly certs show aspireexecutive.ai -a aspire-ai-services
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID | Yes |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Yes |
| `TWILIO_OUTBOUND_NUMBER` | Caller ID for outbound | No (default: +61731322220) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | Optional |
| `ELEVENLABS_VOICE_ID` | Voice ID for TTS | No (default: mWNaiDAPDAx080ro4nL5) |
| `BASE_URL` | Public URL of the service | No |

## Related Services

- **AI Platform Portal**: https://aspire-ai-platform.fly.dev
  - Full voice AI platform with dashboard
  - User authentication (Supabase)
  - Campaign management
  - Billing and analytics

## Outbound Calling API

The backend exposes a simple outbound calling API:

```
POST /api/outbound-call
Content-Type: application/json

{
  "to": "+61412345678",
  "context": {
    "variant": "business",
    "path": "/business"
  }
}
```

Features:
- Rate limited: 3 calls per IP per 24 hours
- Australian numbers only (+61 format)
- Twilio-powered voice calls

## Development

### Local Development

```bash
# Backend
cd ai-services/backend
npm install
npm run dev

# Frontend (in separate terminal)
cd ai-services/backend/frontend
npm install
npm run dev
```

### Building Locally

```bash
cd ai-services/backend/frontend
npm run build  # Outputs to ../public
```

## Differences from Original Site

This deployment differs from the original premium-redesign site:

1. **No VAPI**: All VAPI references removed
2. **Self-hosted Outbound**: Uses direct Twilio API instead of VAPI
3. **Login Button**: Added to header, links to AI Platform Portal
4. **Twilio Number**: Uses +61731322220 for outbound calls
5. **No Chat Widget**: VAPI chat widget removed (can be added back with custom implementation)
