# CRM Integration Module - Setup Guide

This module enables bidirectional integrations with CRMs and call centers like TechOne, SAP, Genesys, Salesforce, and more.

## Features

- **Outbound**: Push data to CRMs (log calls, create jobs/tickets, sync contacts)
- **Inbound**: Pull knowledge base content from external systems
- **Chained Workflows**: Multiple integrations can fire on the same event (e.g., log to Genesys → create TechOne job)
- **Assistant-Specific**: Configure integrations per-agent with fallback to org defaults
- **Pre-built Templates**: Ready-to-use configurations for TechOne, SAP, Genesys, Salesforce, etc.

## Setup Steps

### 1. Apply Database Migrations

Run these migrations in order:

```bash
# From the project root
cd vapi-takeover/supabase

# Apply migrations (using Supabase CLI or directly in Supabase dashboard)
# 017_add_crm_integrations.sql
# 018_enhance_integrations_versatility.sql
# 019_assistant_integration_settings.sql
```

Or copy/paste the SQL into your Supabase SQL editor.

### 2. Register the API Routes

Add these two lines to `server.js`:

**At the top with other imports (~line 24):**
```javascript
import integrationsRouter from './routes/integrations.js';
```

**With the other route registrations (~line 89):**
```javascript
app.use('/api/integrations', integrationsRouter);
```

### 3. Add Frontend Route

In your frontend router (usually `App.tsx` or router config), add:

```tsx
import Integrations from "@/pages/Integrations";

// In your routes array:
{ path: "/integrations", element: <Integrations /> }
```

### 4. Add Navigation Link (Optional)

In `DashboardLayout.tsx` or your navigation component, add a menu item:

```tsx
{ name: "Integrations", href: "/integrations", icon: Plug }
```

## File Structure

```
backend/
├── services/
│   └── integration-service.js     # Core integration logic & CRM connectors
├── routes/
│   └── integrations.js            # API endpoints
└── frontend/src/
    ├── pages/
    │   └── Integrations.tsx       # Main integrations page
    └── components/dashboard/
        └── AssistantIntegrationSettings.tsx  # Per-assistant config component
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/integrations/templates` | Get all provider templates |
| GET | `/api/integrations/templates/:provider` | Get specific template |
| GET | `/api/integrations/org/:org_id` | List org integrations |
| GET | `/api/integrations/:id` | Get integration details |
| POST | `/api/integrations/org/:org_id` | Create integration |
| PUT | `/api/integrations/:id` | Update integration |
| DELETE | `/api/integrations/:id` | Delete integration |
| POST | `/api/integrations/:id/test` | Test connection |
| POST | `/api/integrations/:id/import-kb` | Import knowledge base |
| POST | `/api/integrations/:id/send` | Send data to CRM |
| GET | `/api/integrations/:id/logs` | Get sync history |
| POST | `/api/integrations/process-queue` | Process event queue |

## Using the AssistantIntegrationSettings Component

Import and use in your assistant edit modal:

```tsx
import AssistantIntegrationSettings from "@/components/dashboard/AssistantIntegrationSettings";

// In your component:
<AssistantIntegrationSettings
  assistantId={assistant.id}
  orgId={assistant.org_id}
  integrationsEnabled={assistant.integrations_enabled}
  integrationSettings={assistant.integration_settings}
  onUpdate={(enabled, settings) => {
    // Save to assistant record
    updateAssistant({
      integrations_enabled: enabled,
      integration_settings: settings
    });
  }}
  compact={false}  // or true for sidebar mode
/>
```

## Workflow: Chained Integrations

Example: Council call handling workflow

1. **Event**: Call ends
2. **Integration 1** (priority 10): Log to Genesys Cloud (call center analytics)
3. **Integration 2** (priority 20): Create job in TechOne CRM
4. **Integration 3** (priority 30): Send summary to Salesforce

Configure priority on each integration - lower numbers run first.

## Supported Providers

| Provider | Outbound | Inbound KB | Auth Type |
|----------|----------|------------|-----------|
| TechOne | ✅ | ✅ | OAuth2 |
| SAP | ✅ | ✅ | OAuth2 |
| Genesys Cloud | ✅ | ❌ | OAuth2 |
| Salesforce | ✅ | ✅ | OAuth2 |
| Dynamics 365 | ✅ | ✅ | OAuth2 |
| Zendesk | ✅ | ✅ | API Key |
| Freshdesk | ✅ | ✅ | API Key |
| Custom API | ✅ | ✅ | Various |

## Event Triggers

Configure which events trigger each integration:

- `conversation_ended` - When a call/chat completes
- `contact_request` - When user requests callback
- `escalation` - When call is escalated to human
- `kb_sync` - Scheduled KB sync
- `low_score` - When conversation score is below threshold

## Environment Variables (Optional)

No new environment variables required - integrations store their credentials in the database (auth_config JSONB column).

For enhanced security, you may want to add encryption at rest for the auth_config field.
