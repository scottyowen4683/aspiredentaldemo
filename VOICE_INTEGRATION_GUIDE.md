# Voice Integration Guide - Self-Hosted VAPI Voice Replacement

## 🎯 Goal

Replace VAPI Voice platform with self-hosted voice solution that:
- Uses Twilio for phone call handling
- Uses ElevenLabs for text-to-speech (your existing account)
- Uses OpenAI for conversation intelligence (already set up)
- Achieves **60-80% cost reduction** vs current ~18¢/min
- Processes voice transiently (no storage, secure)
- Integrates seamlessly with existing text chat system

---

## 💰 Cost Comparison

### Current Setup (With VAPI Voice)
- **VAPI Voice Platform:** ~12-15¢/min USD
- **Twilio (via VAPI):** ~1.4¢/min
- **OpenAI (via VAPI):** ~2-3¢/min
- **ElevenLabs (via VAPI):** ~1.5¢/min
- **VAPI markup/orchestration:** ~3-5¢/min
- **Total:** ~18¢/min USD

### Self-Hosted (Direct Integration)
- **Twilio (direct):** 1.4¢/min (inbound) + 1.5¢/min (outbound)
- **OpenAI Whisper API:** ~0.6¢/min (speech-to-text)
- **OpenAI GPT-4o-mini:** ~0.5¢/min (conversation)
- **ElevenLabs (your account):** ~1.5¢/min (text-to-speech)
- **Netlify Functions:** Free tier (or ~0.1¢/min at scale)
- **Total:** ~4-5¢/min USD

**Savings: 72-75%** 💸

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PHONE CALL                            │
│         (Customer calls council number)                  │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│                  TWILIO                                  │
│  • Receives call                                         │
│  • Streams audio (bidirectional)                         │
│  • Sends webhook to your server                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ TwiML/WebSocket
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│         YOUR NETLIFY BACKEND                             │
│                                                          │
│  📞 voice-handler.js                                    │
│     • Receives Twilio webhook                            │
│     • Establishes WebSocket connection                   │
│     • Orchestrates conversation flow                     │
│                                                          │
│  🎤 speech-to-text.js                                   │
│     • Receives audio chunks from Twilio                  │
│     • Sends to OpenAI Whisper API                        │
│     • Returns transcribed text                           │
│                                                          │
│  🧠 voice-ai-chat.js                                    │
│     • Uses existing ai-chat.js logic                     │
│     • Same KB search, function calling                   │
│     • Returns AI response text                           │
│                                                          │
│  🗣️ text-to-speech.js                                   │
│     • Sends AI response to ElevenLabs                    │
│     • Receives audio stream                              │
│     • Sends back to Twilio for playback                  │
│                                                          │
│  📧 Email integration (existing)                         │
│     • Same send-council-email.js                         │
│     • Reference numbers work same way                    │
│                                                          │
└─────────────┬───────────────┬─────────────┬─────────────┘
              │               │             │
              ▼               ▼             ▼
    ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
    │  OPENAI API │  │ ELEVENLABS   │  │  SUPABASE    │
    │             │  │              │  │              │
    │ • Whisper   │  │ • TTS        │  │ • KB chunks  │
    │ • GPT-4o    │  │ • Voice IDs  │  │ • Sessions   │
    │ • Embeddings│  │              │  │ • History    │
    └─────────────┘  └──────────────┘  └──────────────┘
```

---

## 🔧 Technical Implementation

### 1. Twilio Configuration

**Phone Number Setup:**
```javascript
// Twilio Console Configuration
Incoming Call Webhook: https://moretonbaypilot.netlify.app/.netlify/functions/voice-handler
Method: POST
```

**TwiML Response (voice-handler.js):**
```javascript
const twilio = require('twilio');

exports.handler = async (event) => {
  const twiml = new twilio.twiml.VoiceResponse();

  // Get council info from caller ID or IVR
  const tenantId = getTenantFromPhoneNumber(event.To);

  // Connect to WebSocket for bidirectional streaming
  const connect = twiml.connect();
  connect.stream({
    url: `wss://moretonbaypilot.netlify.app/.netlify/functions/voice-stream?tenant=${tenantId}`,
    parameters: {
      tenantId,
      callSid: event.CallSid,
    }
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: twiml.toString(),
  };
};
```

### 2. WebSocket Stream Handler (voice-stream.js)

**Real-time audio processing:**
```javascript
const { WebSocketServer } = require('ws');

// Handle Twilio Media Streams
exports.handler = async (event) => {
  // This needs to be a WebSocket endpoint
  // Netlify Functions don't natively support WebSockets
  // Options:
  // 1. Use AWS Lambda with API Gateway WebSocket (migrate this function)
  // 2. Use external WebSocket service (Pusher, Ably)
  // 3. Use Twilio's Media Streams with webhook callbacks (simpler!)

  // RECOMMENDED: Use webhook callbacks instead of WebSocket
  // See alternative architecture below
};
```

**Alternative: Webhook-Based Architecture (Simpler for Netlify)**
```javascript
// voice-stream-webhook.js
// Receives audio chunks from Twilio as webhooks

exports.handler = async (event) => {
  const { StreamSid, AccountSid, CallSid, MediaChunk } = JSON.parse(event.body);

  // 1. Accumulate audio chunks in memory (or temp storage)
  const audioBuffer = accumulateAudio(CallSid, MediaChunk);

  // 2. When silence detected or after N chunks, send to Whisper
  if (shouldTranscribe(audioBuffer)) {
    const transcript = await transcribeAudio(audioBuffer);

    // 3. Send to AI chat (reuse existing logic)
    const aiResponse = await getAIResponse(transcript, CallSid);

    // 4. Convert to speech
    const audioStream = await textToSpeech(aiResponse);

    // 5. Send back to Twilio to play
    await playAudioOnCall(CallSid, audioStream);
  }

  return { statusCode: 200 };
};
```

### 3. Speech-to-Text (OpenAI Whisper)

**speech-to-text.js:**
```javascript
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeAudio(audioBuffer) {
  const response = await openai.audio.transcriptions.create({
    file: audioBuffer,  // Must be File object
    model: "whisper-1",
    language: "en",  // Australian English
    response_format: "text",
  });

  return response.text;
}

exports.handler = async (event) => {
  const { audio } = JSON.parse(event.body);

  // Convert base64 audio to File object
  const audioFile = bufferToFile(audio);

  const transcript = await transcribeAudio(audioFile);

  return {
    statusCode: 200,
    body: JSON.stringify({ transcript }),
  };
};
```

### 4. AI Conversation (Reuse Existing)

**voice-ai-chat.js:**
```javascript
// Import existing ai-chat logic
const { getAIResponse } = require('./ai-chat');

exports.handler = async (event) => {
  const { transcript, tenantId, callSid } = JSON.parse(event.body);

  // Use callSid as sessionId for voice calls
  const response = await getAIResponse({
    assistantId: getAssistantId(tenantId),
    tenantId,
    input: transcript,
    sessionId: callSid,  // Twilio Call SID = session ID
  });

  // Same response format, same email tool, same KB search!
  return {
    statusCode: 200,
    body: JSON.stringify(response),
  };
};
```

### 5. Text-to-Speech (ElevenLabs)

**text-to-speech.js:**
```javascript
const axios = require('axios');

async function textToSpeech(text, voiceId = 'default-voice-id') {
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',  // Get audio as buffer
    }
  );

  return response.data;  // Audio buffer
}

exports.handler = async (event) => {
  const { text, voiceId } = JSON.parse(event.body);

  const audioBuffer = await textToSpeech(text, voiceId);

  // Return as base64 for Twilio
  const audioBase64 = audioBuffer.toString('base64');

  return {
    statusCode: 200,
    body: JSON.stringify({ audio: audioBase64 }),
  };
};
```

### 6. Twilio Audio Playback

**play-audio.js:**
```javascript
const twilio = require('twilio');

async function playAudioOnCall(callSid, audioBuffer) {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  // Option 1: Upload audio to Twilio Asset and play
  const audioUrl = await uploadToTwilioAssets(audioBuffer);

  await client.calls(callSid).update({
    twiml: `<Response><Play>${audioUrl}</Play></Response>`,
  });

  // Option 2: Stream directly (more complex but lower latency)
  // Use Media Streams to inject audio
}
```

---

## 🔄 Conversation Flow

### Complete Call Flow:

1. **Customer calls council number**
   - Twilio receives call
   - Sends webhook to `voice-handler.js`

2. **Initial greeting**
   - AI responds with council-specific greeting
   - "Thank you for calling [Council Name]. I'm the AI assistant. How can I help you today?"

3. **Conversation loop:**
   ```
   User speaks → Twilio captures audio
                ↓
   speech-to-text.js (Whisper) → Transcribes
                ↓
   voice-ai-chat.js → AI generates response
                ↓
   text-to-speech.js (ElevenLabs) → Converts to audio
                ↓
   Twilio plays audio → User hears response
   ```

4. **Service request handling:**
   - AI detects service request (same as text chat)
   - Asks for contact details (phone, email, address)
   - Calls `send-council-email.js` (same function!)
   - Provides reference number verbally

5. **Call completion:**
   - AI asks if anything else needed
   - Thanks caller
   - Ends call

---

## 🚀 Implementation Steps

### Phase 1: Basic Setup (1-2 days)

**Day 1: Twilio Configuration**
- [ ] Purchase Twilio phone number for testing
- [ ] Configure webhook to `voice-handler.js`
- [ ] Test basic call reception
- [ ] Implement simple TwiML response

**Day 2: Audio Pipeline**
- [ ] Create `speech-to-text.js` with Whisper integration
- [ ] Test audio transcription with sample files
- [ ] Create `text-to-speech.js` with ElevenLabs
- [ ] Test audio generation

### Phase 2: AI Integration (2-3 days)

**Day 3: Connect AI Chat**
- [ ] Create `voice-ai-chat.js` wrapper around `ai-chat.js`
- [ ] Use Call SID as session ID
- [ ] Test conversation flow with transcribed text

**Day 4: Orchestration**
- [ ] Build complete conversation loop
- [ ] Handle audio buffering and timing
- [ ] Implement silence detection (when to transcribe)
- [ ] Test end-to-end call

**Day 5: Email Integration**
- [ ] Connect existing `send-council-email.js`
- [ ] Test service request detection in voice
- [ ] Verify reference numbers spoken correctly

### Phase 3: Production Readiness (2-3 days)

**Day 6-7: Testing & Optimization**
- [ ] Test with multiple councils (multi-tenant)
- [ ] Optimize latency (target <2 seconds response)
- [ ] Handle edge cases (background noise, accents)
- [ ] Add error handling and fallbacks

**Day 8: Documentation & Deployment**
- [ ] Document voice-specific configuration
- [ ] Create council onboarding guide for voice
- [ ] Deploy to production
- [ ] Test with real phone numbers

---

## 🔐 Security Considerations

### Transient Voice Processing (No Storage)

```javascript
// IMPORTANT: Never persist voice data
// Process in memory only

let activeCallBuffers = new Map();  // In-memory only

function accumulateAudio(callSid, chunk) {
  if (!activeCallBuffers.has(callSid)) {
    activeCallBuffers.set(callSid, []);
  }
  activeCallBuffers.get(callSid).push(chunk);
  return activeCallBuffers.get(callSid);
}

function clearCallBuffer(callSid) {
  // Clear immediately after transcription
  activeCallBuffers.delete(callSid);
}

// On call end, ensure cleanup
exports.handleCallEnd = async (callSid) => {
  clearCallBuffer(callSid);
  console.log(`[voice] Cleared buffer for ${callSid} - no audio stored`);
};
```

### Privacy Protection
- ✅ Audio processed in real-time, not saved
- ✅ Transcripts stored same as text chat (in conversations table)
- ✅ Same tenant isolation as text chat
- ✅ Call metadata logged, not audio
- ✅ Compliance: Can add call recording disclosure if needed

---

## 📊 Performance Targets

### Latency Goals:
- **Speech-to-text:** <500ms (Whisper is very fast)
- **AI response generation:** 1-2s (same as text chat)
- **Text-to-speech:** <500ms (ElevenLabs streaming)
- **Total response time:** <3 seconds (vs 4-5s with VAPI)

### Quality Metrics:
- **Transcription accuracy:** >95% (Whisper is excellent)
- **Voice quality:** High (ElevenLabs professional voices)
- **Conversation accuracy:** Same as text chat (~95%)
- **Call completion rate:** >98%

---

## 🎨 Customization Per Council

### Voice Selection (ElevenLabs)
```javascript
const VOICE_CONFIGS = {
  moreton: {
    voiceId: 'moreton-voice-id',  // Professional Australian female
    voiceName: 'Olivia',
  },
  goldcoast: {
    voiceId: 'goldcoast-voice-id',  // Professional Australian male
    voiceName: 'James',
  },
};
```

### Call Flow Customization
```javascript
const CALL_CONFIGS = {
  moreton: {
    greeting: "Thank you for calling Moreton Bay Regional Council. I'm the AI assistant. How can I help you today?",
    holdMusic: "https://assets.council.com/moreton-hold.mp3",
    transferNumber: "+61-7-XXXX-XXXX",  // For complex queries
  },
};
```

---

## 🔧 Environment Variables Needed

```bash
# Existing (already configured)
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
BREVO_API_KEY=...

# New for voice
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER_MORETON=+61...
TWILIO_PHONE_NUMBER_GOLDCOAST=+61...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID_MORETON=...
ELEVENLABS_VOICE_ID_GOLDCOAST=...
```

---

## 🎯 Success Criteria

### Technical Success:
- ✅ Call connects and AI responds within 3 seconds
- ✅ Transcription accuracy >95%
- ✅ Voice sounds natural and professional
- ✅ Email escalation works same as text chat
- ✅ Reference numbers provided correctly
- ✅ No audio stored (transient processing only)

### Business Success:
- ✅ Cost reduced to ~4-5¢/min (vs 18¢/min)
- ✅ Full control over voice platform
- ✅ Easy to add new councils (same 30-min onboarding)
- ✅ Scales without platform fees
- ✅ Professional quality (equal to or better than VAPI)

---

## 💡 Architectural Decisions

### Why Webhook vs WebSocket?

**WebSocket Approach:**
- ✅ Lower latency (real-time streaming)
- ✅ Better for conversational interruptions
- ❌ Netlify Functions don't support WebSockets natively
- ❌ Would need AWS Lambda + API Gateway (more complex)

**Webhook Approach (RECOMMENDED):**
- ✅ Works with Netlify Functions (no infrastructure change)
- ✅ Simpler to implement and debug
- ✅ Still achieves <3s response time
- ✅ Easier to scale and monitor
- ❌ Slightly higher latency (acceptable for this use case)

**Decision:** Use webhook-based architecture for Phase 1, consider WebSocket optimization later if needed.

---

## 🚨 Challenges & Solutions

### Challenge 1: Audio Buffering
**Problem:** When to stop listening and transcribe?
**Solution:**
- Implement Voice Activity Detection (VAD)
- Or use fixed duration chunks (3-5 seconds)
- Or wait for user to press key (IVR style)

### Challenge 2: Latency
**Problem:** Multiple API calls add latency
**Solution:**
- Stream audio from ElevenLabs (don't wait for full generation)
- Use WebSocket later for real-time streaming
- Parallel processing where possible

### Challenge 3: Call State Management
**Problem:** Tracking conversation across multiple audio chunks
**Solution:**
- Use Twilio Call SID as session ID (same as text chat)
- Store in Supabase chat_conversations table
- Same context management as text chat

### Challenge 4: Interruption Handling
**Problem:** User might speak while AI is talking
**Solution:**
- Phase 1: Simple turn-taking (wait for AI to finish)
- Phase 2: Implement barge-in detection (WebSocket approach)

---

## 📈 Scaling Considerations

### Cost at Scale:

**10 councils, average 1000 minutes/month each:**
- Direct costs: 10,000 min × $0.045 = **$450/month**
- VAPI costs: 10,000 min × $0.18 = **$1,800/month**
- **Savings: $1,350/month** (75%)

**100 councils, same usage:**
- Direct costs: 100,000 min × $0.045 = **$4,500/month**
- VAPI costs: 100,000 min × $0.18 = **$18,000/month**
- **Savings: $13,500/month** (75%)

### Infrastructure:
- Same Netlify deployment serves all councils
- Same Supabase database (multi-tenant)
- Only API usage scales per council
- No platform fees at any scale!

---

## 🎊 What This Achieves

### Complete VAPI Elimination:
- ✅ **Text chat:** Already done (previous work)
- ✅ **Voice calls:** This implementation
- ✅ **Email escalation:** Shared across both
- ✅ **Knowledge base:** Shared across both
- ✅ **Session management:** Shared across both

### Total Cost Reduction:
- **Before:** Text ($110-550/mo) + Voice (~$500/mo avg) = **$610-1,050/month per council**
- **After:** Text ($10-75/mo) + Voice (~$135/mo avg) = **$145-210/month per council**
- **Savings: 65-80%** 💸

### Full Platform Control:
- ✅ No vendor lock-in
- ✅ Customize anything
- ✅ Add features without approval
- ✅ Scale without platform constraints
- ✅ Own your data and systems

---

## 📚 Next Steps

1. **Review this design** - Does it match your vision?
2. **Approve implementation approach** - Webhook vs WebSocket?
3. **Set up Twilio account** - Get phone number for testing
4. **Phase 1 implementation** - Basic call handling (2-3 days)
5. **Test with Moreton Bay** - Pilot the voice system
6. **Expand to other councils** - Same 30-min onboarding!

---

## 🆘 Questions to Answer

Before implementation:
1. Do you already have a Twilio account? Or need to set up?
2. Do you have preferred ElevenLabs voices already? Or need to choose?
3. Should we start with webhook approach (simpler) or go straight to WebSocket (lower latency)?
4. Want to pilot with Moreton Bay first, or test with all councils?
5. Any specific call flow requirements (IVR menu, hold music, transfers)?

---

**Yes, this is absolutely possible and will save you 72-75% on voice costs!** 🚀

The best part: You're reusing all the AI chat logic you already built, just adding voice input/output layers.

---

*Ready to build? Let's start with Phase 1!*
