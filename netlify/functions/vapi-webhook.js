// netlify/functions/vapi-webhook.js
const crypto = require("crypto");

// --- Environment ------------------------------------------------------------
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DISABLE_SIG   = process.env.DISABLE_SIGNATURE_CHECK === "1";
const VAPI_SECRET   = process.env.VAPI_WEBHOOK_SECRET || "";
const DEFAULT_RUBRIC_ID =
  process.env.EVAL_DEFAULT_RUBRIC_ID || "43d9b1fe-570f-4c97-abdb-fbbb73ef3d08";

// --- Utility ----------------------------------------------------------------
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

// --- Payload parsing --------------------------------------------------------
function getMessage(payload) {
  return payload?.message || null;
}

function getCall(payload) {
  return (
    payload?.data?.phoneCall ||
    payload?.data?.call ||
    payload?.message?.phoneCall ||
    payload?.message?.conversation ||
    payload?.data ||
    null
  );
}

function getTimesFromMessage(msg) {
  const ts = typeof msg?.timestamp === "number" ? new Date(msg.timestamp) : new Date();
  const ended_at = ts.toISOString();
  const started_at = new Date(ts.getTime() - 2 * 60 * 1000).toISOString();
  return { started_at, ended_at };
}

function extractSummaryFromMessage(msg) {
  return msg?.analysis?.summary || msg?.artifact?.summary || null;
}

// --- Main handler -----------------------------------------------------------
exports.handler = async (event) => {
  try {
    // Preview
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    log("📞 Incoming webhook body preview:", rawBody.slice(0, 1000));

    // ---------- Diagnostics ----------
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
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

    // ---------- Webhook ----------
    if (event.httpMethod !== "POST")
      return { statusCode: 405, body: "Method Not Allowed" };

    const raw = rawBody;
    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"] || "";
    if (!verifySignature(raw, sig)) return { statusCode: 401, body: "bad sig" };

    const payload = JSON.parse(raw);
    const msg = getMessage(payload);
    if (!msg || msg.type !== "end-of-call-report") return { statusCode: 200, body: "ignored" };

    const call = getCall(payload);
    const id =
      call?.id ||
      msg?.callId ||
      msg?.phoneCallId ||
      msg?.conversationId ||
      crypto.randomUUID();

    const { started_at, ended_at } = getTimesFromMessage(msg);
    const summary = extractSummaryFromMessage(msg);

    const row = {
      id,
      assistant_id: msg?.assistantId || call?.assistantId || null,
      started_at,
      ended_at,
      channel: "voice",
      outcome: "ended",
      summary,
      hangup_reason: msg?.endedReason || call?.endedReason || null,
      cost_cents: call?.cost ? Math.round(Number(call.cost) * 100) : null,
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

    await sbUpsertEvalRun(id);
    return { statusCode: 200, body: "ok" };

  } catch (err) {
    console.error("webhook error", err);
    return { statusCode: 500, body: "server error" };
  }
};
