// netlify/functions/vapi-webhook.js
const crypto = require("crypto");

// ---- ENV ----
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DISABLE_SIGNATURE_CHECK = process.env.DISABLE_SIGNATURE_CHECK === "1";
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || "";
const DEFAULT_RUBRIC_ID = process.env.EVAL_DEFAULT_RUBRIC_ID || "43d9b1fe-570f-4c97-abdb-fbbb73ef3d08";

// ---- UTILS ----
function log(...a){ try{console.log(...a);}catch{} }

function verifySignature(raw, sig) {
  if (DISABLE_SIGNATURE_CHECK) return true;
  if (!sig || !VAPI_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", VAPI_WEBHOOK_SECRET);
  hmac.update(raw, "utf8");
  const digest = `sha256=${hmac.digest("hex")}`;
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig)); }
  catch { return false; }
}

function mapStatus(s){
  const m={queued:"created",created:"created",ringing:"in-progress","in-progress":"in-progress",completed:"ended",ended:"ended"};
  return m[String(s||"").toLowerCase()]||"unknown";
}

// ---- SUPABASE HELPERS ----
async function sbUpsertSession(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(row)
  });
  const txt = await res.text();
  log("sessions upsert ->", res.status, txt || "(no body)");
  return res.ok;
}

async function queueEval(session_id) {
  const body = {
    session_id,
    rubric_id: DEFAULT_RUBRIC_ID,
    status: "queued",
    started_at: new Date().toISOString()
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/eval_runs?on_conflict=session_id,rubric_id`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(body)
  });
  log("eval_runs upsert ->", res.status);
  return res.ok;
}

// ---- MAIN HANDLER ----
exports.handler = async (event) => {
  try {
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
      if (q.diag === "write") {
        const body = {
          id: crypto.randomUUID(),
          started_at: new Date(Date.now() - 60_000).toISOString(),
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          assistant_id: null,
          channel: "voice",
          ip: "127.0.0.1",
          outcome: "diag-write",
          summary: "diagnostic insert from webhook",
        };
        const ok = await sbUpsertSession(body);
        return { statusCode: ok ? 200 : 500, body: JSON.stringify({ ok, id: body.id }) };
      }
      return { statusCode: 200, body: "webhook alive" };
    }

    if (event.httpMethod !== "POST")
      return { statusCode: 405, body: "Method Not Allowed" };

    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"] || "";
    if (!verifySignature(raw, sig))
      return { statusCode: 401, body: "bad sig" };

    const payload = JSON.parse(raw);
    const data = payload?.data || payload;
    const call = data?.phoneCall || data?.call || payload?.message?.phoneCall || null;
    const id = call?.id || data?.id || payload?.message?.callId || null;
    if (!id) return { statusCode: 200, body: "no id" };

    const created = call?.createdAt || data?.createdAt || new Date().toISOString();
    const ended = call?.endedAt || call?.completedAt || null;
    const status = mapStatus(call?.status);
    const ip = call?.metadata?.ip || null;

    const row = {
      id,
      assistant_id: call?.assistantId || null,
      started_at: created,
      ended_at: ended,
      updated_at: new Date().toISOString(),
      channel: "voice",
      ip,
      outcome: status,
      summary: call?.summary || null,
      hangup_reason: call?.endedReason || null,
      cost_cents: call?.cost ? Math.round(call.cost * 100) : null,
    };

    log("UPSERT SESSION:", row);
    const ok = await sbUpsertSession(row);
    if (!ok) return { statusCode: 500, body: "db fail" };

    // trigger eval only once per completed call
    if (status === "ended" && ended) {
      await queueEval(id);
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("webhook error", err);
    return { statusCode: 500, body: "server error" };
  }
};
