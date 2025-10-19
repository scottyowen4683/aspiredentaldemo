// netlify/functions/vapi-webhook.js
import crypto from "crypto";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;
const DISABLE_SIGNATURE_CHECK = process.env.DISABLE_SIGNATURE_CHECK === "1";
const DEBUG = process.env.DEBUG_LOG === "1";

function log(...args) { if (DEBUG) console.log(...args); }

function verifySignature(rawBody, signature) {
  if (DISABLE_SIGNATURE_CHECK) return true;
  if (!VAPI_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", VAPI_WEBHOOK_SECRET);
  hmac.update(rawBody, "utf8");
  const digest = `sha256=${hmac.digest("hex")}`;
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature || "")); }
  catch { return false; }
}

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
  const status = call?.status || data?.status || (type === "call.ended" ? "ended" : "unknown");
  const duration_sec = ended_at && started_at
    ? Math.floor((new Date(ended_at) - new Date(started_at)) / 1000)
    : call?.duration ?? null;
  const transcript = Array.isArray(call?.transcript)
    ? call.transcript.map(t => t.text).join(" ")
    : call?.transcript ?? null;
  const top_questions = Array.isArray(call?.messages)
    ? call.messages.filter(m => m.role === "user" && typeof m.text === "string")
        .map(m => m.text).slice(0, 5)
    : null;

  return {
    call_id, assistant_id, direction, from_number, to_number, status,
    started_at, ended_at, duration_sec, transcript, top_questions,
    raw: payload, last_event_type: type, updated_at: new Date().toISOString(),
  };
}

async function supabaseUpsert(row) {
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
  return { ok: res.ok, status: res.status, text };
}

export const handler = async (event) => {
  try {
    // --- Diagnostics via GET (browser only) ---
    if (event.httpMethod === "GET") {
      const url = new URL(event.rawUrl || `http://x${event.path}${event.queryStringParameters ? "?" : ""}`);
      const diag = (event.queryStringParameters && event.queryStringParameters.diag) || url.searchParams.get("diag");

      if (diag === "env") {
        // Show which envs are present (no secrets leaked)
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
              SUPABASE_URL_value_hint: SUPABASE_URL ? SUPABASE_URL.replace(/^https?:\/\//, "").replace(/(\w)/g, (m, c, i) => i < 6 ? c : (i < 10 ? "*" : c)) : null
            }
          }),
        };
      }

      if (diag === "write") {
        // Write a test row without needing a POST tool
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
        const result = await supabaseUpsert(row);
        return {
          statusCode: result.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ok: result.ok, status: result.status, resp: result.text, inserted_call_id: row.call_id }),
        };
      }

      // Default GET ping
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, msg: "vapi-webhook alive" }),
      };
    }

    // --- Webhook handling (POST) ---
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"];
    const sigOk = verifySignature(rawBody, sig);
    if (!sigOk) {
      return { statusCode: 401, body: JSON.stringify({ message: "Invalid signature" }) };
    }

    const payload = JSON.parse(rawBody);
    const { type } = payload || {};
    if (!type) return { statusCode: 400, body: JSON.stringify({ message: "Bad payload" }) };

    const row = toRow(type, payload);
    const result = await supabaseUpsert(row);
    if (!result.ok) {
      return { statusCode: 500, body: JSON.stringify({ message: "DB error", status: result.status, details: result.text }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error" }) };
  }
};
