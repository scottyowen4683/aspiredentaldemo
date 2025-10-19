// netlify/functions/vapi-webhook.js
import crypto from "crypto";

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

// Map a bunch of possible Vapi shapes → one row for `public.calls`
function toRow(payload) {
  // Vapi may send: { event, data: { phoneCall: {...} } }  OR  { type, data: { call: {...} } }
  const eventType = payload?.event || payload?.type || "unknown";
  const d = payload?.data || payload;
  const c = d?.phoneCall || d?.call || d; // tolerate variations

  // fields (tolerant)
  const call_id      = c?.id || d?.id || null;
  const assistant_id = c?.assistantId || c?.assistant_id || null;

  // numbers: Vapi uses customer.number for the callee (outbound)
  const to_number    = c?.customer?.number || c?.to?.phoneNumber || c?.to || null;
  const from_number  = c?.from?.phoneNumber || c?.from || null;

  // status: Vapi uses queued|ringing|inProgress|completed|failed, etc.
  const rawStatus    = c?.status || d?.status || null;
  const statusMap = {
    queued: "created",
    ringing: "in-progress",
    inProgress: "in-progress",
    completed: "ended",
    ended: "ended",
    failed: "failed",
    noAnswer: "failed",
    busy: "failed"
  };
  const status = statusMap[rawStatus] || rawStatus || (eventType.includes("ended") ? "ended" : "unknown");

  const createdAt = c?.createdAt || d?.createdAt || null;
  const startedAt = c?.startedAt || createdAt || null;
  const endedAt   = c?.endedAt || c?.completedAt || null;

  const duration_sec =
    endedAt && startedAt
      ? Math.floor((new Date(endedAt) - new Date(startedAt)) / 1000)
      : (typeof c?.duration === "number" ? c.duration : null);

  // transcript/messages (often not sent on the high-level call events)
  const transcript = Array.isArray(c?.transcript)
    ? c.transcript.map(t => t.text).join(" ")
    : c?.transcript ?? null;

  const top_questions = Array.isArray(c?.messages)
    ? c.messages.filter(m => m.role === "user" && typeof m.text === "string")
               .map(m => m.text)
               .slice(0, 5)
    : null;

  return {
    call_id,
    assistant_id,
    direction: c?.direction || c?.metadata?.direction || null,
    from_number,
    to_number,
    status,
    started_at: startedAt || null,
    ended_at: endedAt || null,
    duration_sec,
    transcript,
    top_questions,
    raw: payload,                 // keep everything for debugging
    last_event_type: eventType,   // what Vapi said this was
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

export const handler = async (event) => {
  // Diagnostics (GET)
  if (event.httpMethod === "GET") {
    const url = new URL(event.rawUrl || `http://x${event.path}`);
    const diag = url.searchParams.get("diag");
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

  try {
    const payload = JSON.parse(rawBody);
    const row = toRow(payload);

    // If no call_id, don’t insert junk — just log and 200
    if (!row.call_id) {
      log("Webhook payload missing call_id; skipping upsert. last_event_type=", row.last_event_type);
      log("Payload sample:", rawBody.slice(0, 1000));
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: "no call_id" }) };
    }

    log("Upserting call row:", JSON.stringify(row, null, 2));
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
