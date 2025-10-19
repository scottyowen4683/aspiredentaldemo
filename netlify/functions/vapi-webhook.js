// netlify/functions/vapi-webhook.js (CommonJS)
const crypto = require("crypto");

/**
 * Env (Netlify):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - VAPI_WEBHOOK_SECRET          (set later; keep DISABLE_SIGNATURE_CHECK=1 while testing)
 * - DISABLE_SIGNATURE_CHECK=1    (while testing)
 * - DEBUG_LOG=1                  (optional)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;
const DISABLE_SIGNATURE_CHECK = process.env.DISABLE_SIGNATURE_CHECK === "1";
const DEBUG = process.env.DEBUG_LOG === "1";
const log = (...a) => { if (DEBUG) console.log(...a); };

function verifySignature(rawBody, signature) {
  if (DISABLE_SIGNATURE_CHECK) return true;
  if (!VAPI_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", VAPI_WEBHOOK_SECRET);
  hmac.update(rawBody, "utf8");
  const digest = `sha256=${hmac.digest("hex")}`;
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature || "")); }
  catch { return false; }
}

function mapStatus(s) {
  if (!s) return null;
  const m = {
    queued: "created",
    created: "created",
    ringing: "in-progress",
    "in-progress": "in-progress",
    inprogress: "in-progress",
    completed: "ended",
    ended: "ended",
    failed: "failed",
    busy: "failed",
    "no-answer": "failed",
    noanswer: "failed",
    canceled: "failed",
  };
  return m[String(s).toLowerCase()] || s;
}

/** Build a row for the `calls` table from many possible Vapi shapes */
function toRow(payload) {
  const eventType = payload?.event || payload?.type || payload?.message?.type || "unknown";
  const data = payload?.data || payload;

  // Main call objects (some orgs use phoneCall, others call)
  const pc = data?.phoneCall || data?.call;

  // Message events
  const msg = payload?.message;

  // call_id from any known place
  const call_id =
    pc?.id ||
    data?.id ||
    msg?.callId ||
    msg?.phoneCallId ||
    null;

  // Numbers (if present)
  const to_number =
    pc?.customer?.number || pc?.to?.phoneNumber || pc?.to || null;
  const from_number =
    pc?.from?.phoneNumber || pc?.from || null;

  // Timestamps
  const createdAt = pc?.createdAt || data?.createdAt || null;
  const startedAt = pc?.startedAt || createdAt || (msg?.timestamp ? new Date(msg.timestamp).toISOString() : null);
  const endedAt   = pc?.endedAt || pc?.completedAt || null;

  // Status
  const rawStatus = pc?.status || data?.status || msg?.status || null;
  const status = mapStatus(rawStatus) || (String(eventType).includes("ended") ? "ended" : "unknown");

  // Duration
  const duration_sec =
    endedAt && startedAt
      ? Math.floor((new Date(endedAt) - new Date(startedAt)) / 1000)
      : (typeof pc?.duration === "number" ? pc.duration : null);

  // Optional transcript/questions (usually not on message events)
  const transcript = Array.isArray(pc?.transcript)
    ? pc.transcript.map(t => t.text).join(" ")
    : pc?.transcript ?? null;

  const top_questions = Array.isArray(pc?.messages)
    ? pc.messages.filter(m => m.role === "user" && typeof m.text === "string")
        .map(m => m.text).slice(0, 5)
    : null;

  return {
    call_id,
    assistant_id: pc?.assistantId || pc?.assistant_id || null,
    direction: pc?.direction || pc?.metadata?.direction || null,
    from_number,
    to_number,
    status,
    started_at: startedAt || null,
    ended_at: endedAt || null,
    duration_sec,
    transcript,
    top_questions,
    raw: payload,
    last_event_type: eventType,
    updated_at: new Date().toISOString(),
  };
}

async function supabaseUpsert(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/calls?on_conflict=call_id`, {
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

exports.handler = async (event) => {
  try {
    // Diagnostics
    if (event.httpMethod === "GET") {
      const diag = event.queryStringParameters?.diag;
      if (diag === "env") {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: true,
            env: {
              SUPABASE_URL_present: Boolean(SUPABASE_URL),
              SERVICE_ROLE_present: Boolean(SERVICE_KEY),
              WEBHOOK_SECRET_present: Boolean(VAPI_WEBHOOK_SECRET),
              DISABLE_SIGNATURE_CHECK,
              DEBUG,
            },
          }),
        };
      }
      if (diag === "write") {
        const row = {
          call_id: `browser-diag-${Date.now()}`,
          assistant_id: "diag",
          direction: "outbound",
          from_number: "+61111111111",
          to_number: "+62222222222",
          status: "created",
          started_at: new Date().toISOString(),
          transcript: null,
          top_questions: null,
          raw: { source: "diag-write" },
          last_event_type: "diag",
          updated_at: new Date().toISOString(),
        };
        const r = await supabaseUpsert(row);
        return {
          statusCode: r.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ok: r.ok, status: r.status, resp: r.text, id: row.call_id }),
        };
      }
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, msg: "vapi-webhook alive" }) };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"];
    if (!verifySignature(rawBody, sig)) {
      return { statusCode: 401, body: JSON.stringify({ message: "Invalid signature" }) };
    }

    const payload = JSON.parse(rawBody);
    const row = toRow(payload);

    if (!row.call_id) {
      log("Webhook payload missing call_id; skipping upsert. last_event_type=", row.last_event_type);
      // Log a small sample to help debug shapes (avoid huge logs)
      log("Payload sample:", rawBody.slice(0, 800));
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: "no call_id" }) };
    }

    log("Upserting call row:", JSON.stringify(row));
    const r = await supabaseUpsert(row);
    if (!r.ok) {
      log("Supabase upsert failed:", r.status, r.text);
      return { statusCode: 500, body: JSON.stringify({ message: "DB error", status: r.status, details: r.text }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error" }) };
  }
};
