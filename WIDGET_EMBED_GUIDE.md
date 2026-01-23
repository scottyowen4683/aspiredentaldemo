# Widget Embed Guide: Going Live on Council Websites

After a successful pilot, councils will want to embed the chat widget on their actual website. This guide shows you how to provide them with the embed code.

---

## 🎯 Two Deployment Options

### Option 1: Simple Script Embed (Recommended)
- Easy for councils to add (just paste HTML)
- No build process required
- Works on any website platform

### Option 2: React Component (Advanced)
- For councils with React websites
- More control over styling/behavior
- Requires technical team

---

## 📦 Option 1: Simple Script Embed

This is what you'll give most councils. It works on WordPress, Drupal, static HTML, or any website.

### Step 1: Create Standalone Widget Bundle

Create file: `/frontend/public/widget-embed.js`

```javascript
// widget-embed.js - Standalone chat widget
// Usage: <script src="https://yoursite.com/widget-embed.js"></script>

(function() {
  'use strict';

  // Configuration (council-specific)
  const CONFIG = {
    apiEndpoint: 'https://moretonbaypilot.netlify.app/.netlify/functions/ai-chat',
    assistantId: window.ASPIRE_ASSISTANT_ID || 'a2c1de9b-b358-486b-b9e6-a8b4f9e4385d',
    tenantId: window.ASPIRE_TENANT_ID || 'moreton',
    title: window.ASPIRE_WIDGET_TITLE || 'Council AI Assistant',
    greeting: window.ASPIRE_WIDGET_GREETING || 'Hi! How can I help you today?',
    primaryColor: window.ASPIRE_PRIMARY_COLOR || '#2563eb',
  };

  // Widget HTML
  const widgetHTML = `
    <div id="aspire-chat-widget" style="position: fixed; bottom: 20px; right: 20px; z-index: 9999;">
      <button id="aspire-chat-toggle" style="
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: ${CONFIG.primaryColor};
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s;
      ">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <div id="aspire-chat-container" style="
        position: absolute;
        bottom: 80px;
        right: 0;
        width: 380px;
        height: 600px;
        max-height: calc(100vh - 120px);
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        display: none;
        flex-direction: column;
        overflow: hidden;
      ">
        <!-- Widget content injected here -->
      </div>
    </div>
  `;

  // Widget CSS
  const widgetCSS = `
    #aspire-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      background: #f9fafb;
    }
    #aspire-chat-input-container {
      padding: 16px;
      background: white;
      border-top: 1px solid #e5e7eb;
    }
    #aspire-chat-input {
      width: 100%;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      resize: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .aspire-message {
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
    }
    .aspire-message.user {
      align-items: flex-end;
    }
    .aspire-message-content {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.5;
    }
    .aspire-message.user .aspire-message-content {
      background: ${CONFIG.primaryColor};
      color: white;
    }
    .aspire-message.assistant .aspire-message-content {
      background: white;
      color: #111827;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
  `;

  // Initialize widget
  function initWidget() {
    // Inject HTML
    document.body.insertAdjacentHTML('beforeend', widgetHTML);

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = widgetCSS;
    document.head.appendChild(style);

    // Get elements
    const toggle = document.getElementById('aspire-chat-toggle');
    const container = document.getElementById('aspire-chat-container');

    // Build chat interface
    container.innerHTML = `
      <div style="padding: 20px; background: ${CONFIG.primaryColor}; color: white;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 18px;">${CONFIG.title}</h3>
          <button id="aspire-chat-close" style="
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 24px;
            padding: 0;
            width: 32px;
            height: 32px;
          ">&times;</button>
        </div>
      </div>
      <div id="aspire-chat-messages"></div>
      <div id="aspire-chat-input-container">
        <textarea id="aspire-chat-input" placeholder="Type your message..." rows="2"></textarea>
        <button id="aspire-chat-send" style="
          margin-top: 8px;
          width: 100%;
          padding: 10px;
          background: ${CONFIG.primaryColor};
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        ">Send</button>
      </div>
    `;

    // Event listeners
    toggle.addEventListener('click', () => {
      const isVisible = container.style.display === 'flex';
      container.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible) {
        // Show greeting on first open
        showGreeting();
      }
    });

    document.getElementById('aspire-chat-close').addEventListener('click', () => {
      container.style.display = 'none';
    });

    document.getElementById('aspire-chat-send').addEventListener('click', sendMessage);
    document.getElementById('aspire-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  function showGreeting() {
    const messages = document.getElementById('aspire-chat-messages');
    if (messages.children.length === 0) {
      addMessage('assistant', CONFIG.greeting);
    }
  }

  function addMessage(role, text) {
    const messages = document.getElementById('aspire-chat-messages');
    const div = document.createElement('div');
    div.className = `aspire-message ${role}`;
    div.innerHTML = `<div class="aspire-message-content">${escapeHtml(text)}</div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendMessage() {
    const input = document.getElementById('aspire-chat-input');
    const text = input.value.trim();
    if (!text) return;

    // Show user message
    addMessage('user', text);
    input.value = '';

    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'aspire-message assistant';
    typingDiv.id = 'aspire-typing';
    typingDiv.innerHTML = '<div class="aspire-message-content">...</div>';
    document.getElementById('aspire-chat-messages').appendChild(typingDiv);

    try {
      const response = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId: CONFIG.assistantId,
          tenantId: CONFIG.tenantId,
          input: text,
          sessionId: getSessionId(),
        }),
      });

      const data = await response.json();
      const reply = data.output?.[0]?.text || data.output?.[0]?.content || 'Sorry, I encountered an error.';

      // Save session ID
      if (data.sessionId) {
        localStorage.setItem('aspire_session_' + CONFIG.tenantId, data.sessionId);
      }

      // Remove typing indicator
      document.getElementById('aspire-typing')?.remove();

      // Show response
      addMessage('assistant', reply);
    } catch (error) {
      document.getElementById('aspire-typing')?.remove();
      addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
    }
  }

  function getSessionId() {
    return localStorage.getItem('aspire_session_' + CONFIG.tenantId) || null;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
```

### Step 2: Provide Council with Embed Code

Create a document for each council with their specific code:

```html
<!--
  Gold Coast City Council - AI Chat Widget
  Installation: Add this code before the closing </body> tag
-->

<script>
  // Configuration (specific to Gold Coast)
  window.ASPIRE_ASSISTANT_ID = '7f3e9c2a-1b4d-4c8f-9a2e-5d6f8e1a3b4c';
  window.ASPIRE_TENANT_ID = 'goldcoast';
  window.ASPIRE_WIDGET_TITLE = 'Gold Coast AI Assistant';
  window.ASPIRE_WIDGET_GREETING = 'Hi! I\'m the Gold Coast City Council AI assistant. How can I help you today?';
  window.ASPIRE_PRIMARY_COLOR = '#0072ce'; // Gold Coast brand blue
</script>

<script src="https://moretonbaypilot.netlify.app/widget-embed.js"></script>

<!-- End of AI Chat Widget -->
```

**Send to council with instructions:**

1. **Where to add:** Before the `</body>` tag on pages where they want the chat
2. **Testing:** Add to a test page first
3. **Customization:** Can adjust `ASPIRE_PRIMARY_COLOR` to match their brand
4. **Support:** Contact you if any issues

---

## 📦 Option 2: React Component Export

For councils with React websites:

### Create Exportable Component

File: `/frontend/src/components/AspireChatWidget.jsx`

```jsx
import React, { useState, useEffect, useRef } from 'react';

export default function AspireChatWidget({
  assistantId,
  tenantId,
  title = 'AI Assistant',
  greeting = 'How can I help you today?',
  primaryColor = '#2563eb',
  apiEndpoint = 'https://moretonbaypilot.netlify.app/.netlify/functions/ai-chat',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{ role: 'assistant', text: greeting }]);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistantId,
          tenantId,
          input: userMessage,
          sessionId,
        }),
      });

      const data = await response.json();
      const reply = data.output?.[0]?.text || data.output?.[0]?.content || 'Sorry, I encountered an error.';

      if (data.sessionId) setSessionId(data.sessionId);

      setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: primaryColor,
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      {/* Chat container */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          right: '0',
          width: '380px',
          height: '600px',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '20px', background: primaryColor, color: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>{title}</h3>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '24px' }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#f9fafb' }}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '80%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: msg.role === 'user' ? primaryColor : 'white',
                  color: msg.role === 'user' ? 'white' : '#111827',
                  boxShadow: msg.role === 'assistant' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div style={{ color: '#6b7280' }}>...</div>}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '16px', background: 'white', borderTop: '1px solid #e5e7eb' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type your message..."
              rows={2}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                resize: 'none',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading}
              style={{
                marginTop: '8px',
                width: '100%',
                padding: '10px',
                background: primaryColor,
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Usage instructions for council:**

```jsx
import AspireChatWidget from './components/AspireChatWidget';

// In your app/page:
<AspireChatWidget
  assistantId="7f3e9c2a-1b4d-4c8f-9a2e-5d6f8e1a3b4c"
  tenantId="goldcoast"
  title="Gold Coast AI Assistant"
  greeting="Hi! I'm the Gold Coast City Council AI assistant. How can I help you today?"
  primaryColor="#0072ce"
/>
```

---

## 🎨 Customization Options

Both embed options support:

| Property | Description | Example |
|----------|-------------|---------|
| `assistantId` | Unique assistant identifier | `"7f3e9c2a-1b4d..."` |
| `tenantId` | Council identifier | `"goldcoast"` |
| `title` | Widget header title | `"Gold Coast AI Assistant"` |
| `greeting` | First message shown | `"Hi! How can I help..."` |
| `primaryColor` | Brand color (hex) | `"#0072ce"` |
| `apiEndpoint` | Backend URL | (usually keep default) |

---

## 📊 Production Checklist

Before giving embed code to council:

### Backend Configuration
- [ ] KB fully populated and tested
- [ ] Email routing configured to **actual council address** (not pilot email)
- [ ] Prompt refined based on pilot feedback
- [ ] Reference number prefix correct for council

### Email Production Setup

Edit `/frontend/netlify/functions/send-council-email.js`:

```javascript
// PRODUCTION: Route by tenant
const COUNCIL_EMAILS = {
  goldcoast: "customer.service@goldcoast.qld.gov.au",
  brisbane: "info@brisbane.qld.gov.au",
  moreton: "council@moretonbay.qld.gov.au",
};

const recipientEmail = COUNCIL_EMAILS[tenantId] || process.env.RECIPIENT_EMAIL;
```

### Widget Configuration
- [ ] Greeting message approved by council
- [ ] Primary color matches council branding
- [ ] Title appropriate for council
- [ ] Tested on council's test environment

### Documentation for Council
- [ ] Installation instructions (where to paste code)
- [ ] Support contact (your phone/email)
- [ ] Expected behavior documented
- [ ] Escalation process explained

---

## 🔐 Security Considerations

### CORS Configuration
Your API already allows cross-origin requests (`Access-Control-Allow-Origin: *`). For production, consider:

```javascript
// In ai-chat.js, restrict to specific domains:
const ALLOWED_ORIGINS = [
  'https://goldcoast.qld.gov.au',
  'https://www.goldcoast.qld.gov.au',
  'https://moretonbaypilot.netlify.app', // Your demo site
];

function corsHeaders(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }
  return {};
}
```

### Rate Limiting
Consider adding per-tenant rate limits:

```javascript
// Prevent abuse from any single council's widget
const RATE_LIMIT = 100; // messages per minute per tenant
```

---

## 📈 Monitoring & Analytics

Add these for production:

### Usage Tracking
Log widget usage to Supabase:

```sql
CREATE TABLE widget_analytics (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  messages_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Error Logging
Track errors for debugging:

```javascript
// In widget-embed.js
window.addEventListener('error', (e) => {
  if (e.message.includes('aspire')) {
    // Log to your error tracking service
    console.error('Widget error:', e);
  }
});
```

---

## 🎯 Success Metrics

Track these for each council:

- **Usage:** Messages per day
- **Satisfaction:** Successful resolutions vs escalations
- **Performance:** Average response time
- **Accuracy:** Feedback on response quality
- **Escalations:** Email requests sent (should be <30% of conversations)

---

## 💼 Pricing Considerations

When councils go live, consider:

**Per-message cost:** ~$0.0007 - $0.002 (depending on conversation length)

**Monthly estimates:**
- 1,000 conversations: $1-2
- 10,000 conversations: $10-20
- 100,000 conversations: $100-200

**Your pricing model might be:**
- Flat monthly fee + usage
- Per-conversation pricing
- Tiered plans by volume

---

## 📞 Support for Councils

Provide councils with:

1. **Technical support contact** (you)
2. **Expected response time** for issues
3. **Escalation process** for bugs/outages
4. **Monthly reports** on usage/performance
5. **Quarterly reviews** for improvements

---

**This embed system gives councils full control while you maintain the backend.** Updates to prompts, KB, or logic happen centrally without councils needing to change their embed code! 🎉
