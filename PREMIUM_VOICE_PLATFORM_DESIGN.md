# Premium Voice AI Platform - Architecture & Design

## 🎯 Vision

**A production-grade, self-hosted voice AI platform that you completely own**

- **Ultra-low latency:** <1.5 second response time (industry-leading)
- **Premium quality:** Professional voices, accurate transcription, intelligent responses
- **Real-time streaming:** WebSocket-based bidirectional audio streaming
- **Fully controlled:** No platform dependencies, all APIs direct
- **Production ready:** Scalable, reliable, monitorable
- **Cost efficient:** ~4-5¢/min vs VAPI's 18¢/min (75% savings)

---

## 🏗️ Architecture Overview

### Real-Time Streaming Architecture (Premium Approach)

```
┌──────────────────────────────────────────────────────────┐
│                    PHONE CALL                             │
│              (Customer ↔ Twilio)                          │
└────────────────┬─────────────────────────────────────────┘
                 │
                 │ Bidirectional WebSocket (Real-time)
                 │
                 ▼
┌──────────────────────────────────────────────────────────┐
│           VOICE PLATFORM SERVER                           │
│         (Node.js + WebSocket + Express)                   │
│                                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │  WebSocket Manager                               │    │
│  │  • Receives audio chunks from Twilio             │    │
│  │  • Streams audio back to Twilio                  │    │
│  │  • Manages concurrent calls                      │    │
│  └─────────────────────────────────────────────────┘    │
│                                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Audio Pipeline (Parallel Processing)            │    │
│  │                                                   │    │
│  │  [Incoming Audio] ──────────────┐               │    │
│  │         ↓                        │               │    │
│  │    VAD Detection                 │               │    │
│  │         ↓                        │               │    │
│  │    Buffer chunks                 │               │    │
│  │         ↓                        │               │    │
│  │    When silence: ───────────────┤               │    │
│  │         ↓                        ↓               │    │
│  │    OpenAI Whisper          (Continue listening)  │    │
│  │         ↓                                        │    │
│  │    Transcription                                 │    │
│  │         ↓                                        │    │
│  │    OpenAI GPT-4o-mini                            │    │
│  │         ↓                                        │    │
│  │    AI Response Text                              │    │
│  │         ↓                                        │    │
│  │    ElevenLabs (STREAM!)                          │    │
│  │         ↓                                        │    │
│  │    Audio chunks ──> WebSocket ──> Twilio         │    │
│  │                                                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │  State Management                                │    │
│  │  • Call state (Redis or in-memory)               │    │
│  │  • Conversation context                          │    │
│  │  • Audio buffers (transient only)                │    │
│  └─────────────────────────────────────────────────┘    │
│                                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Integration Layer                               │    │
│  │  • Twilio API                                    │    │
│  │  • OpenAI API (Whisper + GPT)                    │    │
│  │  • ElevenLabs API (Streaming TTS)                │    │
│  │  • Supabase (KB + Sessions)                      │    │
│  │  • Email Service (Brevo)                         │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### Key Performance Optimizations

1. **Parallel Processing:** STT, AI, and TTS happen in pipeline (not sequential)
2. **Streaming TTS:** Start playing audio before full generation complete
3. **WebSocket:** No HTTP overhead, continuous connection
4. **Voice Activity Detection (VAD):** Detect speech end immediately
5. **Predictive Response:** Start AI processing during user speech
6. **Audio Buffering:** Optimal chunk sizes for low latency

**Target Latency Breakdown:**
- Speech end detection (VAD): ~100ms
- Whisper transcription: ~300-500ms
- AI response generation: ~800-1200ms
- ElevenLabs TTS (streaming): ~200ms to first audio
- **Total response time: ~1.4-2.0 seconds**

---

## 📁 New Repo Structure

### Recommended Name: `aspire-voice-platform`

```
aspire-voice-platform/
├── README.md
├── package.json
├── .env.example
├── .gitignore
│
├── server/
│   ├── index.js                    # Main Express server
│   ├── websocket-handler.js        # WebSocket connection manager
│   ├── call-manager.js             # Call state management
│   │
│   ├── audio/
│   │   ├── vad.js                  # Voice Activity Detection
│   │   ├── audio-buffer.js         # Audio buffering and chunking
│   │   └── audio-utils.js          # Format conversion, etc.
│   │
│   ├── services/
│   │   ├── twilio-service.js       # Twilio API integration
│   │   ├── whisper-service.js      # OpenAI Whisper (STT)
│   │   ├── openai-service.js       # OpenAI GPT (AI chat)
│   │   ├── elevenlabs-service.js   # ElevenLabs (TTS streaming)
│   │   ├── supabase-service.js     # Knowledge base + sessions
│   │   └── email-service.js        # Brevo email integration
│   │
│   ├── ai/
│   │   ├── prompt-manager.js       # AI prompts per council
│   │   ├── function-tools.js       # OpenAI function calling
│   │   └── context-manager.js      # Conversation context
│   │
│   ├── config/
│   │   ├── tenants.js              # Council configurations
│   │   ├── voices.js               # Voice IDs per council
│   │   └── constants.js            # System constants
│   │
│   └── utils/
│       ├── logger.js               # Winston logging
│       ├── metrics.js              # Performance metrics
│       └── error-handler.js        # Error handling
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── load/                       # Load testing for concurrent calls
│
├── deployment/
│   ├── Dockerfile                  # Container for deployment
│   ├── docker-compose.yml          # Local development
│   ├── kubernetes/                 # K8s configs (if scaling big)
│   └── fly.toml                    # Fly.io deployment (recommended)
│
├── scripts/
│   ├── test-call.js                # Simulate test call
│   ├── benchmark-latency.js        # Measure response times
│   └── setup-twilio.js             # Twilio number configuration
│
└── docs/
    ├── ARCHITECTURE.md             # Detailed architecture
    ├── API.md                      # API documentation
    ├── DEPLOYMENT.md               # Deployment guide
    ├── LATENCY_OPTIMIZATION.md     # Performance tuning
    └── TROUBLESHOOTING.md          # Common issues
```

---

## 🚀 Technology Stack

### Core Technologies

**Runtime:**
- Node.js 20+ (latest LTS)
- WebSocket (ws library)
- Express.js (HTTP endpoints)

**Real-time Communication:**
- Twilio Programmable Voice (WebSocket Media Streams)
- WebSocket for bidirectional audio streaming
- Server-Sent Events (SSE) for monitoring dashboard

**AI Services:**
- OpenAI Whisper API (speech-to-text)
- OpenAI GPT-4o-mini (conversation)
- ElevenLabs API (text-to-speech with streaming)

**State & Storage:**
- Redis (call state, audio buffers) - optional but recommended
- Supabase (knowledge base, conversation history)
- No audio storage (transient only)

**Deployment:**
- **Fly.io** (recommended - WebSocket support, global edge, low latency)
- Or AWS Lambda + API Gateway WebSocket
- Or Google Cloud Run (WebSocket support)
- Docker containerized

---

## 💎 Premium Features

### 1. Ultra-Low Latency Pipeline

**Streaming Everything:**
```javascript
// Audio flows continuously, not in request/response cycles

Twilio ──[WebSocket]──> Server ──[Stream]──> Whisper
                           │
                           ├──> AI Processing
                           │      │
                           │      ├──> KB Search (parallel)
                           │      └──> Context Retrieval (parallel)
                           │
                           └──[Stream]──> ElevenLabs ──[Stream]──> Twilio
```

**No Waiting:**
- User speaks → Server hears instantly (WebSocket)
- VAD detects end → Transcription starts immediately
- AI response → Streaming to TTS (don't wait for full text)
- TTS chunks → Stream to Twilio (don't wait for full audio)

### 2. Voice Activity Detection (VAD)

**Smart speech detection:**
```javascript
// Detect when user stops speaking
// Don't wait for timeout - immediate response!

import { VAD } from '@ricky0123/vad-node';  // Fast VAD library

const vad = new VAD({
  onSpeechEnd: (audio) => {
    // User stopped speaking - transcribe NOW
    transcribeAndRespond(audio);
  },
  minSilenceMs: 500,  // 500ms silence = user done
  positiveSpeechThreshold: 0.8,  // Confidence threshold
});
```

**Result:** Shaves 1-3 seconds off response time vs fixed timeouts

### 3. Streaming TTS (ElevenLabs WebSocket)

**Stream audio as it's generated:**
```javascript
// Don't wait for full audio generation
// Start playing first chunks immediately

const elevenLabsWs = new WebSocket(
  `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`
);

// As text comes from AI, stream to ElevenLabs
aiResponseStream.on('data', chunk => {
  elevenLabsWs.send(JSON.stringify({
    text: chunk,
    voice_settings: { ... }
  }));
});

// As audio chunks arrive, send to Twilio
elevenLabsWs.on('message', audioChunk => {
  twilioWs.send(audioChunk);  // Immediate playback
});
```

**Result:** User hears response 200-500ms sooner

### 4. Intelligent Barge-In

**Allow user to interrupt AI:**
```javascript
// Premium feature: Detect when user starts speaking
// while AI is talking

if (vadDetectsSpeech() && aiIsSpeaking) {
  stopAIAudio();
  clearAudioBuffer();
  startListeningToUser();
}
```

**Result:** Natural conversation flow

### 5. Multi-Region Deployment

**Deploy close to users:**
```
Sydney, Australia   ──> Fly.io Sydney region
Brisbane           ──> Fly.io Sydney region
Gold Coast         ──> Fly.io Sydney region

Future: USA       ──> Fly.io US region
```

**Result:** 20-50ms latency reduction vs single region

### 6. Advanced Monitoring

**Real-time metrics:**
- Call duration
- Response latency (per stage)
- AI accuracy
- Transcription quality
- Cost per call
- Error rates

**Dashboard:** Real-time monitoring UI showing all active calls

---

## 🔐 Security & Privacy

### Transient Audio Processing

**No audio storage:**
```javascript
class AudioBuffer {
  constructor(callSid) {
    this.callSid = callSid;
    this.chunks = [];  // In-memory only
  }

  add(chunk) {
    this.chunks.push(chunk);
  }

  clear() {
    this.chunks = [];  // Immediately garbage collected
    console.log(`[${this.callSid}] Audio buffer cleared - no storage`);
  }
}

// On call end
callManager.on('callEnd', (callSid) => {
  audioBuffers.get(callSid).clear();
  audioBuffers.delete(callSid);
  // Audio is gone - can't be recovered
});
```

### Privacy Compliance

- ✅ Audio processed in real-time only
- ✅ Transcripts stored (same as text chat)
- ✅ No call recordings
- ✅ Tenant data isolation
- ✅ GDPR compliant (can delete all data per user)
- ✅ Australian data residency (Fly.io Sydney region)

---

## 💰 Cost Analysis

### Cost Per Minute (Detailed)

**Inbound Call (Customer calls council):**
- Twilio Voice (inbound): $0.0085/min AUD
- Twilio Voice (usage): $0.0085/min AUD
- OpenAI Whisper: ~$0.006/min (based on $0.006/min transcription)
- OpenAI GPT-4o-mini: ~$0.005/min (average conversation)
- ElevenLabs: ~$0.015/min (professional tier)
- Fly.io compute: ~$0.001/min (amortized)
- **Total: ~$0.044/min AUD (~3¢ USD)**

**Outbound Call (If needed):**
- Twilio Voice (outbound): $0.015/min AUD
- Other costs same as above
- **Total: ~$0.051/min AUD (~3.5¢ USD)**

### Monthly Costs at Scale

**10 councils, 1000 minutes/month each:**
- Voice costs: 10,000 min × $0.044 = **$440 AUD/month**
- Server (Fly.io): **$25-50 AUD/month**
- Database (Supabase): **Free tier**
- **Total: ~$465-490 AUD/month**

**VAPI equivalent:**
- 10,000 min × $0.18 = **$1,800 USD/month**

**Savings: $1,350 USD/month (75%)**

### ROI Analysis

**Development cost:** ~2-3 weeks (one-time)
**Break-even:** After 1 month of 10,000 minutes usage
**Ongoing savings:** $16,200 USD/year

---

## 🔧 Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1)

**Day 1-2: Server Setup**
- [ ] Initialize Node.js project
- [ ] Set up Express server
- [ ] Configure WebSocket server
- [ ] Twilio WebSocket integration
- [ ] Basic call routing

**Day 3-4: Audio Pipeline**
- [ ] Voice Activity Detection (VAD)
- [ ] Audio buffering and chunking
- [ ] Whisper API integration
- [ ] Audio format conversions

**Day 5: Testing**
- [ ] End-to-end test call
- [ ] Measure baseline latency
- [ ] Fix issues

### Phase 2: AI Integration (Week 2)

**Day 6-7: OpenAI Integration**
- [ ] Port ai-chat.js logic to voice platform
- [ ] Conversation context management
- [ ] Knowledge base integration
- [ ] Function calling (email tool)

**Day 8-9: ElevenLabs Integration**
- [ ] Text-to-speech API
- [ ] Streaming TTS implementation
- [ ] Voice configuration per council
- [ ] Audio quality optimization

**Day 10: End-to-End Testing**
- [ ] Complete conversation flow
- [ ] Service request handling
- [ ] Email integration
- [ ] Measure full latency

### Phase 3: Production Optimization (Week 3)

**Day 11-12: Performance**
- [ ] Latency optimization (<2s target)
- [ ] Streaming pipeline optimization
- [ ] Parallel processing
- [ ] Caching strategies

**Day 13-14: Production Features**
- [ ] Error handling
- [ ] Retry logic
- [ ] Graceful degradation
- [ ] Monitoring and logging
- [ ] Call quality metrics

**Day 15: Deployment**
- [ ] Deploy to Fly.io (or chosen platform)
- [ ] Configure multi-region
- [ ] DNS and phone number setup
- [ ] Production testing

---

## 🎯 Success Metrics

### Technical Metrics

**Latency (Primary Goal):**
- ✅ Response time: <2 seconds (target: 1.5s)
- ✅ First audio playback: <1 second from speech end
- ✅ Transcription accuracy: >95%
- ✅ Voice quality: Indistinguishable from human

**Reliability:**
- ✅ Uptime: >99.9%
- ✅ Call completion rate: >98%
- ✅ Error rate: <1%
- ✅ Concurrent calls: 100+ per server

### Business Metrics

**Cost:**
- ✅ Cost per minute: <$0.05 AUD
- ✅ vs VAPI: 75% reduction
- ✅ Predictable pricing (no platform fees)

**Scalability:**
- ✅ Add new council: <30 minutes (same as text chat)
- ✅ No per-seat fees
- ✅ No platform limitations

---

## 🌟 Premium Differentiators

### What Makes This Better Than VAPI?

**1. Latency:**
- Your system: ~1.5 seconds
- VAPI: ~3-4 seconds
- **2x faster**

**2. Control:**
- Your system: Full control over every component
- VAPI: Black box, limited configuration
- **Complete ownership**

**3. Cost:**
- Your system: ~4¢/min
- VAPI: ~18¢/min
- **75% cheaper**

**4. Quality:**
- Your system: Direct ElevenLabs integration, best voices
- VAPI: Limited voice options
- **Premium quality**

**5. Features:**
- Your system: Barge-in, streaming, custom logic, unlimited
- VAPI: Limited to platform features
- **Unlimited possibilities**

---

## 📦 Deployment Options

### Option 1: Fly.io (Recommended)

**Why Fly.io:**
- ✅ WebSocket support out of the box
- ✅ Global edge network (Sydney region!)
- ✅ Low latency (~20-50ms in Australia)
- ✅ Auto-scaling
- ✅ Simple deployment (`fly deploy`)
- ✅ Affordable ($25-50/month)

**Setup:**
```bash
fly launch --name aspire-voice-platform
fly scale memory 512  # Adequate for 50+ concurrent calls
fly regions add syd   # Sydney region
fly deploy
```

### Option 2: AWS Lambda + API Gateway WebSocket

**Why AWS:**
- ✅ Serverless (pay per use)
- ✅ API Gateway supports WebSocket
- ✅ Global CloudFront distribution
- ✅ Enterprise-grade reliability

**Considerations:**
- More complex setup
- Cold start latency (Lambda)
- More expensive at low volume

### Option 3: Google Cloud Run

**Why Cloud Run:**
- ✅ Containerized deployment
- ✅ WebSocket support
- ✅ Auto-scaling
- ✅ Pay per request

---

## 🎨 Council Configuration

### Simple Multi-Tenant Setup

**tenants.js:**
```javascript
export const COUNCILS = {
  moreton: {
    name: "Moreton Bay Regional Council",
    phoneNumber: "+61 7 3205 0555",
    voiceId: "moreton-voice-id",
    greeting: "Thank you for calling Moreton Bay Regional Council...",
    emailTo: "scott@aspireexecutive.com.au",  // Pilot
  },
  goldcoast: {
    name: "Gold Coast City Council",
    phoneNumber: "+61 7 5582 8211",
    voiceId: "goldcoast-voice-id",
    greeting: "Thank you for calling Gold Coast City Council...",
    emailTo: "scott@aspireexecutive.com.au",  // Pilot
  },
};
```

**Add new council:** Same 30-minute process as text chat!

---

## 📊 Monitoring Dashboard

### Real-Time Call Monitoring

**Features:**
- Live call list (who's on a call, duration)
- Latency metrics (per stage)
- Cost tracking (real-time)
- Error alerts
- Transcription view
- AI response view

**Tech:** Simple React dashboard + Server-Sent Events

---

## 🎯 Next Steps

### To Get Started:

1. **Approve architecture** - Does this match your vision?
2. **Choose deployment platform** - Fly.io recommended
3. **Set up accounts:**
   - Twilio (phone numbers)
   - ElevenLabs (voice generation)
   - OpenAI (already have)
   - Fly.io (hosting)
4. **Create new repo** - `aspire-voice-platform`
5. **Start Phase 1** - Build core infrastructure

### Questions to Answer:

1. **Deployment preference?** Fly.io, AWS, Google Cloud, or other?
2. **How many concurrent calls** do you expect initially?
3. **Do you want monitoring dashboard** included in Phase 1?
4. **Barge-in feature** - Priority for Phase 1 or later?
5. **Voice preferences** - Which ElevenLabs voices per council?

---

## 💡 Key Advantages Over Webhook Approach

**What I wrote earlier (voice-handler.js) was webhook-based.**
**This design is streaming-based - massively better:**

| Feature | Webhook Approach | Streaming Approach |
|---------|------------------|-------------------|
| Latency | 3-5 seconds | <2 seconds |
| Barge-in | No | Yes |
| Audio quality | Compressed | High quality |
| Complexity | Simple | Moderate |
| Scalability | Limited | Excellent |
| Production-ready | Demo only | Full production |

**Verdict:** Streaming approach is the only way for premium quality.

---

**This is a production-grade, premium voice platform you'll be proud to own.** 🚀

Ready to create the repo and start building?
