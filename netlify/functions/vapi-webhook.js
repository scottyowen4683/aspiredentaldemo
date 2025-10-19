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

function getCall(payload) {
  const d = payload?.data || payload;
  return d?.phoneCall || d?.call || payload?.message?.phoneCall || null;
}
function getCallId(payload) {
  const d = payload?.data || payload;
  const msg = payload?.message;
  const call = getCall(payload);
  return call?.id || d?.id || msg?.callId || msg?.phoneCallId || null;
}
function getTimes(payload) {
  const msg = payload?.message;
  const d = payload?.data || payload;
  const call = getCall(payload);
  const createdAt = call?.createdAt || d?.createdAt || (msg?.timestamp ? new Date(msg.timestamp).toISOString() : null);
  const started_at = call?.startedAt || createdAt || new Date().toISOString();
  const ended_at = call?.endedAt || call?.completedAt || null;
  return { started_at, ended_at };
}
function getStatus(payload) {
  const call = getCall(payload);
  return mapStatus(call?.status);
}

exports.handler = async (event) => {
  try {
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

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"] || "";
    if (!verifySignature(raw, sig)) return { statusCode: 401, body: "bad sig" };

    const payload = JSON.parse(raw);
    const id = getCallId(payload);
    if (!id) return { statusCode: 200, body: "no id" };

    const { started_at, ended_at } = getTimes(payload);
    const outcome = getStatus(payload);
    const call = getCall(payload);

    const row = {
      id,
      assistant_id: call?.assistantId || null,
      started_at,
      ended_at,
      channel: "voice",
      outcome,
      summary: call?.summary || null,
      hangup_reason: call?.endedReason || null,
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

    if (outcome === "ended" && ended_at) await sbUpsertEvalRun(id);

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("webhook error", err);
    return { statusCode: 500, body: "server error" };
  }
};
