# Complete Guide: Adding a New Client Council

This guide walks you through onboarding a new council client from start to finish, including creating a demo page with their branding.

**Time required:** ~30 minutes per client
**Technical skill:** Basic (copy/paste, edit text files)

---

## 📋 Prerequisites

Before starting, gather from the client:
- ✅ Council name (e.g., "Gold Coast City Council")
- ✅ Council logo file (PNG, transparent background preferred)
- ✅ Knowledge base content (FAQ documents, web pages, etc.)
- ✅ Primary contact information (phone, email, website)
- ✅ Any specific greeting message they want

---

## 🚀 Step-by-Step Process

### Step 1: Generate Unique Assistant ID

**Option A: Use a UUID generator**
- Visit: https://www.uuidgenerator.net/
- Click "Generate"
- Copy the UUID (e.g., `7f3e9c2a-1b4d-4c8f-9a2e-5d6f8e1a3b4c`)

**Option B: Create a simple ID**
```
goldcoast-pilot-2026
brisbane-assistant-v1
logan-chatbot
```

**Save this ID** - you'll use it multiple times.

---

### Step 2: Add Council Logo

1. **Get logo file** from council (ideally PNG with transparent background)
2. **Name it:** `{councilname}logo.png` (e.g., `goldcoastlogo.png`)
3. **Add to:** `/frontend/public/`
4. **Recommended size:** 200px wide, maintain aspect ratio

```bash
# Example
cp goldcoastlogo.png /frontend/public/goldcoastlogo.png
```

---

### Step 3: Create Knowledge Base File

1. **Create file:** `/frontend/netlify/functions/kb/goldcoast_kb.txt`
2. **Format** using heading blocks:

```txt
============================================================
GOLD COAST CITY COUNCIL – KNOWLEDGE BASE
Customer service information for residents
Effective: January 2026
============================================================

------------------------------------------------------------
GENERAL CONTACT & EMERGENCY INFORMATION
------------------------------------------------------------

Gold Coast City Council
Phone: 07 5581 6000
Email: council@goldcoast.qld.gov.au
Website: www.goldcoast.qld.gov.au

Opening Hours:
Monday to Friday: 8:30am - 5:00pm
Closed weekends and public holidays

For emergencies outside business hours, call 07 5581 6000

------------------------------------------------------------
WASTE & RECYCLING COLLECTION
------------------------------------------------------------

General waste bins: Collected weekly
Recycling bins: Collected fortnightly
...

------------------------------------------------------------
FEES & CHARGES
------------------------------------------------------------

Dog registration:
- Desexed: $52.00 per year
- Non-desexed: $200.00 per year
...
```

**Key formatting rules:**
- Section dividers: 60 dashes minimum
- Section headings: ALL CAPS
- Keep each section focused on one topic

See `KB_FILE_FORMAT.md` for complete guide.

---

### Step 4: Configure AI Assistant

Edit `/frontend/netlify/functions/ai-chat.js`:

**Add to ASSISTANT_CONFIGS (around line 99):**

```javascript
const ASSISTANT_CONFIGS = {
  moreton: {
    // ... existing moreton config
  },
  goldcoast: {  // ADD THIS
    name: "Gold Coast Council Assistant",
    tenantId: "goldcoast",
    councilName: "Gold Coast City Council",
    model: "gpt-4o-mini",
    temperature: 0.5,
    maxTokens: 800,
    kbEnabled: true,
    kbMatchCount: 5,
  },
  default: {
    // ... existing default
  },
};
```

**Add to ASSISTANT_MAP (around line 80):**

```javascript
const ASSISTANT_MAP = {
  "a2c1de9b-b358-486b-b9e6-a8b4f9e4385d": "moreton",
  "7f3e9c2a-1b4d-4c8f-9a2e-5d6f8e1a3b4c": "goldcoast",  // ADD THIS
};
```

---

### Step 5: Add Environment Variable

In **Netlify Dashboard:**

1. Go to: Site Settings → Environment Variables
2. Click "Add a variable"
3. **Key:** `VITE_VAPI_ASSISTANT_GOLDCOAST`
4. **Value:** `7f3e9c2a-1b4d-4c8f-9a2e-5d6f8e1a3b4c` (your assistant ID)
5. Click "Create variable"

**Important:** Use ALL CAPS for the council name in the env var name.

---

### Step 6: Create Demo Page

Create file: `/frontend/src/pages/pilots/goldcoast.jsx`

```jsx
import React from "react";
import VapiWidget from "./vapi-widget.jsx";

const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_GOLDCOAST;
const tenantId = "goldcoast";

export default function GoldCoastPilot() {
  const isConfigured = Boolean(assistantId);

  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-60">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-white/10 blur-[120px]" />
        <div className="absolute bottom-[-240px] right-[-140px] h-[520px] w-[520px] rounded-full bg-white/10 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-4">
                <img
                  src="/aspire1.png"
                  alt="Aspire Executive Solutions"
                  className="h-10 w-auto opacity-95"
                />
                <div className="h-8 w-px bg-white/15" />
                <img
                  src="/goldcoastlogo.png"
                  alt="Gold Coast"
                  className="h-10 w-auto opacity-95"
                />
              </div>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/70">
              <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
              Pilot environment • Chat evaluation only
            </div>
          </div>

          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Aspire AI Chat Pilot — Gold Coast
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/70 md:text-base">
              This page is a controlled evaluation environment to trial an AI
              assistant for common, low-risk enquiries. It is vendor-hosted and
              not connected to Council systems.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Scope</div>
              <div className="mt-1 text-sm text-white/65">
                Informational enquiries only (e.g. bins, complaints, opening
                hours, general guidance).
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Governance</div>
              <div className="mt-1 text-sm text-white/65">
                Designed to escalate or stop when a request is outside scope.
                Council remains in control.
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Urgent matters</div>
              <div className="mt-1 text-sm text-white/65">
                Not for emergencies. For urgent issues, use official Council
                channels.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="text-sm font-semibold">Pilot support & escalation</div>
            <div className="mt-1 text-sm text-white/70">
              For any queries or escalations, please contact{" "}
              <span className="font-semibold text-white">Scott</span> on{" "}
              <a
                href="tel:0408 062 129"
                className="font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white/60"
              >
                0408 062 129
              </a>
              .
            </div>
          </div>

          <div className="text-xs leading-relaxed text-white/55">
            By using this pilot, you acknowledge responses may be incomplete or
            subject to change. Please avoid entering sensitive personal
            information unless explicitly required for a specific task.
          </div>
        </header>

        <main className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white/90">How to test</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              Ask a few typical questions. Focus on clarity, accuracy, escalation
              behaviour and tone.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {[
                "What day is my bin collected?",
                "Who is my local councillor?",
                "Where can I find Council opening hours?",
                "What is the cost for dog registration?",
                "How do I report an issue?",
                "What are the contact options for support?",
              ].map((q) => (
                <div
                  key={q}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/70"
                >
                  {q}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Notes for reviewers</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/65">
                <li>Does the assistant stay within low-risk scope?</li>
                <li>Does it route/escalate when uncertain?</li>
                <li>Is the tone appropriate and calm?</li>
                <li>Are responses consistent and clearly worded?</li>
              </ul>
            </div>
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-7 shadow-[0_18px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-white/90">Pilot constraints</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/65">
              <li>• No payments or account-specific actions</li>
              <li>• No decisions or formal determinations</li>
              <li>• No access to internal Council systems in this pilot</li>
              <li>• Escalation/deflection is intentional</li>
            </ul>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-sm font-semibold">Assistant status</div>
              <div className="mt-2 text-xs text-white/60">
                Status:{" "}
                <span className={isConfigured ? "text-emerald-300" : "text-amber-300"}>
                  {isConfigured ? "Configured" : "Not configured"}
                </span>
              </div>

              {!isConfigured && (
                <div className="mt-2 text-xs text-white/55 leading-relaxed">
                  The assistant is not available because the environment variable
                  is not set in this deployment.
                </div>
              )}
            </div>
          </aside>
        </main>

        <VapiWidget
          assistantId={assistantId}
          tenantId={tenantId}
          title="Gold Coast • Aspire AI Chat Pilot"
          greeting="Hi — I'm the Gold Coast City Council AI assistant. How can I help you today? For urgent matters, please use Council's official channels."
          brandUrl="https://aspireexecutive.ai"
        />
      </div>
    </div>
  );
}
```

**Customize these fields:**
- Logo path: `/goldcoastlogo.png`
- Page title: "Gold Coast"
- Greeting message
- Test questions (to match their common queries)

---

### Step 7: Add Route (if using React Router)

If your app uses routing, add to your router configuration:

```javascript
import GoldCoastPilot from "./pages/pilots/goldcoast";

// In your routes:
<Route path="/pilots/goldcoast" element={<GoldCoastPilot />} />
```

---

### Step 8: Commit and Deploy

```bash
# Add all changes
git add .

# Commit with descriptive message
git commit -m "Add Gold Coast Council pilot page

- Add goldcoastlogo.png
- Create goldcoast_kb.txt knowledge base
- Configure Gold Coast assistant
- Create demo page at /pilots/goldcoast

Ready for pilot testing"

# Push to trigger deployment
git push
```

**GitHub Actions will automatically:**
1. Parse the KB file (`goldcoast_kb.txt`)
2. Create embeddings
3. Upload to Supabase with tenant_id "goldcoast"
4. Deploy the new page

**Wait ~5-10 minutes** for:
- KB ingestion workflow to complete
- Netlify deployment to finish

---

### Step 9: Test the Demo Page

1. **Visit:** `https://yoursite.netlify.app/pilots/goldcoast`
2. **Check:**
   - ✅ Logo displays correctly
   - ✅ Assistant status shows "Configured"
   - ✅ Chat widget appears
3. **Test chat:**
   - Ask: "What are your opening hours?"
   - Ask: "Can I report a missed bin collection?"
   - Provide contact details and test email functionality

---

### Step 10: Share with Client

**Send them:**
1. **Demo page URL:** `https://yoursite.netlify.app/pilots/goldcoast`
2. **Test instructions:** Try the sample questions, test escalation
3. **Feedback form:** What they like, what needs adjustment
4. **Timeline:** When pilot will run, next steps

**Set expectations:**
- This is pilot environment (not live on their site yet)
- All escalation emails go to you (scott@aspireexecutive.com.au)
- They can test freely without bothering their staff
- Changes can be made quickly based on feedback

---

## 🎯 Quick Reference Checklist

```
□ Generate unique assistant ID
□ Add council logo to /frontend/public/
□ Create KB file: /frontend/netlify/functions/kb/{council}_kb.txt
□ Edit ai-chat.js: Add to ASSISTANT_CONFIGS
□ Edit ai-chat.js: Add to ASSISTANT_MAP
□ Add Netlify env var: VITE_VAPI_ASSISTANT_{COUNCIL}
□ Create demo page: /frontend/src/pages/pilots/{council}.jsx
□ Commit and push all changes
□ Wait for KB ingestion (~5-10 min)
□ Test the demo page
□ Share with client
```

---

## 📊 Typical Timeline

| Stage | Time | Notes |
|-------|------|-------|
| Gather requirements | 1-2 days | Get logo, KB content from client |
| Setup (Steps 1-7) | 30 minutes | Technical configuration |
| KB ingestion | 5-10 minutes | Automatic via GitHub Actions |
| Deployment | 2-3 minutes | Automatic via Netlify |
| Testing | 15 minutes | QA before sharing |
| **Total** | **~1 hour** | Once you have all materials |

---

## 💡 Tips for Success

### Logo Quality
- **PNG with transparency** is best
- Width: 150-250px works well
- Keep aspect ratio intact
- Test on dark background (your demo pages are dark)

### Knowledge Base Content
- Start with 20-30 common questions
- Include exact contact information
- Test answers yourself first
- Add more content based on usage

### Custom Greetings
Make greetings specific:
- ✅ "Hi — I'm the Gold Coast City Council AI assistant..."
- ❌ "Hello, how can I help?"

### Test Questions
Use questions clients actually ask:
- Check their website FAQ
- Ask their customer service team
- Look at support ticket trends

---

## 🔧 Troubleshooting

### "Assistant status: Not configured"
- Check env var name matches: `VITE_VAPI_ASSISTANT_GOLDCOAST`
- Redeploy site after adding env var
- Clear browser cache

### Logo not displaying
- Check file name matches in JSX: `/goldcoastlogo.png`
- Verify file is in `/frontend/public/`
- Try hard refresh (Ctrl+F5)

### Chat gives generic responses
- Wait for KB ingestion to complete (check GitHub Actions)
- Verify tenant_id in ai-chat.js matches KB filename
- Check Supabase for rows: `SELECT * FROM knowledge_chunks WHERE tenant_id = 'goldcoast'`

### Email not sending
- Verify all 3 Brevo env vars are set (BREVO_API_KEY, SENDER_EMAIL, RECIPIENT_EMAIL)
- Check Netlify function logs for errors
- Authorize new IPs in Brevo if needed

---

## Next Steps After Pilot

Once pilot is successful:

1. **Get final KB content** from council
2. **Adjust prompts** based on feedback
3. **Create widget embed code** (see WIDGET_EMBED_GUIDE.md)
4. **Provide to council** for their website
5. **Configure production email routing** (to actual council addresses)
6. **Monitor usage** and refine

---

**Need help?** Contact Scott: 0408 062 129

This process gets faster with practice - you'll be able to onboard new councils in 15-20 minutes once you're familiar with it!
