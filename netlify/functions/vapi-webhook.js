// netlify/functions/vapi-webhook.js
import crypto from "crypto";

/**
 * REQUIRED ENV in Netlify:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - VAPI_WEBHOOK_SECRET
 *
 * OPTIONAL (for diagnostics):
 * - DISABLE_SIGNATURE_CHECK = "1"  // temporarily skip signature verification
 * - DEBUG_LOG = "1"                // verbose logs to Netlify function console
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;
const DISABLE_SIGNATURE_CHECK = process.env.DISABLE_SIGNATURE_CHECK === "1";
const DEBUG = process.env.DEBUG_LOG === "1";

function log(...args) {
  if (DEBUG) console.log(...args);
}

/** Verify 'x-vapi-signature' = 'sha256=<hmac>' over the raw body */
function verifySignature(rawBody, signature) {
  if (DISABLE_SIGNATURE_CHECK) return true;
  if (!VAPI_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", VAPI_WEBHOOK_SECRET);
  hmac.update(rawBody, "utf8");
  const digest = `sha256=${hmac.digest("hex")}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature || ""));
  } catch {
    return false;
  }
}

/** Normalize Vapi payload → a row for 'calls' table */
function toRow(type, payload) {
  const data = payload?.data || payload;
  const call = data?.call || data;

  const call_id = call?.id || data?.id || null;
  const assistant_id = call?.assistantId || call?.assistant_id || null;
  const direction = call?.direction || call?.metadata?.direction || null;
  const from_number = call?.from?.phoneNumber || call?.from || call?.callerNumber || null;
  const to_number = call?.to?.phoneNumber || call?.to || call?.calleeNumber || null;

  const started_at = call?.startedAt || call?.createdAt || data?.createdAt || null;
  const ended_at = call?.endedAt || call?.completedAt || null;

  const status =
    call?.status || data?.status || (type === "call.ended" ? "ended" : "unknown");

  const duration_sec =
    ended_at && started_at
      ? Math.floor((new Date(ended_at) - new Date(started_at)) / 1000)
      : call?.duration ?? null;

  const transcript = Array.isArray(call?.transcript)
    ? call.transcript.map(t => t.text).join(" ")
    : call?.transcript ?? null;

  const top_questions = Array.isArray(call?.messages)
    ? call.messages
        .filter(m => m.role === "user" && typeof m.text === "string")
        .map(m => m.text)
        .slice(0, 5)
    : null;

  return {
    call_id,
    assistant_id,
    direction,
    from_number,
    to_number,
    status,
    started_at,
    ended_at,
    duration_sec,
    transcript,
    top_questions,             // jsonb
    raw: payload,              // jsonb (full payload for later analysis)
    last_event_type: type,
    updated_at: new Date().toISOString(),
  };
}

export const handler = async (event) => {
  // CORS / preflight (some webhook testers may send OPTIONS)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
      },
    };
  }

  // Simple GET ping so you can verify the function is deployed/reachable
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, msg: "vapi-webhook alive" }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event.body || "");

  const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"];
  const sigOk = verifySignature(rawBody, sig);
  if (!sigOk) {
    log("Signature verification failed.");
    return { statusCode: 401, body: JSON.stringify({ message: "Invalid signature" }) };
  }

  try {
    const payload = JSON.parse(rawBody);
    const { type } = payload || {};
    if (!type) {
      log("Bad payload (missing type):", rawBody);
      return { statusCode: 400, body: JSON.stringify({ message: "Bad payload" }) };
    }

    const row = toRow(type, payload);

    // DIAGNOSTIC LOGS
    log("Incoming event type:", type);
    log("Row to upsert:", JSON.stringify(row, null, 2));

    // Upsert via Supabase REST
    const url = `${SUPABASE_URL}/rest/v1/calls?on_conflict=call_id`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    });

    const text = await res.text();
    log("Supabase REST response:", res.status, text);

    if (!res.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "DB error", status: res.status, details: text }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error" }) };
  }
};
