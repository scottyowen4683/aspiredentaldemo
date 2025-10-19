// netlify/functions/vapi-webhook.js
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  "Content-Type": "application/json",
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

// ---------- Supabase helpers ----------
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

// ---------- Flexible extractors ----------
function pickText(msg, call) {
  const cands = [
    msg?.text,
    msg?.content?.text,
    msg?.transcript,
    msg?.asr,
    msg?.nlu?.text,
    msg?.message?.text,
    call?.lastUtterance,
    call?.summary,
  ];
  for (const v of cands) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}
function pickRole(msg) {
  if (msg?.role) return msg.role;
  if (msg?.speaker) return msg.speaker;
  if (msg?.toolName) return "tool";
  return "agent";
}
function truthy(v) { return v !== undefined && v !== null && v !== ""; }

// ---------- Resolve assistant/client (auto-create assistant) ----------
async function resolveClientAndAssistant({ providerAssistantId, clientId, fromNumber }) {
  let assistantRow = null;

  if (providerAssistantId) {
    assistantRow = await sbSelectOne("assistants", {
      select: "*",
      provider_assistant_id: eq(providerAssistantId),
    }).catch(() => null);

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
          prompt_text: null,
        },
        "provider_assistant_id"
      );
      assistantRow = await sbSelectOne("assistants", {
        select: "*",
        provider_assistant_id: eq(providerAssistantId),
      }).catch(() => null);
    }
  }

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

// ---------- Handler ----------
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
    const raw = JSON.parse(event.body || "{}");

    // Full raw for deep debug
    await sbInsert("webhook_debug", { headers: event.headers, payload: raw });

    // Normalize
    const msg = raw.message || raw;
    const call = msg.call || msg.data?.call || msg.data || {};
    const evtType = raw.type || raw.event || msg.type || msg.event || null;

    const assistantId =
      call?.assistantId ||
      msg?.assistantId ||
      msg?.assistant?.id ||
      raw?.assistantId ||
      call?.assistant?.id ||
      null;

    const sessionId =
      call?.id ||
      msg?.sessionId ||
      msg?.callId ||
      msg?.id ||
      msg?.conversationId ||
      raw?.callId ||
      null;

    const fromNumber =
      call?.from ||
      call?.callerNumber ||
      msg?.from ||
      msg?.callerNumber ||
      null;

    const channel = call?.type ? "voice" : msg?.channel || "voice";

    const status = call?.status || msg?.status || "";
    const endedAt =
      call?.endedAt ||
      msg?.endedAt ||
      msg?.completedAt ||
      (status && /ended|completed|hangup|disconnected/i.test(String(status)) ? new Date().toISOString() : null);

    const text = pickText(msg, call);
    const role = pickRole(msg);

    // Slim debug to verify extraction
    await sbInsert("webhook_debug", {
      headers: { slim: true },
      payload: {
        evtType, sessionId, assistantId, fromNumber, status,
        endedAt: endedAt || null, role,
        textPreview: typeof text === "string" ? text.slice(0, 40) : null,
      },
    });

    // Resolve entities
    const { resolvedClientId, resolvedAssistantId } = await resolveClientAndAssistant({
      providerAssistantId: assistantId,
      clientId: msg?.metadata?.clientId || raw?.metadata?.clientId || null,
      fromNumber,
    });

    // Event heuristics
    const isMessage =
      evtType === "message.created" ||
      truthy(text) ||
      !!msg?.role ||
      !!msg?.speaker ||
      !!msg?.toolName;

    const isStart =
      evtType === "call.started" ||
      (!!call && !endedAt && !isMessage);

    const isEnd =
      evtType === "call.ended" ||
      evtType === "end-of-call-report" ||
      !!endedAt ||
      msg?.outcome === "ended";

    // Ensure session exists on start/first sight
    if (sessionId && (isStart || (!isEnd && !isMessage))) {
      await sbUpsert(
        "sessions",
        {
          provider_session_id: sessionId,
          client_id: resolvedClientId,
          assistant_id: resolvedAssistantId,
          channel,
          started_at: call?.startedAt || msg?.createdAt || new Date().toISOString(),
          prompt_version: msg?.metadata?.promptVersion || "v1",
          kb_version: msg?.metadata?.kbVersion || "v1",
          experiment: msg?.metadata?.experiment || null,
          outcome: null,
        },
        "provider_session_id"
      );
    }

    // Message turns (create session if missing)
    if (sessionId && isMessage) {
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
            started_at: call?.startedAt || msg?.createdAt || new Date().toISOString(),
            prompt_version: msg?.metadata?.promptVersion || "v1",
            kb_version: msg?.metadata?.kbVersion || "v1",
            experiment: msg?.metadata?.experiment || null,
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
          role,
          started_at: msg?.createdAt || new Date().toISOString(),
          latency_ms: msg?.latencyMs ?? null,
          text,
          tool_name: msg?.toolName || null,
          fallback: !!msg?.fallback,
          tokens_in: msg?.tokensIn ?? null,
          tokens_out: msg?.tokensOut ?? null,
        });
      }
    }

    // End-of-call: ensure session exists, then patch
    if (sessionId && isEnd) {
      let existing = await sbSelectOne("sessions", {
        select: "id, started_at",
        provider_session_id: eq(sessionId),
      });

      // If we never saw a start/message, create a minimal session now
      if (!existing) {
        await sbUpsert(
          "sessions",
          {
            provider_session_id: sessionId,
            client_id: resolvedClientId,
            assistant_id: resolvedAssistantId,
            channel,
            started_at: call?.startedAt || msg?.createdAt || (endedAt || new Date().toISOString()),
            prompt_version: msg?.metadata?.promptVersion || "v1",
            kb_version: msg?.metadata?.kbVersion || "v1",
            experiment: msg?.metadata?.experiment || null,
            outcome: null,
          },
          "provider_session_id"
        );
        existing = await sbSelectOne("sessions", {
          select: "id, started_at",
          provider_session_id: eq(sessionId),
        });
      }

      const endTs = endedAt || new Date().toISOString();
      let ahtSeconds = null;
      if (existing?.started_at) {
        const startMs = new Date(existing.started_at).getTime();
        const endMs = new Date(endTs).getTime();
        ahtSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
      }

      const outcome =
        msg?.outcome ||
        (call?.hangupReason ? "abandoned" : "resolved");

      const containment =
        typeof msg?.containment === "boolean"
          ? msg?.containment
          : outcome === "resolved"
          ? true
          : null;

      await sbUpdate("sessions", { provider_session_id: eq(sessionId) }, {
        ended_at: endTs,
        hangup_reason: call?.hangupReason || msg?.hangupReason || null,
        cost_cents: msg?.costCents ?? null,
        aht_seconds: ahtSeconds,
        outcome,
        containment,
        assistant_id: resolvedAssistantId ?? null,
        client_id: resolvedClientId ?? null,
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
