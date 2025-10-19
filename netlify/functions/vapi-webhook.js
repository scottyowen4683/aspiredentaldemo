// netlify/functions/vapi-webhook.js
const crypto = require("crypto");

/**
 * Env:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - VAPI_WEBHOOK_SECRET         (optional while testing)
 *  - DISABLE_SIGNATURE_CHECK=1   (set to 0 once secret is configured)
 *  - DEBUG_LOG=1                 (optional)
 */
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const VAPI_SECRET   = process.env.VAPI_WEBHOOK_SECRET;
const DISABLE_SIG   = process.env.DISABLE_SIGNATURE_CHECK === "1";
const DEBUG         = process.env.DEBUG_LOG === "1";
const log = (...a) => { if (DEBUG) console.log(...a); };

// ---------- utils ----------
function verifySignature(rawBody, signature) {
  if (DISABLE_SIG) return true;
  if (!VAPI_SECRET) return false;
  const h = crypto.createHmac("sha256", VAPI_SECRET).update(rawBody, "utf8").digest("hex");
  const digest = `sha256=${h}`;
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature || "")); }
  catch { return false; }
}
const j = (x) => JSON.stringify(x);

// ---------- Supabase writes (sessions only) ----------
async function sbUpsertSessionMinimal({ provider_session_id, started_at }) {
  const row = {
    provider_session_id,             // text
    channel: "voice",                // text
    started_at: started_at || new Date().toISOString(), // timestamptz
    // prompt_version/kb_version default handled by DB or keep null
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions?on_conflict=provider_session_id`, {
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
  return { ok: res.ok, status: res.status, text };
}

async function sbPatchSession(provider_session_id, patch) {
  if (!patch || !Object.keys(patch).length) return { ok: true, status: 200, text: "" };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sessions?provider_session_id=eq.${encodeURIComponent(provider_session_id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    }
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

// ---------- Vapi payload mapping ----------
function pickId(payload) {
  const msg  = payload?.message;
  const data = payload?.data || payload;
  const call = data?.phoneCall || data?.call || data;
  return (
    call?.id ||
    data?.id ||
    msg?.phoneCallId ||
    msg?.callId ||
    null
  );
}
function pickTimestamps(payload) {
  const msg  = payload?.message;
  const data = payload?.data || payload;
  const call = data?.phoneCall || data?.call || data;

  const createdAt = call?.createdAt || data?.createdAt || (msg?.timestamp ? new Date(msg.timestamp).toISOString() : null);
  const started_at = call?.startedAt || createdAt || null;

  // ended_at can come from provider or we synthesize on end-of-call-report
  const ended_at =
    call?.endedAt ||
    call?.completedAt ||
    (payload?.type === "end-of-call-report" ? new Date().toISOString() : null);

  return { started_at, ended_at };
}
function pickExtras(payload) {
  const msg  = payload?.message;
  const data = payload?.data || payload;
  const call = data?.phoneCall || data?.call || data;

  // Recording URL if provided by Vapi
  const recording_url =
    call?.recordingUrl ||
    data?.recordingUrl ||
    msg?.recordingUrl ||
    null;

  // End reason if available
  const ended_reason =
    call?.endedReason ||
    data?.endedReason ||
    (msg?.endedReason ?? null);

  // Analysis from end-of-call-report
  let summary = null;
  let outcome = null; // we will set to "resolved" only if obviously successful
  if ((payload?.event || payload?.type || msg?.type) === "end-of-call-report") {
    const a = msg?.analysis || payload?.analysis || null;
    if (a) {
      summary = a.summary || null;
      const suc = typeof a.successEvaluation === "boolean"
        ? a.successEvaluation
        : (typeof a.successEvaluation === "string" ? a.successEvaluation.toLowerCase() === "true" : null);
      if (suc === true) outcome = "resolved";
    }
  }
  return { summary, outcome, recording_url, ended_reason };
}
function calcAHTSeconds(started_at, ended_at) {
  if (!started_at || !ended_at) return null;
  const s = new Date(started_at).getTime();
  const e = new Date(ended_at).getTime();
  if (Number.isFinite(s) && Number.isFinite(e) && e >= s) return Math.round((e - s) / 1000);
  return null;
}

// ---------- handler ----------
exports.handler = async (event) => {
  try {
    // --- GET diagnostics ---
    if (event.httpMethod === "GET") {
      const diag = event.queryStringParameters?.diag;
      if (diag === "env") {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: j({
            ok: true,
            env: {
              SUPABASE_URL_present: !!SUPABASE_URL,
              SERVICE_KEY_present: !!SERVICE_KEY,
              VAPI_WEBHOOK_SECRET_present: !!VAPI_SECRET,
              DISABLE_SIGNATURE_CHECK: DISABLE_SIG,
              DEBUG: DEBUG,
            },
          }),
        };
      }
      if (diag === "write") {
        const id = `browser-diag-${Date.now()}`;
        const r = await sbUpsertSessionMinimal({ provider_session_id: id, started_at: new Date().toISOString() });
        return {
          statusCode: r.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
          body: j({ ok: r.ok, status: r.status, resp: r.text, id }),
        };
      }
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: j({ ok: true, msg: "vapi-webhook alive" }) };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // --- Signature check ---
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"];
    if (!verifySignature(rawBody, sig)) {
      return { statusCode: 401, body: j({ message: "Invalid signature" }) };
    }

    const payload = JSON.parse(rawBody);
    const provider_session_id = pickId(payload);
    if (!provider_session_id) {
      if (DEBUG) log("Webhook: no provider_session_id; skipping. sample:", rawBody.slice(0, 600));
      return { statusCode: 200, body: j({ ok: true, skipped: "no id" }) };
    }

    const { started_at, ended_at } = pickTimestamps(payload);
    const { summary, outcome, recording_url, ended_reason } = pickExtras(payload);

    // 1) ensure a sessions row exists
    const up1 = await sbUpsertSessionMinimal({ provider_session_id, started_at });
    if (!up1.ok) log("sessions upsert failed:", up1.status, up1.text);

    // 2) patch any details we confidently know
    const patch = {};
    if (ended_at) patch.ended_at = ended_at;
    if (summary) patch.summary = summary;
    if (recording_url) patch.recording_url = recording_url;
    if (ended_reason) patch.ended_reason = ended_reason;
    if (outcome) patch.outcome = outcome;

    // derive AHT when possible
    const aht = calcAHTSeconds(started_at, ended_at);
    if (Number.isFinite(aht)) patch.aht_seconds = aht;

    if (Object.keys(patch).length) {
      const up2 = await sbPatchSession(provider_session_id, patch);
      if (!up2.ok) log("sessions patch failed:", up2.status, up2.text);
    }

    if (DEBUG) log("Webhook handled:", { provider_session_id, started_at, ended_at, wrote: Object.keys(patch) });
    return { statusCode: 200, body: j({ ok: true }) };
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error" }) };
  }
};
