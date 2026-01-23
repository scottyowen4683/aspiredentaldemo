# Email Tool Guide

## Overview

The AI chat assistant can automatically send structured emails to council staff when appropriate. This uses **OpenAI Function Calling** to intelligently decide when a query requires email escalation vs. direct chat response.

---

## How It Works

### 1. AI Decision Making

The AI evaluates each user request and decides:

**Answer Directly (Most Common):**
- "What day are my bins collected?" → Answers from knowledge base
- "What are your opening hours?" → Answers from knowledge base
- "How do I report a pothole?" → Provides instructions

**Send Email (When Needed):**
- "I have a pothole at 123 Main St that needs fixing" → Sends email to council
- "I need someone to call me about my rates" → Sends callback request
- "I want to make a complaint about noise" → Sends complaint email

### 2. Email Flow

```
User: "I need help with a large item pickup at my address"
  ↓
AI analyzes request
  ↓
AI decides email is needed (requires official action)
  ↓
AI calls send_council_request_email function
  ↓
Function sends structured email via Brevo
  ↓
AI responds: "I've sent your request to council staff.
             They'll contact you within 2 business days..."
```

### 3. What Gets Emailed

**Structured format:**
- Request Type (Service Request, Complaint, Callback, etc.)
- Resident Name
- Phone Number
- Email (optional)
- Address (optional)
- Preferred Contact Method
- Urgency Level
- Detailed Description

---

## Pilot Safety Features

### All Emails Go to You (Not Councils)

**During pilot testing:**
- ✅ ALL emails route to `scott@aspireexecutive.com.au`
- ✅ Email shows which council it's "for" but doesn't actually send there
- ✅ Safe testing without bothering actual council staff
- ✅ You can review all escalations

**Environment variable:**
```bash
RECIPIENT_EMAIL=scott@aspireexecutive.com.au  # ALL pilot emails go here
# or
COUNCIL_INBOX_EMAIL=scott@aspireexecutive.com.au  # Higher priority
```

### Email Labeling

All emails are labeled:
- **From:** "Aspire AI Services" (not council-specific)
- **Subject:** "New Council Request – [Type]"
- **Footer:** "Sent via Aspire AI Services – Pilot Environment"

---

## Configuration

### Required Environment Variables

```bash
# Brevo API (email service)
BREVO_API_KEY=your_brevo_api_key_here

# Email addresses
SENDER_EMAIL=noreply@aspireexecutive.com.au  # "From" address
RECIPIENT_EMAIL=scott@aspireexecutive.com.au  # "To" address (pilot)

# Optional: Override recipient
COUNCIL_INBOX_EMAIL=scott@aspireexecutive.com.au  # Takes priority if set
```

### Optional Toggles

```bash
# Enable/disable email tool (default: true)
ENABLE_EMAIL_TOOL=true

# If false, AI cannot send emails (chat-only mode)
ENABLE_EMAIL_TOOL=false
```

---

## When AI Uses Email Tool

### ✅ Appropriate Use Cases

1. **Service Requests Requiring Action**
   - "I need a large item pickup"
   - "There's a broken streetlight at [address]"
   - "My footpath is damaged and needs repair"

2. **Complaints Requiring Investigation**
   - "I want to complain about noise from my neighbor"
   - "The park has broken equipment that's dangerous"
   - "I'm unhappy with how my complaint was handled"

3. **Callback/Follow-up Requests**
   - "Can someone call me about my rates?"
   - "I need to speak with someone about planning approval"
   - "I'd like a council officer to contact me"

4. **Complex Inquiries**
   - Questions the knowledge base doesn't cover
   - Issues requiring specialist council knowledge
   - Matters needing official response

### ❌ When AI Should NOT Use Email

1. **General Information** (answer from KB instead)
   - "What are your opening hours?"
   - "Where is the library?"
   - "What's the phone number for council?"

2. **Questions Answerable from Knowledge Base**
   - "What day are my bins collected?"
   - "How much is dog registration?"
   - "What are the pool hours?"

3. **Urgent/Emergency Matters**
   - AI should direct user to call immediately
   - Not escalate via email

---

## Testing the Email Tool

### Test Scenario 1: Simple Question (No Email)
```
You: "What are the library opening hours?"
AI: [Answers from knowledge base - NO EMAIL SENT]
```

### Test Scenario 2: Service Request (Email Sent)
```
You: "I need a bulky waste pickup at 123 Main St. My name is John Smith,
     phone 0412345678. I have an old couch and fridge to dispose of."

AI: [Sends email with structured data]
    "I've sent your bulky waste pickup request to council staff.
     They'll contact you within 2 business days to arrange collection..."

Check your email: scott@aspireexecutive.com.au
Subject: "New Council Request – Service Request"
```

### Test Scenario 3: Callback Request (Email Sent)
```
You: "Can someone call me about my rates? Name: Jane Doe, 0498765432"

AI: [Sends email]
    "I've forwarded your callback request to council staff.
     Someone will contact you shortly..."

Check your email for the callback request details.
```

---

## Email Template

Here's what the email looks like:

```html
Subject: New Council Request – Service Request

──────────────────────────────────────
New Council Request – Service Request
──────────────────────────────────────

Tenant: moreton

Name: John Smith
Phone: 0412345678
Email: N/A
Address: 123 Main St, Caboolture
Preferred contact: phone
Urgency: Normal

Details:
I need a bulky waste pickup for an old couch and fridge.

──────────────────────────────────────
Sent via Aspire AI Services – Pilot Environment
All emails during pilot are routed to: scott@aspireexecutive.com.au
```

---

## Production Transition (Future)

When ready to go live with actual councils:

### 1. Per-Tenant Email Routing

Update `send-council-email.js` to route by tenant:

```javascript
const COUNCIL_EMAILS = {
  moreton: "customer.service@moretonbay.qld.gov.au",
  goldcoast: "mail@goldcoast.qld.gov.au",
  brisbane: "info@brisbane.qld.gov.au",
};

const recipientEmail = COUNCIL_EMAILS[tenantId] || RECIPIENT_EMAIL;
```

### 2. Update Email Labels

```javascript
senderName: `Aspire AI – ${councilName}`,  // "Aspire AI – Moreton Bay Council"
```

### 3. Remove Pilot Footer

Remove or update the footer note about pilot routing.

### 4. Set Production Env Vars

```bash
# Keep pilot email as fallback
RECIPIENT_EMAIL=scott@aspireexecutive.com.au

# Remove this (switches to tenant-based routing)
# COUNCIL_INBOX_EMAIL=scott@aspireexecutive.com.au
```

---

## Monitoring & Analytics

### Check Email Success

Query Netlify function logs:
```
Search: "send-council-email"
Look for: "Email sent successfully"
```

### Track Email Volume

```sql
-- If you want to log emails to Supabase (optional future enhancement)
SELECT
  tenant_id,
  request_type,
  urgency,
  created_at
FROM email_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tenant_id, request_type, urgency;
```

---

## Troubleshooting

### Issue: Emails Not Sending

**Check:**
1. `BREVO_API_KEY` is set in Netlify
2. `SENDER_EMAIL` is set
3. `RECIPIENT_EMAIL` is set
4. `ENABLE_EMAIL_TOOL=true` (default)
5. Check Netlify function logs for errors

### Issue: AI Sends Too Many Emails

**Solution:**
- Review and tighten the function description
- Add more examples of when NOT to use email
- Reduce temperature (more conservative): `temperature: 0.2`

### Issue: AI Doesn't Send Emails When It Should

**Solution:**
- Check that `ENABLE_EMAIL_TOOL=true`
- Verify OpenAI model supports function calling (gpt-4o-mini does)
- Check function description is clear
- Try being more explicit in user request: "Please send this to council staff"

### Issue: Wrong Information in Emails

**Solution:**
- AI extracts info from conversation
- User should provide: name, phone, details
- If missing, AI will ask before sending email

---

## Cost Impact

### Email Tool Costs

**Per Email Escalation:**
- First OpenAI call (decides to send): ~3,500 tokens input, ~50 tokens output
- Function execution: ~0 tokens (just HTTP call)
- Second OpenAI call (final response): ~3,600 tokens input, ~100 tokens output
- **Total: ~7,250 tokens per email escalation**

**Cost:** ~$0.0015 per email escalation (very cheap!)

**Brevo (Email Delivery):**
- Free tier: 300 emails/day
- More than enough for pilot testing
- Cost scales after that (~$25/month for 20K emails)

---

## Best Practices

### 1. Train Users to Provide Details

If user says: "I need help"

AI should ask: "I'd be happy to help! To connect you with the right person, I'll need:
- Your full name
- Contact phone number
- What you need assistance with

This helps us get you a faster response."

### 2. Set Expectations

AI should tell users:
- ✅ "I've sent your request to council staff"
- ✅ "Someone will contact you within 2 business days"
- ✅ "You'll receive a follow-up call/email"
- ❌ Don't promise immediate callbacks
- ❌ Don't over-promise specific timeframes unless in KB

### 3. Confirm Before Sending

For sensitive matters, AI can confirm:
```
"I can send this to council staff for you. Just to confirm:
- Name: John Smith
- Phone: 0412345678
- Request: Bulky waste pickup for couch and fridge

Is that correct? Reply 'yes' to send or provide any corrections."
```

---

## Summary

✅ **Smart email escalation** via OpenAI function calling
✅ **Pilot-safe** – all emails to scott@aspireexecutive.com.au
✅ **Structured format** – consistent, professional emails
✅ **Low cost** – ~$0.0015 per escalation
✅ **Easy to disable** – set ENABLE_EMAIL_TOOL=false
✅ **Production-ready** – just update routing when ready

The AI intelligently decides when to answer directly vs. escalate via email, improving user experience and reducing council workload!
