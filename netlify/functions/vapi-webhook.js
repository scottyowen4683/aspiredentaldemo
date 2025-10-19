// netlify/functions/vapi-webhook.js
const crypto = require("crypto");

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DISABLE_SIG   = process.env.DISABLE_SIGNATURE_CHECK === "1";
const VAPI_SECRET   = process.env.VAPI_WEBHOOK_SECRET || "";
const DEFAULT_RUBRIC_ID =
  process.env.EVAL_DEFAULT_RUBRIC_ID || "43d9b1fe-570f-4c97-abdb-fbbb73ef3d08";

const log = (...a) => { try { console.log(...a); } catch {} };

// --- signature check ---------------------------------------------------------
function verifySignature(raw, sig) {
  if (DISABLE_SIG) return true;
  if (!sig || !VAPI_SECRET) return false;
  const h = crypto.createHmac("sha256", VAPI_SECRET);
  h.update(raw, "utf8");
  const digest = `sha256=${h.digest("hex")}`;
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig)); }
  catch { return false; }
}

// --- supabase helpers --------------------------------------------------------
async function sbUpsertSession(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions?on_conflict=id`, {
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
  const body = {
    session_id,
    rubric_id: DEFAULT_RUBRIC_ID,
    status: "queued",
    started_at: new Date().toISOString(),
  };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/eval_runs?on_conflict=session_id,rubric_id`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(body),
    }
  );
  const text = await res.text();
  log("eval_runs upsert ->", res.status, text || "(no body)");
  return { ok: res.ok, status: res.status, text };
}

// --- request parsing ---------------------------------------------------------
function getMessage(payload) {
  return payload?.message || null;
}
function extractSummaryFromMessage(msg) {
  return (
    msg?.analysis?.summary ||
    msg?.artifact?.summary ||
    null
  );
}
function getTimesFromMessage(msg) {
  // msg.timestamp is a unix ms stamp in your logs
  const ts = typeof msg?.timestamp === "number"
    ? new Date(msg.timestamp)
    : new Date();
  const ended_at = ts.toISOString();
  const started_at = new Date(ts.getTime() - 2 * 60 * 1000).toISOString(); // 2 min earlier so UI sorts
  return { started_at, ended_at };
}

exports.handler = async (event) => {
  try {
    // --- DIAG
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
        // sanity write: create a synthetic session + queue eval
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
        const up = await sbUpsertSession(row);
        let evalRes = null;
        if (up.ok) evalRes = await sbUpsertEvalRun(id);
        return {
          statusCode: up.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: up.ok,
            session_upsert: { status: up.status, text: up.text },
            eval_upsert: evalRes ? { status: evalRes.status, text: evalRes.text } : null,
            id,
          }),
        };
      }
      return { statusCode: 200, body: "vapi-webhook alive" };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");

    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"] || "";
    if (!verifySignature(raw, sig)) return { statusCode: 401, body: "bad sig" };

    const payload = JSON.parse(raw);
    const msg = getMessage(payload);

    // IMPORTANT: only act on end-of-call-report; ignore all mid-call events
    if (!msg || msg.type !== "end-of-call-report") {
      // no DB writes for conversation/speech/status updates
      return { statusCode: 200, body: "ignored" };
    }

    // Create a fresh UUID for our session row (do NOT use fallback-... strings)
    const id = crypto.randomUUID();
    const { started_at, ended_at } = getTimesFromMessage(msg);
    const summary = extractSummaryFromMessage(msg);

    const row = {
      id,
      assistant_id: null,                // unknown in this payload
      started_at,
      ended_at,
      channel: "voice",
      outcome: "ended",
      summary,
      hangup_reason: msg?.endedReason || null,
      cost_cents: null,
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
