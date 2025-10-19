// netlify/functions/vapi-webhook.js
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Optional (recommended via env): default rubric for auto-queueing evals
const EVAL_DEFAULT_RUBRIC_ID =
  process.env.EVAL_DEFAULT_RUBRIC_ID || "43d9b1fe-570f-4c97-abdb-fbbb73ef3d08";

// ---------- Guards ----------
function ensureEnv() {
  const miss = [];
  if (!SUPABASE_URL) miss.push("SUPABASE_URL");
  if (!SERVICE_KEY) miss.push("SUPABASE_SERVICE_ROLE_KEY");
  if (miss.length) {
    const msg = `[env] Missing required env vars: ${miss.join(", ")}`;
    console.error(msg);
    throw new Error(msg);
  }
}
ensureEnv();

// ---------- Helpers: retries, truncation, safe JSON ----------
const headers = {
  "Content-Type": "application/json",
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function withRetry(fn, { tries = 3, baseMs = 150 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      const backoff = baseMs * Math.pow(2, i) + Math.random() * 50;
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

// Truncate big strings in nested objects (prevent PostgREST 1MB issues)
function truncateLarge(obj, max = 50000) {
  if (obj == null) return obj;
  if (typeof obj === "string") return obj.length > max ? obj.slice(0, max) + "…[truncated]" : obj;
  if (Array.isArray(obj)) return obj.map(v => truncateLarge(v, max));
  if (typeof obj === "object") {
    const out = Array.isArray(obj) ? [] : {};
    for (const k of Object.keys(obj)) out[k] = truncateLarge(obj[k], max);
    return out;
  }
  return obj;
}

// ---------- Supabase helpers (with retry) ----------
async function sbInsert(table, rows) {
  const body = JSON.stringify(Array.isArray(rows) ? rows : [rows]);
  return withRetry(async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST", headers, body,
    });
    if (!res.ok) throw new Error(`Insert ${table} failed: ${res.status} ${await res.text()}`);
    return res.json().catch(() => ({}));
  });
}
async function sbUpsert(table, rows, onConflict) {
  const body = JSON.stringify(Array.isArray(rows) ? rows : [rows]);
  return withRetry(async () => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
      { method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates" }, body }
    );
    if (!res.ok) throw new Error(`Upsert ${table} failed: ${res.status} ${await res.text()}`);
    return res.json().catch(() => ({}));
  });
}
async function sbUpdate(table, matchQuery, patch) {
  const qs = new URLSearchParams(matchQuery).toString();
  const body = JSON.stringify(patch);
  return withRetry(async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
      method: "PATCH", headers, body,
    });
    if (!res.ok) throw new Error(`Update ${table} failed: ${res.status} ${await res.text()}`);
    return res.json().catch(() => ({}));
  });
}
async function sbSelectOne(table, query) {
  const qs = new URLSearchParams({ ...query, limit: "1" }).toString();
  return withRetry(async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers });
    if (!res.ok) throw new Error(`Select ${table} failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data?.[0] || null;
  });
}
const eq = (v) => `eq.${v}`;
const truthy = (v) => v !== undefined && v !== null && v !== "";

// ---------- Extractors ----------
function pickText(msg, call) {
  const cands = [
    msg?.text, msg?.content?.text, msg?.transcript, msg?.asr, msg?.nlu?.text,
    msg?.message?.text, call?.lastUtterance, call?.summary,
  ];
  for (const v of cands) if (typeof v === "string" && v.trim()) return v;
  return null;
}
function pickRole(msg) {
  if (msg?.role) return msg.role;
  if (msg?.speaker) return msg.speaker;
  if (msg?.toolName) return "tool";
  return "agent";
}

// ---------- Resolve assistant/client (auto-create assistant) ----------
async function resolveClientAndAssistant({ providerAssistantId, clientId, fromNumber }) {
  let assistantRow = null;

  if (providerAssistantId) {
    assistantRow = await sbSelectOne("assistants", {
      select: "*", provider_assistant_id: eq(providerAssistantId),
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
        select: "*", provider_assistant_id: eq(providerAssistantId),
      }).catch(() => null);
    }
  }

  if (!assistantRow && fromNumber) {
    const ep = await sbSelectOne("entrypoints", {
      select: "*,assistant:assistant_id(*)", value: eq(fromNumber),
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
    const rawUnsafe = JSON.parse(event.body || "{}");
    // Truncate large payloads before logging/storing
    const raw = truncateLarge(rawUnsafe);

    // Log full raw payload for deep debugging (safe-truncated)
    await sbInsert("webhook_debug", { headers: truncateLarge(event.headers), payload: raw });

    // Normalize (based on your sample payloads)
    const msg = raw.message || raw;
    const call = msg.call || msg.data?.call || msg.data || {};
    const evtType = raw.type || raw.event || msg.type || msg.event || null;

    const assistantId =
      call?.assistantId || msg?.assistantId || msg?.assistant?.id || raw?.assistantId || call?.assistant?.id || null;

    const sessionId =
      call?.id || msg?.sessionId || msg?.callId || msg?.id || msg?.conversationId || raw?.callId || null;

    const fromNumber =
      msg?.phoneNumber?.number || call?.phoneNumber?.number || call?.customer?.number ||
      call?.from || call?.callerNumber || msg?.from || msg?.callerNumber || null;

    const channel = call?.type ? "voice" : (msg?.channel || "voice");
    const status = call?.status || msg?.status || "";
    const endedAt =
      call?.endedAt || msg?.endedAt || msg?.completedAt ||
      (status && /ended|completed|hangup|disconnected/i.test(String(status)) ? new Date().toISOString() : null);

    const text = pickText(msg, call);
    const role = pickRole(msg);

    const transcriptFull =
      msg?.transcript || msg?.call?.transcript || msg?.artifact?.transcript || msg?.analysis?.summary || null;

    const promptSnapshot =
      msg?.assistant?.model?.messages?.[0]?.content || msg?.artifact?.messages?.[0]?.message || null;

    const assistantName = msg?.assistant?.name || call?.assistantName || null;

    const summary = msg?.summary || msg?.analysis?.summary || null;
    const endedReason = msg?.endedReason || msg?.call?.endedReason || null;
    const recordingUrl = msg?.recordingUrl || msg?.call?.recordingUrl || null;

    // Slim debug row
    await sbInsert("webhook_debug", {
      headers: { slim: true },
      payload: {
        evtType, sessionId, assistantId, fromNumber, status,
        endedAt: endedAt || null, role,
        textPreview: typeof text === "string" ? text.slice(0, 60) : null,
        hasTranscriptFull: !!transcriptFull,
        hasPrompt: !!promptSnapshot,
      },
    });

    // Resolve (& possibly create) assistant + client
    const { resolvedClientId, resolvedAssistantId } = await resolveClientAndAssistant({
      providerAssistantId: assistantId,
      clientId: msg?.metadata?.clientId || raw?.metadata?.clientId || null,
      fromNumber,
    });

    // Keep assistant record fresh (name, versions, prompt)
    if (resolvedAssistantId) {
      const assistantPatch = {
        name: assistantName || undefined,
        prompt_version: msg?.metadata?.promptVersion || undefined,
        kb_version: msg?.metadata?.kbVersion || undefined,
      };
      if (promptSnapshot) assistantPatch.prompt_text = truncateLarge(promptSnapshot, 50000);

      if (Object.values(assistantPatch).some((v) => v !== undefined)) {
        await sbUpdate("assistants", { id: eq(resolvedAssistantId) }, assistantPatch);
      }
    }

    // Entry point mapping (phone number -> assistant)
    if (fromNumber && resolvedAssistantId) {
      await sbUpsert(
        "entrypoints",
        {
          type: "phone_number",
          value: fromNumber,
          name: msg?.phoneNumber?.name || call?.phoneNumber?.name || null,
          assistant_id: resolvedAssistantId,
        },
        "type,value"
      );
    }

    // Event heuristics
    const isMessage =
      evtType === "message.created" || truthy(text) || !!msg?.role || !!msg?.speaker || !!msg?.toolName;

    const isStart =
      evtType === "call.started" || (!!call && !endedAt && !isMessage);

    const isEnd =
      evtType === "call.ended" || evtType === "end-of-call-report" || !!endedAt || msg?.outcome === "ended";

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
          text: truncateLarge(text, 20000),
          tool_name: msg?.toolName || null,
          fallback: !!msg?.fallback,
          tokens_in: msg?.tokensIn ?? null,
          tokens_out: msg?.tokensOut ?? null,
        });
      }
    }

    // End-of-call: ensure session exists, then patch + store artifacts + auto-queue eval
    if (sessionId && isEnd) {
      let existing = await sbSelectOne("sessions", {
        select: "id, started_at",
        provider_session_id: eq(sessionId),
      });

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

      const outcome = msg?.outcome || (call?.hangupReason ? "abandoned" : "resolved");
      const containment =
        typeof msg?.containment === "boolean" ? msg?.containment : outcome === "resolved" ? true : null;

      await sbUpdate("sessions", { provider_session_id: eq(sessionId) }, {
        ended_at: endTs,
        hangup_reason: call?.hangupReason || msg?.hangupReason || null,
        cost_cents: msg?.costCents ?? null,
        aht_seconds: ahtSeconds,
        outcome,
        containment,
        assistant_id: resolvedAssistantId ?? null,
        client_id: resolvedClientId ?? null,
        summary: truncateLarge(summary, 20000) || null,
        ended_reason: endedReason || null,
        recording_url: recordingUrl || null,
      });

      if (existing?.id && (transcriptFull || promptSnapshot)) {
        await sbUpsert(
          "session_artifacts",
          {
            session_id: existing.id,
            provider_session_id: sessionId,
            prompt_snapshot: truncateLarge(promptSnapshot, 50000) || null,
            transcript_full: truncateLarge(transcriptFull, 200000) || null,
            extras: truncateLarge({
              costBreakdown: msg?.costBreakdown || null,
              analysis: msg?.analysis || null,
              artifactLogUrl: msg?.artifact?.logUrl || null,
              recordingUrl: recordingUrl || null,
            }, 10000),
          },
          "session_id"
        );

        // Synthetic full transcript turn for UIs that expect turns
        if (transcriptFull) {
          await sbInsert("turns", {
            session_id: existing.id,
            role: "agent",
            started_at: endTs,
            text: truncateLarge(`[FULL TRANSCRIPT]\n${String(transcriptFull)}`, 200000),
          });
        }
      }

      // Idempotent eval queue (requires unique index on (session_id, rubric_id))
      if (existing?.id && EVAL_DEFAULT_RUBRIC_ID && transcriptFull) {
        await sbUpsert(
          "eval_runs",
          {
            session_id: existing.id,
            rubric_id: EVAL_DEFAULT_RUBRIC_ID,
            status: "pending",
            started_at: new Date().toISOString(),
          },
          "session_id,rubric_id"
        ).catch(() => {});
      }
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
