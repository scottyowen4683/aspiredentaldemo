// netlify/functions/vapi-webhook.js
const crypto = require("crypto");

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DISABLE_SIG   = process.env.DISABLE_SIGNATURE_CHECK === "1";
const VAPI_SECRET   = process.env.VAPI_WEBHOOK_SECRET || "";
const DEFAULT_RUBRIC_ID =
  process.env.EVAL_DEFAULT_RUBRIC_ID || "43d9b1fe-570f-4c97-abdb-fbbb73ef3d08";

function log(...a) { try { console.log(...a); } catch {} }

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
    queued: "created",
    created: "created",
    ringing: "in-progress",
    "in-progress": "in-progress",
    completed: "ended",
    ended: "ended",
    failed: "ended",
    busy: "ended",
    canceled: "ended",
  };
  return m[String(s || "").toLowerCase()] || "unknown";
}

// --- Supabase helpers -------------------------------------------------------
async function sbUpsertSession(row) {
  const url = `${SUPABASE_URL}/rest/v1/sessions?on_conflict=id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  log("sessions upsert ->", res.status, text || "(no body)");
  return { ok: res.ok, status: res.status, text };
}

async function sbUpsertEvalRun(session_id) {
  const url = `${SUPABASE_URL}/rest/v1/eval_runs?on_conflict=session_id,rubric_id`;
  const body = {
    session_id,
    rubric_id: DEFAULT_RUBRIC_ID,
    status: "queued",
    started_at: new Date().toISOString(),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  log("eval_runs upsert ->", res.status, text || "(no body)");
  return { ok: res.ok, status: res.status, text };
}

// --- Helpers to read Vapi payloads -----------------------------------------
function getMessage(payload) {
  return payload?.message || null;
}

// On end-of-call-report we may not get a call id.
// Fall back to a stable synthetic id based on timestamp.
function deriveSessionId(msg) {
  return (
    msg?.callId ||
    msg?.phoneCallId ||
    msg?.conversationId ||
    `fallback-${msg?.timestamp || Date.now()}`
  );
}

function getTimesFromMessage(msg) {
  // msg.timestamp is millisecond epoch per your logs
  const ts = typeof msg?.timestamp === "number"
    ? new Date(msg.timestamp)
    : new Date();

  const ended_at = ts.toISOString();
  // started_at not sent on message payloads; pick a safe earlier time so UI sorts correctly
  const started_at = new Date(ts.getTime() - 2 * 60 * 1000).toISOString();
  return { started_at, ended_at };
}

function extractSummaryFromMessage(msg) {
  // Vapi end-of-call-report usually carries { analysis: { summary, successEvaluation, ... } }
  const summary =
    msg?.analysis?.summary ||
    msg?.artifact?.summary ||
    null;
  return summary;
}

// --- Main handler -----------------------------------------------------------
exports.handler = async (event) => {
  try {
    // TEMP: Body preview to see incoming shapes
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const preview = rawBody.slice(0, 1000);
    log("📞 Incoming webhook body preview:", preview);

    // -------------------- GET: diagnostics --------------------
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

    // -------------------- POST: real events --------------------
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const raw = rawBody;
    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"] || "";
    if (!verifySignature(raw, sig)) return { statusCode: 401, body: "bad sig" };

    const payload = JSON.parse(raw);
    const msg = getMessage(payload);

    // We only persist the final event that contains summary/transcript/etc.
    if (!msg || msg.type !== "end-of-call-report") {
      // Ignore mid-call noise so we don’t spam sessions
      return { statusCode: 200, body: "ignored" };
    }

    const id = deriveSessionId(msg);
    const { started_at, ended_at } = getTimesFromMessage(msg);
    const outcome = "ended";
    const summary = extractSummaryFromMessage(msg);

    const row = {
      id,                       // uuid or fallback string -> make sure your column is uuid; if not, swap to text
      assistant_id: msg?.assistantId || null,
      started_at,
      ended_at,
      channel: "voice",
      outcome,
      summary,                  // short LLM summary from end-of-call-report
      hangup_reason: msg?.endedReason || null,
      cost_cents: null,         // unknown here; leave null
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

    // Queue the rubric evaluation for this session
    await sbUpsertEvalRun(id);

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("webhook error", err);
    return { statusCode: 500, body: "server error" };
  }
};
