// netlify/functions/vapi-webhook.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn("[vapi-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const headers = {
  "Content-Type": "application/json",
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

// ---------- Supabase REST helpers ----------
async function sbInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!res.ok) throw new Error(`Insert ${table} failed: ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function sbUpsert(table, rows, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!res.ok) throw new Error(`Upsert ${table} failed: ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function sbUpdate(table, matchQuery, patch) {
  const qs = new URLSearchParams(matchQuery).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update ${table} failed: ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function sbSelectOne(table, query) {
  const qs = new URLSearchParams({ ...query, limit: "1" }).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers });
  if (!res.ok) throw new Error(`Select ${table} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.[0] || null;
}

// URL-helpers for PostgREST filters
const eq = (v) => `eq.${v}`;
const ilike = (v) => `ilike.${v}`;

// ---------- Resolve assistant/client from metadata or entrypoint ----------
async function resolveClientAndAssistant({ providerAssistantId, clientId, fromNumber }) {
  // If clientId is already supplied (metadata), we can still try to find assistant record.
  let assistantRow = null;
  if (providerAssistantId) {
    assistantRow = await sbSelectOne("assistants", { select: "*", provider_assistant_id: eq(providerAssistantId) }).catch(() => null);
  }

  // If no assistant row yet and we have an inbound number, resolve via entrypoints
  if (!assistantRow && fromNumber) {
    const ep = await sbSelectOne("entrypoints", { select: "*,assistant:assistant_id(*)", value: eq(fromNumber) }).catch(() => null);
    if (ep?.assistant) assistantRow = ep.assistant;
  }

  const resolvedClientId = clientId || assistantRow?.client_id || null;
  const resolvedAssistantId = assistantRow?.id || null;

  return { resolvedClientId, resolvedAssistantId };
}

// ---------- Netlify function ----------
exports.handler = async (event) => {
  // CORS preflight (optional)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    await sbInsert("webhook_debug", { headers: event.headers, payload: body });
    const { type, data } = body;

    // Pull common fields we may need from the event
    const metadata = data?.metadata || {};
    const providerSessionId = data?.sessionId || data?.callId || data?.id;
    const providerAssistantId = data?.assistantId || metadata?.assistantId;
    const channel = data?.channel || (data?.callType ? "voice" : "chat");
    const fromNumber = data?.from || data?.callerNumber || null;

    // Try to resolve client/assistant via metadata first, then DB lookups
    const { resolvedClientId, resolvedAssistantId } = await resolveClientAndAssistant({
      providerAssistantId,
      clientId: metadata?.clientId || null,
      fromNumber,
    });

    // ------- Event handlers -------
    if (type === "call.started") {
      const row = {
        provider_session_id: providerSessionId,
        client_id: resolvedClientId,
        assistant_id: resolvedAssistantId,
        channel: channel || "voice",
        started_at: data?.startedAt || new Date().toISOString(),
        prompt_version: metadata?.promptVersion || "v1",
        kb_version: metadata?.kbVersion || "v1",
        experiment: metadata?.experiment || null,
      };
      await sbUpsert("sessions", row, "provider_session_id");
    }

    if (type === "message.created") {
      // Find session row to get internal UUID
      const session = await sbSelectOne("sessions", { select: "id", provider_session_id: eq(providerSessionId) });
      if (session?.id) {
        const turn = {
          session_id: session.id,
          role: data?.role || "agent",
          started_at: data?.createdAt || new Date().toISOString(),
          latency_ms: data?.latencyMs ?? null,
          text: data?.text || null,
          tool_name: data?.toolName || null,
          fallback: !!data?.fallback,
          tokens_in: data?.tokensIn ?? null,
          tokens_out: data?.tokensOut ?? null,
        };
        await sbInsert("turns", turn);
      }
    }

    if (type === "intent.detected") {
      const session = await sbSelectOne("sessions", { select: "id", provider_session_id: eq(providerSessionId) });
      if (session?.id) {
        const intent = {
          session_id: session.id,
          name: data?.name || data?.intent || "unknown",
          detected_at: data?.detectedAt || new Date().toISOString(),
          success: typeof data?.success === "boolean" ? data.success : null,
          details: data?.details || null,
        };
        await sbInsert("intents", intent);
      }
    }

    if (type === "call.ended") {
      const outcome = data?.outcome || (data?.hangupReason ? "abandoned" : null);
      const patch = {
        ended_at: data?.endedAt || new Date().toISOString(),
        hangup_reason: data?.hangupReason || null,
        cost_cents: data?.costCents ?? null,
        aht_seconds: data?.ahtSeconds ?? null,
        outcome,
        containment: outcome === "resolved" ? true : (typeof data?.containment === "boolean" ? data.containment : null),
      };
      await sbUpdate("sessions", { provider_session_id: eq(providerSessionId) }, patch);
    }

    // You can add more Vapi events here as needed.

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("[vapi-webhook] error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "internal error" }),
    };
  }
};
