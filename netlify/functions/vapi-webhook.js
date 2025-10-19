// netlify/functions/vapi-webhook.js
// --- Env (server-side) ---
// Make sure Netlify has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set (server env).
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

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
  if (!res.ok) console.error(`Insert ${table} failed: ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function sbUpsert(table, rows, onConflict) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    }
  );
  if (!res.ok) console.error(`Upsert ${table} failed: ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function sbUpdate(table, matchQuery, patch) {
  const qs = new URLSearchParams(matchQuery).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch),
  });
  if (!res.ok) console.error(`Update ${table} failed: ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function sbSelectOne(table, query) {
  const qs = new URLSearchParams({ ...query, limit: "1" }).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers });
  if (!res.ok) console.error(`Select ${table} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data?.[0] || null;
}

const eq = (v) => `eq.${v}`;

// ---------- Resolve assistant/client (and auto-create assistant if new) ----------
async function resolveClientAndAssistant({ providerAssistantId, clientId, fromNumber }) {
  let assistantRow = null;

  // Try lookup by provider assistant id
  if (providerAssistantId) {
    assistantRow = await sbSelectOne("assistants", {
      select: "*",
      provider_assistant_id: eq(providerAssistantId),
    }).catch(() => null);

    // --- Auto-insert assistant if we haven't seen it before
    if (!assistantRow) {
      await sbUpsert(
        "assistants",
        {
          provider_assistant_id: providerAssistantId,
          client_id: clientId || null,
          name: `Assistant ${String(providerAssistantId).slice(0, 6)}`,
          channel: "voice",
          status: "live",
          prompt_version: "v1",
          kb_version: "v1",
          prompt_text: null, // you can paste later in Supabase UI
        },
        "provider_assistant_id"
      );
      assistantRow = await sbSelectOne("assistants", {
        select: "*",
        provider_assistant_id: eq(providerAssistantId),
      }).catch(() => null);
    }
  }

  // Fallback: resolve via entrypoint (e.g., inbound phone number)
  if (!assistantRow && fromNumber) {
    const ep = await sbSelectOne("entrypoints", {
      select: "*,assistant:assistant_id(*)",
      value: eq(fromNumber),
    }).catch(() => null);
    if (ep?.assistant) assistantRow = ep.assistant;
  }

  const resolvedClientId = clientId || assistantRow?.client_id || null;
  const resolvedAssistantId = assistantRow?.id || null;
  return { resolvedClientId, resolvedAssistantId };
}

// ---------- Netlify Function ----------
exports.handler = async (event) => {
  // CORS
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

    // Keep raw for debugging
    await sbInsert("webhook_debug", { headers: event.headers, payload: body });

    // --- Normalize payload shape (Messaging "Server URL" vs Dashboard Webhooks) ---
    const msg = body.message || body;
    const evtType = body.type || body.event || msg.type || msg.event || null;
    const call = msg.call || msg.data?.call || msg.data || {};
    const assistantId = call.assistantId || msg.assistantId || null;
    const sessionId = call.id || msg.sessionId || msg.callId || msg.id || null;
    const fromNumber = call.from || msg.from || msg.callerNumber || null;
    const channel = call.type ? "voice" : msg.channel || "voice";

    const { resolvedClientId, resolvedAssistantId } = await resolveClientAndAssistant({
      providerAssistantId: assistantId,
      clientId: msg.metadata?.clientId || body.metadata?.clientId || null,
      fromNumber,
    });

    // --- Heuristics when evtType absent ---
    const isStart =
      evtType === "call.started" ||
      (!!call && !call.endedAt && !msg.role && !msg.text && !msg.toolName && !msg.turnId);

    const isEnd = evtType === "call.ended" || !!call?.endedAt || msg.outcome === "ended";

    const isMessage =
      evtType === "message.created" ||
      typeof msg.text === "string" ||
      !!msg.role ||
      !!msg.toolName;

    // --- Upsert session on start/first sight of call ---
    if (sessionId && (isStart || (!isEnd && !isMessage))) {
      await sbUpsert(
        "sessions",
        {
          provider_session_id: sessionId,
          client_id: resolvedClientId,
          assistant_id: resolvedAssistantId,
          channel,
          started_at: call.startedAt || new Date().toISOString(),
          prompt_version: msg.metadata?.promptVersion || "v1",
          kb_version: msg.metadata?.kbVersion || "v1",
          experiment: msg.metadata?.experiment || null,
          outcome: null,
        },
        "provider_session_id"
      );
    }

    // --- Message turns (ensure session exists first) ---
    if (sessionId && isMessage) {
      // Ensure session row exists
      let session = await sbSelectOne("sessions", {
        select: "id, started_at",
        provider_session_id: eq(sessionId),
      });

      if (!session) {
        await sbUpsert(
          "sessions",
          {
            provider_session_id: sessionId,
            client_id: resolvedClientId,
            assistant_id: resolvedAssistantId,
            channel,
            started_at: call.startedAt || msg.createdAt || new Date().toISOString(),
            prompt_version: msg.metadata?.promptVersion || "v1",
            kb_version: msg.metadata?.kbVersion || "v1",
            experiment: msg.metadata?.experiment || null,
          },
          "provider_session_id"
        );

        session = await sbSelectOne("sessions", {
          select: "id",
          provider_session_id: eq(sessionId),
        });
      }

      if (session?.id) {
        await sbInsert("turns", {
          session_id: session.id,
          role: msg.role || "agent",
          started_at: msg.createdAt || new Date().toISOString(),
          latency_ms: msg.latencyMs ?? null,
          text: msg.text || null,
          tool_name: msg.toolName || null,
          fallback: !!msg.fallback,
          tokens_in: msg.tokensIn ?? null,
          tokens_out: msg.tokensOut ?? null,
        });
      }
    }

    // --- Session end: compute AHT and default outcome if missing ---
    if (sessionId && isEnd) {
      const existing = await sbSelectOne("sessions", {
        select: "id, started_at",
        provider_session_id: eq(sessionId),
      });

      const endedAt = call.endedAt || new Date().toISOString();
      let ahtSeconds = null;
      if (existing?.started_at) {
        const startMs = new Date(existing.started_at).getTime();
        const endMs = new Date(endedAt).getTime();
        ahtSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
      }

      const outcome = msg.outcome || (call.hangupReason ? "abandoned" : "resolved");
      const containment =
        typeof msg.containment === "boolean"
          ? msg.containment
          : outcome === "resolved"
          ? true
          : null;

      await sbUpdate("sessions", { provider_session_id: eq(sessionId) }, {
        ended_at: endedAt,
        hangup_reason: call.hangupReason || msg.hangupReason || null,
        cost_cents: msg.costCents ?? null,
        aht_seconds: ahtSeconds,
        outcome,
        containment,
      });
    }

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
