// netlify/functions/vapi-webhook.js
const crypto = require("crypto");

/**
 * Required env:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - EVAL_DEFAULT_RUBRIC_ID   (uuid of your rubric)
 * Optional:
 *  - VAPI_WEBHOOK_SECRET       (set if you want signature checks)
 *  - DISABLE_SIGNATURE_CHECK=1 (to bypass signature during testing)
 *  - DEBUG_LOG=1               (more logs)
 */

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DISABLE_SIG   = process.env.DISABLE_SIGNATURE_CHECK === "1";
const VAPI_SECRET   = process.env.VAPI_WEBHOOK_SECRET || "";
const DEFAULT_RUBRIC_ID =
  process.env.EVAL_DEFAULT_RUBRIC_ID || "43d9b1fe-570f-4c97-abdb-fbbb73ef3d08";
const DEBUG = process.env.DEBUG_LOG === "1";

function log(...a) { if (DEBUG) try { console.log(...a); } catch {} }

function verifySignature(raw, sig) {
  if (DISABLE_SIG) return true;
  if (!sig || !VAPI_SECRET) return false;
  const h = crypto.createHmac("sha256", VAPI_SECRET);
  h.update(raw, "utf8");
  const digest = `sha256=${h.digest("hex")}`;
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig)); }
  catch { return false; }
}

function mapStatus(s) {
  const m = {
    queued: "created", created: "created",
    ringing: "in-progress", "in-progress": "in-progress",
    completed: "ended", ended: "ended",
    failed: "ended", busy: "ended", canceled: "ended"
  };
  return m[String(s || "").toLowerCase()] || "unknown";
}

/* ------------------------- Supabase helpers ------------------------- */

async function sbFetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init.headers || {}),
    },
  });
  return res;
}

async function sbUpsertSession(row) {
  const res = await sbFetch(`/rest/v1/sessions?on_conflict=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  log("sessions upsert ->", res.status, text || "(no body)");
  return { ok: res.ok, status: res.status, text };
}

async function sbLookupAssistantIdByCallId(call_id) {
  const res = await sbFetch(`/rest/v1/calls?select=assistant_id&call_id=eq.${encodeURIComponent(call_id)}&limit=1`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.assistant_id || null;
}

async function sbUpsertTranscript(session_id, content) {
  if (!content) return { ok: true, skipped: true };
  const res = await sbFetch(`/rest/v1/session_transcripts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ session_id, content }),
  });
  const text = await res.text();
  log("session_transcripts insert ->", res.status, text || "(no body)");
  return { ok: res.ok, status: res.status, text };
}

async function sbUpsertEvalRun(session_id) {
  const body = {
    session_id,
    rubric_id: DEFAULT_RUBRIC_ID,
    status: "queued",
    started_at: new Date().toISOString(),
  };
  const res = await sbFetch(`/rest/v1/eval_runs?on_conflict=session_id,rubric_id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  log("eval_runs upsert ->", res.status, text || "(no body)");
  return { ok: res.ok, status: res.status, text };
}

/* ----------------------- Payload interpretation --------------------- */

function getMessage(payload) { return payload?.message || null; }

function deriveSessionId(msg) {
  // Use a real UUID whenever possible
  if (msg?.callId && isUuid(msg.callId)) return msg.callId;
  if (msg?.phoneCallId && isUuid(msg.phoneCallId)) return msg.phoneCallId;
  if (msg?.conversationId && isUuid(msg.conversationId)) return msg.conversationId;
  // Otherwise mint a UUID so it fits the sessions.id uuid column
  return crypto.randomUUID();
}

function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
}

function getTimesFromMessage(msg) {
  const ts = typeof msg?.timestamp === "number"
    ? new Date(msg.timestamp)
    : new Date();

  const ended_at = ts.toISOString();
  const started_at = new Date(ts.getTime() - 2 * 60 * 1000).toISOString(); // keep sort stable
  return { started_at, ended_at };
}

function extractSummaryFromMessage(msg) {
  return (
    msg?.analysis?.summary ||
    msg?.artifact?.summary ||
    null
  );
}

function buildTranscript(msg) {
  const msgs = msg?.artifact?.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) return null;
  return msgs
    .filter(m => m?.role && (m.message || m.content || m.text))
    .map(m => {
      const text = m.message || m.content || m.text || "";
      const who = (m.role === "user") ? "User" : (m.role === "assistant" ? "AI" : m.role);
      return `${who}: ${text}`.trim();
    })
    .join("\n");
}

/* ----------------------------- Handler ------------------------------ */

exports.handler = async (event) => {
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const preview = rawBody.slice(0, 1000);
    log("📞 Incoming webhook body preview:", preview);

    // Diagnostics
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
      if (q.diag === "env") {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: true,
            SUPABASE_URL: !!SUPABASE_URL,
            SERVICE_KEY: !!SERVICE_KEY,
            DEFAULT_RUBRIC_ID,
            DISABLE_SIGNATURE_CHECK: DISABLE_SIG,
          }),
        };
      }
      if (q.diag === "write") {
        const id = crypto.randomUUID();
        const row = {
          id,
          started_at: new Date(Date.now() - 60_000).toISOString(),
          ended_at: new Date().toISOString(),
          assistant_id: null,
          channel: "voice",
          outcome: "ended",
          summary: "diagnostic insert from webhook",
          hangup_reason: null,
          cost_cents: null,
          aht_seconds: 60
        };
        const result = await sbUpsertSession(row);
        let evalResult = null;
        if (result.ok) evalResult = await sbUpsertEvalRun(id);
        return {
          statusCode: result.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: result.ok,
            session_upsert: { status: result.status, text: result.text },
            eval_upsert: evalResult ? { status: evalResult.status, text: evalResult.text } : null,
            id,
          }),
        };
      }
      return { statusCode: 200, body: "vapi-webhook alive" };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"] || "";
    if (!verifySignature(rawBody, sig)) return { statusCode: 401, body: "bad sig" };

    const payload = JSON.parse(rawBody);
    const msg = getMessage(payload);

    // Only persist once at the end
    if (!msg || msg.type !== "end-of-call-report") {
      return { statusCode: 200, body: "ignored" };
    }

    const id = deriveSessionId(msg);
    const { started_at, ended_at } = getTimesFromMessage(msg);
    const outcome = "ended";
    const summary = extractSummaryFromMessage(msg);
    const transcriptText = buildTranscript(msg);

    // Compute AHT seconds
    const aht_seconds = (started_at && ended_at)
      ? Math.max(0, Math.round((new Date(ended_at) - new Date(started_at)) / 1000))
      : 0;

    // Try to fill assistant_id (from message or calls table)
    let assistant_id = msg?.assistantId || null;
    if (!assistant_id) {
      assistant_id = await sbLookupAssistantIdByCallId(id);
    }

    const row = {
      id,
      assistant_id: assistant_id || null,
      started_at,
      ended_at,
      channel: "voice",
      outcome,
      summary,
      hangup_reason: msg?.endedReason || null,
      cost_cents: null,
      aht_seconds,
    };

    log("UPSERT SESSION ROW:", row);
    const up = await sbUpsertSession(row);
    if (!up.ok) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, where: "sessions", status: up.status, text: up.text }),
      };
    }

    // Transcript row for the dashboard
    if (transcriptText) await sbUpsertTranscript(id, transcriptText);

    // Queue eval for this session
    await sbUpsertEvalRun(id);

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("webhook error", err);
    return { statusCode: 500, body: "server error" };
  }
};
