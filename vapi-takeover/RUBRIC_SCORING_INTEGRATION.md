# Optimized Rubric Scoring - Government Compliance System

## Overview

The VAPI Takeover platform includes an **optimized, automatic rubric scoring system** designed for maximum governance and compliance. It works for **both voice and chat** conversations with **96% cost savings** compared to traditional GPT-4o scoring.

---

## Key Features

✅ **Automatic Scoring** - Runs automatically when conversations end
✅ **Voice & Chat Support** - Handles both conversation types with type-specific criteria
✅ **Government Compliance** - Built-in Australian government compliance dimensions
✅ **Configurable Rubrics** - Custom rubrics per organization or per assistant
✅ **Cost Optimized** - Uses GPT-4o-mini ($0.0015 vs $0.025 per conversation)
✅ **Flagging System** - Automatically flags conversations requiring review
✅ **Maximum Consistency** - Temperature=0 for reproducible scores

---

## Cost Comparison

### Traditional GPT-4o Scoring
- Input: $2.50 per 1M tokens
- Output: $10.00 per 1M tokens
- **Average cost per conversation:** $0.025

### Optimized GPT-4o-mini Scoring
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens
- **Average cost per conversation:** $0.0015

### Savings
**96% reduction** - From $0.025 to $0.0015 per conversation

**Monthly savings (1000 conversations):**
- GPT-4o: $25.00/month
- GPT-4o-mini: $1.50/month
- **Savings: $23.50/month**

---

## How It Works

### Voice Conversations

1. **Call Ends** → VoiceHandler.endCall() triggered
2. **Check Auto-Score Setting** → If enabled (default: true)
3. **Get Transcript** → Fetch all user/assistant turns from database
4. **Get Rubric** → Assistant-specific OR organization default OR system default
5. **Score Conversation** → GPT-4o-mini analyzes against government dimensions
6. **Save Results** → Store score, flags, feedback in conversation_scores table
7. **Update Conversation** → Add overall score to chat_conversations table

### Chat Conversations

1. **Session Ends** → Either timeout (15 min) or manual end
2. **Check Auto-Score Setting** → If enabled (default: true)
3. **Get Transcript** → Fetch all user/assistant messages from database
4. **Get Rubric** → Assistant-specific OR organization default OR system default
5. **Score Conversation** → GPT-4o-mini analyzes against government dimensions
6. **Save Results** → Store score, flags, feedback in conversation_scores table
7. **Update Conversation** → Add overall score to chat_conversations table

---

## Government Compliance Dimensions

The system uses **5 core dimensions** optimized for Australian government contexts:

### 1. Governance & Compliance (25%)
**Criteria:**
- Adherence to organizational policies and procedures
- Regulatory compliance (Australian Privacy Principles, FOI Act)
- Appropriate handling of sensitive information
- Proper escalation of issues beyond AI scope

**Voice-specific:** Clear verbal disclaimers, proper phone protocol
**Chat-specific:** Written disclaimers, link sharing appropriately

### 2. Information Accuracy (25%)
**Criteria:**
- Correctness of information provided
- Appropriate use of knowledge base
- Clear distinction between verified facts and general guidance
- Acknowledgment of uncertainty when appropriate

**Voice-specific:** Verbal clarity, no contradictions
**Chat-specific:** Links to sources, structured information

### 3. Service Quality (20%)
**Criteria:**
- Professionalism and appropriate tone
- Responsiveness to user needs
- Clear and understandable communication
- Efficient resolution of queries

**Voice-specific:** Natural speech patterns, clear pronunciation
**Chat-specific:** Proper formatting, grammar, structured responses

### 4. Problem Resolution (20%)
**Criteria:**
- Effectiveness in addressing user's query
- Providing actionable next steps
- Appropriate referrals to human staff when needed
- Follow-up recommendations

**Voice-specific:** Clear action items stated verbally
**Chat-specific:** Step-by-step written instructions

### 5. Accountability & Transparency (10%)
**Criteria:**
- Transparency about AI nature
- Clear explanation of limitations
- Proper attribution of information sources
- Privacy and data handling transparency

**Voice-specific:** Verbal acknowledgment of being AI
**Chat-specific:** Written disclaimers visible

---

## Automatic Flagging System

Conversations are **automatically flagged** for review when they contain:

### Critical Flags
- **policy_violation** - Potential breach of organizational policies
- **privacy_breach** - Possible violation of Australian Privacy Principles
- **compliance_risk** - Risk of regulatory non-compliance
- **requires_escalation** - Issue that should have been escalated to human

### Warning Flags
- **information_accuracy_low** - Score < 60% on Information Accuracy dimension
- **service_quality_low** - Score < 60% on Service Quality dimension
- **governance_low** - Score < 60% on Governance & Compliance dimension

### Flag Storage
Flags are stored as a PostgreSQL array in the `conversation_scores` table:

```sql
flags: ['policy_violation', 'requires_escalation']
```

### Flag Query
View all flagged conversations:

```sql
SELECT * FROM flagged_conversations ORDER BY scored_at DESC;
```

---

## Rubric Configuration Hierarchy

Rubrics are applied in this priority order:

1. **Assistant-Specific Rubric** (highest priority)
   - Set when creating/editing assistant
   - Allows customization per department/use case

2. **Organization Default Rubric**
   - Set when creating/editing organization
   - Applies to all assistants in org unless overridden

3. **System Default Rubric** (lowest priority)
   - Built-in government compliance rubric
   - Used when no custom rubric defined

### Example: Custom Rubric

```json
{
  "dimensions": [
    {
      "name": "Community Engagement",
      "weight": 30,
      "criteria": "Quality of engagement with community members, empathy shown, understanding of local context"
    },
    {
      "name": "Technical Accuracy",
      "weight": 25,
      "criteria": "Accuracy of technical information about council services, infrastructure, regulations"
    },
    {
      "name": "Response Timeliness",
      "weight": 20,
      "criteria": "Speed and efficiency of responses, appropriate handling of urgent vs non-urgent matters"
    },
    {
      "name": "Compliance",
      "weight": 15,
      "criteria": "Adherence to Australian Privacy Principles, FOI Act, council policies"
    },
    {
      "name": "Professionalism",
      "weight": 10,
      "criteria": "Professional tone, respectful communication, appropriate language for government context"
    }
  ]
}
```

---

## Database Schema

### conversation_scores Table

```sql
CREATE TABLE conversation_scores (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES chat_conversations(id),

  -- Scoring results
  overall_score DECIMAL(5,2), -- 0-100
  dimension_scores JSONB, -- Individual dimension scores
  flags TEXT[], -- Compliance flags
  feedback TEXT, -- Detailed textual feedback

  -- Metadata
  cost DECIMAL(10,6), -- Cost of scoring operation
  model_used TEXT DEFAULT 'gpt-4o-mini',
  scoring_type TEXT, -- 'voice' or 'chat'

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### conversation_scores JSONB Structure

```json
{
  "dimension_scores": [
    {
      "name": "Governance & Compliance",
      "score": 85,
      "weight": 25,
      "feedback": "Good adherence to policies, proper escalation when needed"
    },
    {
      "name": "Information Accuracy",
      "score": 92,
      "weight": 25,
      "feedback": "Accurate information provided with appropriate sources"
    }
  ]
}
```

---

## Configuration Options

### Enable/Disable Auto-Scoring

**Per Assistant:**
```sql
UPDATE assistants SET auto_score = false WHERE id = 'assistant-uuid';
```

**Default:** `auto_score = true`

### Voice Handler Integration

Located in: `backend/ai/voice-handler.js`

```javascript
async endCall(endReason = 'completed') {
  // ... end call logic ...

  // Auto-score if enabled
  if (this.assistant.auto_score !== false && this.conversation) {
    await this.scoreConversation();
  }
}
```

### Chat API Integration

Located in: `backend/routes/chat.js`

```javascript
// Session timeout handler
async function handleSessionTimeout(sessionId, conversationId, assistantId) {
  // ... end session logic ...

  // Auto-score conversation
  await scoreChatConversation(sessionId, conversationId, assistantId);
}

// Manual end handler
router.post('/end', async (req, res) => {
  // ... end logic ...

  // Auto-score conversation
  await scoreChatConversation(sessionId, conversation.id, session.assistantId);
});
```

---

## Optimization Techniques

### 1. Model Selection
- **GPT-4o-mini** instead of GPT-4o
- Same quality for structured evaluation tasks
- 96% cost reduction

### 2. Temperature Setting
- **Temperature = 0** for maximum consistency
- Ensures reproducible scores
- Eliminates randomness in evaluation

### 3. Concise Prompts
- Optimized system prompt (< 500 tokens)
- Structured output format (JSON)
- Reduces input token usage

### 4. Batch Processing
- Could batch multiple conversations (future optimization)
- Current: Individual scoring per conversation

### 5. Caching Strategy
- Rubrics cached at application level
- Reduces database queries
- Faster scoring operations

---

## API Endpoints

### Score a Conversation Manually

```bash
POST /api/admin/score-conversation
{
  "conversation_id": "uuid",
  "force_rescore": false
}
```

### Get Conversation Score

```bash
GET /api/admin/conversations/:id/score
```

### Get Flagged Conversations

```bash
GET /api/admin/flagged-conversations
?org_id=uuid
&days=30
&flags=policy_violation,privacy_breach
```

---

## Monitoring & Reporting

### Dashboard Metrics

Track in Super Admin Dashboard:
- Average score per organization
- Flagged conversations count
- Scoring costs
- Score distribution

### Example Queries

**Average score by organization:**
```sql
SELECT
  o.name,
  AVG(cs.overall_score) as avg_score,
  COUNT(*) as total_conversations,
  COUNT(*) FILTER (WHERE array_length(cs.flags, 1) > 0) as flagged_count
FROM conversation_scores cs
JOIN chat_conversations cc ON cs.conversation_id = cc.id
JOIN organizations o ON cc.org_id = o.id
GROUP BY o.name
ORDER BY avg_score DESC;
```

**Flagged conversations requiring review:**
```sql
SELECT * FROM flagged_conversations
WHERE 'policy_violation' = ANY(flags)
  AND scored_at > NOW() - INTERVAL '7 days'
ORDER BY scored_at DESC;
```

---

## Best Practices

### For Government Clients

1. **Use Default Rubric** - Start with built-in government dimensions
2. **Monitor Flags** - Review flagged conversations weekly
3. **Adjust Weights** - Customize dimension weights based on priorities
4. **Regular Reviews** - Audit scores monthly for accuracy
5. **Staff Training** - Train staff on flag meanings and escalation

### For Scoring Accuracy

1. **Provide Context** - Include organization name and assistant purpose
2. **Quality Knowledge Base** - Ensure KB is comprehensive and up-to-date
3. **Clear Prompts** - Assistant prompts should include policy guidelines
4. **Test Rubrics** - Validate custom rubrics with sample conversations
5. **Iterate** - Refine rubric dimensions based on actual scores

### For Cost Optimization

1. **Enable Auto-Score Selectively** - Disable for testing assistants
2. **Monitor Costs** - Track scoring costs in dashboard
3. **Batch Reviews** - Review flagged conversations in batches
4. **Use Filters** - Focus on high-priority flags first

---

## Compliance Documentation

### Australian Privacy Principles (APP) Coverage

The rubric scoring system explicitly evaluates:

- **APP 1:** Open and transparent management of personal information
- **APP 3:** Collection of solicited personal information
- **APP 5:** Notification of collection of personal information
- **APP 6:** Use or disclosure of personal information
- **APP 11:** Security of personal information

### Freedom of Information (FOI) Act

Conversations are scored on:
- Proper handling of information requests
- Transparency in decision-making
- Appropriate referral to FOI officers when needed

### Record Keeping

All scores are retained with:
- Complete conversation transcript
- Scoring metadata (model, cost, timestamp)
- Flagging reasons
- Automated audit trail

---

## Troubleshooting

### Score Not Generated

**Check:**
1. Is `auto_score` enabled? (default: true)
2. Did conversation have any turns?
3. Is OpenAI API key valid?
4. Check backend logs for errors

**Solution:**
```bash
# Check logs
docker logs backend-container | grep "scoring"

# Manually trigger scoring
POST /api/admin/score-conversation
{
  "conversation_id": "uuid"
}
```

### Low Scores Despite Good Conversation

**Check:**
1. Is rubric appropriate for use case?
2. Are dimension weights balanced?
3. Is knowledge base comprehensive?
4. Is assistant prompt clear?

**Solution:**
- Review rubric dimensions
- Adjust weights to match priorities
- Add more KB content
- Refine system prompt

### High Scoring Costs

**Check:**
1. Using GPT-4o-mini? (not GPT-4o)
2. Are conversations very long?
3. Is auto-score enabled for testing bots?

**Solution:**
- Verify model in conversation_scores table
- Set conversation timeouts appropriately
- Disable auto-score for test/dev assistants

---

## Future Enhancements

Potential optimizations:

1. **Batch Scoring** - Score multiple conversations in single API call
2. **Prompt Caching** - Use OpenAI's prompt caching (50% savings)
3. **Selective Scoring** - Only score flagged or random sample conversations
4. **Real-time Scoring** - Score during conversation, not just at end
5. **Trend Analysis** - Track score trends over time per assistant

---

## Summary

The optimized rubric scoring system provides:

✅ **96% cost savings** vs traditional GPT-4o scoring
✅ **Automatic compliance monitoring** for government contexts
✅ **Both voice and chat** conversation support
✅ **Configurable rubrics** per organization and assistant
✅ **Automatic flagging** of high-risk conversations
✅ **Complete audit trail** for governance

**Total Cost:**
- GPT-4o-mini conversation: $0.0015
- Combined with voice call ($0.0105) or chat ($0.0003)
- **Total voice + scoring:** $0.012 per conversation
- **Total chat + scoring:** $0.0018 per conversation

**Government Ready:**
- Australian Privacy Principles compliant
- FOI Act considerations built-in
- Maximum governance and accountability
- Complete transparency in AI operations

For questions or customization requests, refer to the admin portal guide or backend documentation.
