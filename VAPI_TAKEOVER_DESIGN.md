# VAPI Takeover - Complete Platform Design

## 🎯 Vision

Create a **production-grade, self-hosted AI platform** that completely replaces VAPI while maintaining all the features of your existing aspire-vapi-ghl portal:

- ✅ **Complete VAPI removal** - Direct Twilio + ElevenLabs + OpenAI integration
- ✅ **Keep all portal features** - Admin dashboard, cost tracking, Google auth, MFA
- ✅ **Council monitoring** - Track interactions per council for billing
- ✅ **Chatbot registration** - Register both voice and chat bots, track and rank them
- ✅ **Session management** - Auto-timeout sessions, count as interactions
- ✅ **Super user views** - See all costs, usage, interactions by council
- ✅ **Uses YOUR Supabase** - Integrate with existing database
- ✅ **Same ease of use** - Simple assistant ID updates

---

## 📊 What You Have Now (aspire-vapi-ghl)

### Current Portal Features
- **Authentication:** Google OAuth + MFA (TOTP)
- **Roles:** Super admin (you) + Org admin (councils)
- **Organizations:** Multi-tenant with org_id isolation
- **Assistants:** Voice/chat bots with provider keys
- **Conversations:** Full transcripts, scoring, evaluation
- **Cost Tracking:** VAPI costs, LLM costs, TTS/STT costs breakdown
- **Review Queue:** Flag low-scoring conversations
- **Audit Logs:** Track all admin actions
- **Reports:** Monthly PDF reports per organization
- **GHL Integration:** GoHighLevel sync (optional)

### Current Database Schema (Simplified)
```sql
organizations (councils)
  ├── assistants (voice & chat bots)
  ├── conversations (transcripts, costs, scores)
  ├── scores (AI evaluation of conversations)
  ├── cost_usage (monthly tracking)
  ├── reports (PDF reports)
  └── users (org admins)

users (super_admin or org_admin)
audit_logs (all actions)
review_queue (flagged conversations)
webhook_raw (VAPI webhooks)
```

### Current Pain Points
- **VAPI dependency:** Paying ~18¢/min for voice
- **Limited control:** Can't customize VAPI behavior
- **Cost tracking shows VAPI** - but you don't own the platform
- **Webhook-based:** Relies on VAPI sending webhooks

---

## 🎯 What You'll Get (vapi-takeover)

### New Repository Structure

```
vapi-takeover/
├── README.md
├── package.json
├── .env.example
│
├── frontend/                           # React + TypeScript (from aspire-vapi-ghl)
│   ├── src/
│   │   ├── App.tsx                     # Main app with routing
│   │   ├── components/
│   │   │   ├── dashboard/              # All dashboard components
│   │   │   │   ├── CostTracker.tsx     # Cost tracking (updated for direct costs)
│   │   │   │   ├── AssistantPerformance.tsx
│   │   │   │   ├── MetricsOverview.tsx
│   │   │   │   └── ...
│   │   │   ├── layout/
│   │   │   │   └── DashboardLayout.tsx
│   │   │   ├── MFA/                    # Multi-factor auth
│   │   │   └── ui/                     # Shadcn components
│   │   ├── pages/
│   │   │   ├── Auth.tsx                # Google OAuth login
│   │   │   ├── SuperAdminDashboard.tsx # Your super user view
│   │   │   ├── OrganizationDashboard.tsx # Council view
│   │   │   ├── Assistants.tsx          # Manage voice/chat bots
│   │   │   ├── Conversations.tsx       # View all conversations
│   │   │   ├── Analytics.tsx           # Usage analytics
│   │   │   └── ...
│   │   ├── context/
│   │   │   └── UserContext.tsx         # User state management
│   │   └── supabaseClient.js           # YOUR Supabase connection
│   │
│   └── netlify/functions/              # Serverless functions (if using Netlify)
│       └── ...
│
├── backend/                            # Voice & Chat Platform (NEW)
│   ├── server.js                       # Main Express + WebSocket server
│   ├── websocket-handler.js            # Twilio WebSocket for voice
│   ├── call-manager.js                 # Call state management
│   │
│   ├── audio/
│   │   ├── vad.js                      # Voice Activity Detection
│   │   ├── audio-buffer.js             # Transient audio buffering
│   │   └── audio-utils.js              # Format conversion
│   │
│   ├── services/
│   │   ├── twilio-service.js           # Twilio Voice API
│   │   ├── whisper-service.js          # OpenAI Whisper (STT)
│   │   ├── openai-service.js           # OpenAI GPT (AI chat)
│   │   ├── elevenlabs-service.js       # ElevenLabs (TTS streaming)
│   │   ├── supabase-service.js         # Database integration
│   │   └── session-service.js          # Session timeout & interaction tracking
│   │
│   ├── ai/
│   │   ├── chat-handler.js             # Chat bot logic (text)
│   │   ├── voice-handler.js            # Voice bot logic
│   │   ├── prompt-manager.js           # Prompts per assistant
│   │   ├── function-tools.js           # OpenAI function calling
│   │   └── context-manager.js          # Conversation context
│   │
│   ├── webhooks/
│   │   ├── conversation-logger.js      # Log conversations to DB
│   │   ├── cost-calculator.js          # Calculate direct costs (no VAPI!)
│   │   └── scoring-trigger.js          # Trigger AI evaluation
│   │
│   └── config/
│       ├── councils.js                 # Council/org configurations
│       └── constants.js                # System constants
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_existing_schema.sql     # Import from aspire-vapi-ghl
│   │   ├── 002_add_direct_voice_fields.sql
│   │   ├── 003_add_chat_bot_support.sql
│   │   ├── 004_add_session_tracking.sql
│   │   └── 005_add_interaction_billing.sql
│   │
│   └── functions/                      # Database functions (optional)
│       └── calculate_monthly_interactions.sql
│
├── deployment/
│   ├── Dockerfile                      # Container for backend
│   ├── fly.toml                        # Fly.io deployment
│   └── netlify.toml                    # Frontend deployment
│
└── docs/
    ├── SETUP_GUIDE.md                  # Initial setup instructions
    ├── MIGRATION_FROM_VAPI.md          # How to migrate existing assistants
    ├── COUNCIL_ONBOARDING.md           # Add new councils
    ├── ASSISTANT_REGISTRATION.md       # Register voice/chat bots
    └── BILLING_GUIDE.md                # Track interactions for billing
```

---

## 🔑 Key Features (Detailed)

### 1. Complete VAPI Removal

**Voice Calls:**
```
Before (VAPI):
User → Twilio → VAPI → Your Webhook → Database

After (vapi-takeover):
User → Twilio → Your Backend → Database
        ↓
   WebSocket streaming
        ↓
   Whisper + GPT + ElevenLabs
        ↓
   Direct cost tracking
```

**Chat Bots:**
```
Before (VAPI):
User → Widget → VAPI API → Your Webhook → Database

After (vapi-takeover):
User → Widget → Your Backend → Database
        ↓
   OpenAI GPT directly
        ↓
   Knowledge base search
        ↓
   Direct cost tracking
```

### 2. Assistant Registration System

**Database Enhancement:**
```sql
-- Update assistants table
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS bot_type TEXT CHECK (bot_type IN ('voice', 'chat'));
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS phone_number TEXT; -- For voice bots
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS widget_config JSONB; -- For chat bots
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS performance_rank INTEGER;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS avg_interaction_time INTEGER; -- seconds
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS total_interactions INTEGER DEFAULT 0;
ALTER TABLE assistants ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Track both voice and chat costs directly
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS whisper_cost NUMERIC(12,6);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS gpt_cost NUMERIC(12,6);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS elevenlabs_cost NUMERIC(12,6);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS twilio_cost NUMERIC(12,6);
-- Remove vapi_cost field or set to 0
```

**Assistant Registration Flow:**
```typescript
// Register a new voice assistant
{
  org_id: "council-uuid",
  bot_type: "voice",
  friendly_name: "Moreton Bay Voice Assistant",
  phone_number: "+61732050555",
  provider: "direct", // No longer "vapi"
  assistant_key: "moreton-voice-001",
  prompt: "You are a helpful voice assistant for Moreton Bay...",
  elevenlabs_voice_id: "voice-id-here",
  auto_score: true,
  active: true
}

// Register a new chat assistant
{
  org_id: "council-uuid",
  bot_type: "chat",
  friendly_name: "Gold Coast Chat Assistant",
  provider: "direct",
  assistant_key: "goldcoast-chat-001",
  prompt: "You are a helpful chat assistant for Gold Coast...",
  widget_config: {
    primaryColor: "#0072ce",
    greeting: "Hi! How can I help you today?",
    title: "Gold Coast AI Assistant"
  },
  auto_score: true,
  active: true
}
```

### 3. Session Timeout & Interaction Tracking

**Session Management:**
```javascript
// backend/services/session-service.js

class SessionService {
  constructor() {
    this.activeSessions = new Map(); // In-memory active sessions
    this.SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  }

  startSession({ assistantId, orgId, sessionId, channel }) {
    const session = {
      sessionId,
      assistantId,
      orgId,
      channel, // 'voice' or 'chat'
      startedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      timeout: null
    };

    this.activeSessions.set(sessionId, session);
    this.scheduleTimeout(sessionId);

    // Log to database
    await supabase.from('conversations').insert({
      id: sessionId,
      org_id: orgId,
      assistant_id: assistantId,
      provider: 'direct',
      is_voice: channel === 'voice',
      created_at: new Date()
    });
  }

  updateActivity(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      session.messageCount++;

      // Reset timeout
      clearTimeout(session.timeout);
      this.scheduleTimeout(sessionId);
    }
  }

  scheduleTimeout(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.timeout = setTimeout(() => {
      this.endSession(sessionId, 'timeout');
    }, this.SESSION_TIMEOUT);
  }

  async endSession(sessionId, reason) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const duration = (Date.now() - session.startedAt) / 1000; // seconds

    // Update database - count as 1 interaction
    await supabase.from('conversations').update({
      ended_at: new Date(),
      end_reason: reason,
      call_duration: duration,
      updated_at: new Date()
    }).eq('id', sessionId);

    // Increment total interactions for assistant
    await supabase.from('assistants')
      .update({
        total_interactions: supabase.raw('total_interactions + 1'),
        avg_interaction_time: supabase.raw(`
          (avg_interaction_time * total_interactions + ${duration}) / (total_interactions + 1)
        `)
      })
      .eq('id', session.assistantId);

    // Cleanup
    clearTimeout(session.timeout);
    this.activeSessions.delete(sessionId);
  }
}
```

### 4. Council Interaction Billing

**New Database View:**
```sql
-- View for billing: interactions per council per month
CREATE OR REPLACE VIEW council_monthly_interactions AS
SELECT
  o.id as org_id,
  o.name as council_name,
  DATE_TRUNC('month', c.created_at) as month,
  COUNT(*) as total_interactions,
  COUNT(*) FILTER (WHERE c.is_voice = true) as voice_interactions,
  COUNT(*) FILTER (WHERE c.is_voice = false) as chat_interactions,
  SUM(c.call_duration) as total_duration_seconds,
  SUM(c.total_cost) as total_cost,
  SUM(c.whisper_cost + c.gpt_cost + c.elevenlabs_cost + c.twilio_cost) as direct_costs,
  AVG(c.call_duration) as avg_duration_seconds
FROM organizations o
LEFT JOIN conversations c ON c.org_id = o.id
WHERE c.created_at >= DATE_TRUNC('month', NOW() - INTERVAL '12 months')
GROUP BY o.id, o.name, DATE_TRUNC('month', c.created_at)
ORDER BY month DESC, council_name;
```

**Super Admin Dashboard Enhancement:**
```typescript
// frontend/src/pages/SuperAdminDashboard.tsx

// Add "Interactions by Council" section
const [councilInteractions, setCouncilInteractions] = useState([]);

useEffect(() => {
  async function loadCouncilInteractions() {
    const { data } = await supabase
      .from('council_monthly_interactions')
      .select('*')
      .eq('month', new Date().toISOString().slice(0, 7)) // Current month
      .order('total_interactions', { ascending: false });

    setCouncilInteractions(data);
  }
  loadCouncilInteractions();
}, []);

// Display in dashboard
<Card>
  <CardHeader>
    <CardTitle>Interactions by Council (This Month)</CardTitle>
    <CardDescription>Billing basis: interactions per council</CardDescription>
  </CardHeader>
  <CardContent>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Council</TableHead>
          <TableHead>Voice</TableHead>
          <TableHead>Chat</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Avg Duration</TableHead>
          <TableHead>Direct Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {councilInteractions.map(council => (
          <TableRow key={council.org_id}>
            <TableCell>{council.council_name}</TableCell>
            <TableCell>{council.voice_interactions}</TableCell>
            <TableCell>{council.chat_interactions}</TableCell>
            <TableCell className="font-bold">{council.total_interactions}</TableCell>
            <TableCell>{formatDuration(council.avg_duration_seconds)}</TableCell>
            <TableCell>${council.direct_costs.toFixed(2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

### 5. Assistant Performance Ranking

**Auto-Ranking System:**
```sql
-- Function to calculate assistant ranks
CREATE OR REPLACE FUNCTION update_assistant_rankings()
RETURNS void AS $$
BEGIN
  -- Rank based on: total interactions, avg score, containment rate
  WITH ranked AS (
    SELECT
      a.id,
      a.org_id,
      ROW_NUMBER() OVER (
        PARTITION BY a.org_id
        ORDER BY
          a.total_interactions DESC,
          AVG(s.scores->>'overall') DESC,
          COUNT(*) FILTER (WHERE c.success_evaluation = true)::FLOAT / NULLIF(COUNT(*), 0) DESC
      ) as rank
    FROM assistants a
    LEFT JOIN conversations c ON c.assistant_id = a.id
    LEFT JOIN scores s ON s.conversation_id = c.id AND s.is_used = true
    WHERE a.active = true
    GROUP BY a.id, a.org_id
  )
  UPDATE assistants a
  SET performance_rank = r.rank
  FROM ranked r
  WHERE a.id = r.id;
END;
$$ LANGUAGE plpgsql;

-- Run daily via cron
SELECT cron.schedule('update_rankings', '0 2 * * *', 'SELECT update_assistant_rankings()');
```

**Display in Dashboard:**
```typescript
// Show assistant leaderboard
<Card>
  <CardHeader>
    <CardTitle>Assistant Performance Leaderboard</CardTitle>
  </CardHeader>
  <CardContent>
    {assistants
      .sort((a, b) => a.performance_rank - b.performance_rank)
      .map(assistant => (
        <div key={assistant.id} className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-4">
            <Badge variant={assistant.performance_rank <= 3 ? "default" : "outline"}>
              #{assistant.performance_rank}
            </Badge>
            <div>
              <div className="font-medium">{assistant.friendly_name}</div>
              <div className="text-sm text-muted-foreground">
                {assistant.bot_type === 'voice' ? '🎙️ Voice' : '💬 Chat'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold">{assistant.total_interactions}</div>
            <div className="text-sm text-muted-foreground">interactions</div>
          </div>
        </div>
      ))
    }
  </CardContent>
</Card>
```

### 6. Direct Cost Tracking (No VAPI)

**Cost Calculator:**
```javascript
// backend/webhooks/cost-calculator.js

class CostCalculator {
  // Pricing (update as needed)
  static PRICING = {
    whisper: 0.006 / 60, // $0.006 per minute = $0.0001 per second
    gpt4oMini: {
      input: 0.15 / 1000000, // $0.15 per 1M tokens
      output: 0.60 / 1000000  // $0.60 per 1M tokens
    },
    elevenlabs: 0.30 / 1000, // $0.30 per 1K characters
    twilio: {
      inbound: 0.0085 / 60, // Per second
      outbound: 0.015 / 60
    }
  };

  static calculateVoiceCallCost({ duration, transcript, tokensIn, tokensOut, isInbound = true }) {
    // Whisper cost (transcription)
    const whisperCost = duration * this.PRICING.whisper;

    // GPT cost
    const gptCost = (tokensIn * this.PRICING.gpt4oMini.input) +
                    (tokensOut * this.PRICING.gpt4oMini.output);

    // ElevenLabs cost (TTS)
    const charCount = transcript.split(' ').reduce((sum, word) => sum + word.length, 0);
    const elevenlabsCost = charCount * this.PRICING.elevenlabs;

    // Twilio cost
    const twilioCost = duration * (isInbound ? this.PRICING.twilio.inbound : this.PRICING.twilio.outbound);

    const totalCost = whisperCost + gptCost + elevenlabsCost + twilioCost;

    return {
      whisper_cost: whisperCost,
      gpt_cost: gptCost,
      elevenlabs_cost: elevenlabsCost,
      twilio_cost: twilioCost,
      total_cost: totalCost,
      cost_breakdown: {
        whisper: whisperCost,
        gpt: gptCost,
        elevenlabs: elevenlabsCost,
        twilio: twilioCost
      }
    };
  }

  static calculateChatCost({ tokensIn, tokensOut }) {
    const gptCost = (tokensIn * this.PRICING.gpt4oMini.input) +
                    (tokensOut * this.PRICING.gpt4oMini.output);

    return {
      gpt_cost: gptCost,
      total_cost: gptCost,
      cost_breakdown: {
        gpt: gptCost
      }
    };
  }
}
```

**Updated Cost Tracker Component:**
```typescript
// frontend/src/components/dashboard/CostTracker.tsx
// Update to show direct costs instead of VAPI

const breakdown = {
  whisper: totalWhisperCost,
  gpt: totalGptCost,
  elevenlabs: totalElevenlabsCost,
  twilio: totalTwilioCost
  // NO MORE VAPI!
};

// Show comparison vs VAPI
<Card>
  <CardTitle>Cost Savings vs VAPI</CardTitle>
  <CardContent>
    <div className="space-y-2">
      <div>Direct Costs: ${directCost.toFixed(2)}</div>
      <div>VAPI Would Have Been: ${vapiEquivalent.toFixed(2)}</div>
      <div className="font-bold text-green-600">
        Saved: ${(vapiEquivalent - directCost).toFixed(2)} (
        {((vapiEquivalent - directCost) / vapiEquivalent * 100).toFixed(1)}%)
      </div>
    </div>
  </CardContent>
</Card>
```

### 7. Google Authentication (Keep Existing)

**No changes needed - reuse from aspire-vapi-ghl:**
```typescript
// frontend/src/pages/Auth.tsx
// Already has Google OAuth + MFA

const handleGoogleLogin = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/dashboard`
    }
  });
};
```

**MFA Setup:**
```typescript
// frontend/src/components/MFA/EnrollMFA.tsx
// frontend/src/components/MFA/AuthMFA.tsx
// Keep as-is from aspire-vapi-ghl
```

### 8. Super User View Enhancements

**Add to SuperAdminDashboard.tsx:**
```typescript
// 1. Total system stats
<MetricsOverview
  totalOrganizations={organizations.length}
  totalAssistants={assistants.length}
  totalInteractionsThisMonth={totalInteractions}
  totalCostThisMonth={totalCost}
  totalSavingsVsVAPI={vapiSavings}
/>

// 2. Interactions by council (for billing)
<InteractionsByCouncil data={councilInteractions} />

// 3. Cost breakdown (all councils)
<CostTracker
  costData={allCosts}
  totalCost={totalSystemCost}
  showVAPISavings={true}
/>

// 4. Assistant leaderboard (across all councils)
<AssistantLeaderboard assistants={rankedAssistants} />

// 5. Recent conversations (all councils)
<RecentConversations conversations={recentConversations} />
```

---

## 🚀 Migration Plan

### Phase 1: Setup New Repo (Day 1)

1. **Create vapi-takeover repository**
   ```bash
   mkdir vapi-takeover
   cd vapi-takeover
   git init
   ```

2. **Copy frontend from aspire-vapi-ghl**
   ```bash
   # Copy entire frontend structure
   cp -r ../aspire-vapi-ghl/src ./frontend/src
   cp -r ../aspire-vapi-ghl/supabase ./supabase
   cp ../aspire-vapi-ghl/package.json ./frontend/
   ```

3. **Create backend directory**
   ```bash
   mkdir -p backend/{audio,services,ai,webhooks,config}
   ```

4. **Update Supabase connection**
   ```javascript
   // frontend/src/supabaseClient.js
   // Point to YOUR existing Supabase (no changes needed if same project)
   const supabaseUrl = process.env.VITE_SUPABASE_URL;
   const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
   ```

### Phase 2: Database Migration (Day 2)

1. **Add new fields to existing tables**
   ```sql
   -- supabase/migrations/002_vapi_removal.sql

   -- Update assistants table
   ALTER TABLE assistants ADD COLUMN IF NOT EXISTS bot_type TEXT DEFAULT 'voice';
   ALTER TABLE assistants ADD COLUMN IF NOT EXISTS phone_number TEXT;
   ALTER TABLE assistants ADD COLUMN IF NOT EXISTS widget_config JSONB;
   ALTER TABLE assistants ADD COLUMN IF NOT EXISTS performance_rank INTEGER;
   ALTER TABLE assistants ADD COLUMN IF NOT EXISTS total_interactions INTEGER DEFAULT 0;

   -- Update conversations table
   ALTER TABLE conversations ADD COLUMN IF NOT EXISTS whisper_cost NUMERIC(12,6);
   ALTER TABLE conversations ADD COLUMN IF NOT EXISTS gpt_cost NUMERIC(12,6);
   ALTER TABLE conversations ADD COLUMN IF NOT EXISTS elevenlabs_cost NUMERIC(12,6);
   ALTER TABLE conversations ADD COLUMN IF NOT EXISTS twilio_cost NUMERIC(12,6);
   ALTER TABLE conversations ADD COLUMN IF NOT EXISTS interaction_counted BOOLEAN DEFAULT false;

   -- Create billing view
   CREATE OR REPLACE VIEW council_monthly_interactions AS ...
   ```

2. **Run migration**
   ```bash
   supabase db push
   ```

### Phase 3: Build Backend (Days 3-7)

1. **Voice platform** - Implement WebSocket + Twilio + Whisper + ElevenLabs
2. **Chat platform** - Implement direct OpenAI integration
3. **Session management** - Auto-timeout and interaction tracking
4. **Cost tracking** - Direct cost calculation
5. **Webhooks** - Log to database, trigger scoring

### Phase 4: Update Frontend (Days 8-10)

1. **Update CostTracker** - Remove VAPI, show direct costs
2. **Add InteractionsByCouncil** - New component
3. **Add AssistantRanking** - Leaderboard view
4. **Update SuperAdminDashboard** - New metrics

### Phase 5: Testing (Days 11-14)

1. **Test voice calls** - Register test assistant, make calls
2. **Test chat** - Register test assistant, chat conversations
3. **Test session timeout** - Verify interactions counted
4. **Test cost tracking** - Verify direct costs calculated correctly
5. **Test council views** - Verify org admins see their data only

### Phase 6: Production (Day 15+)

1. **Migrate one council** - Start with pilot
2. **Monitor costs** - Verify savings
3. **Migrate remaining councils** - One by one
4. **Decommission VAPI** - Cancel subscription

---

## 💰 Cost Comparison

### Current (With VAPI)
- **Voice:** ~18¢/min × 10,000 min/month = **$1,800/month**
- **Portal hosting:** Netlify free tier
- **Database:** Supabase (current usage)
- **Total:** ~$1,800/month

### After (vapi-takeover)
- **Voice direct costs:** ~4¢/min × 10,000 min/month = **$400/month**
- **Backend hosting:** Fly.io ~$25/month
- **Portal hosting:** Netlify free tier
- **Database:** Supabase (current usage)
- **Total:** ~$425/month

**Savings: $1,375/month (76%)**

---

## 📋 Next Steps

1. **Review this design** - Does it match your vision?
2. **Create vapi-takeover repo** - Initialize repository
3. **Database planning** - Which migrations to run first?
4. **Priority features** - Voice first or chat first?
5. **Timeline** - When do you want to start migration?

---

**This design gives you complete control, maintains all your portal features, and saves 76% on costs.** 🚀

Ready to start building?
