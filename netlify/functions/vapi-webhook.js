// netlify/functions/vapi-webhook.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function verifySignature(rawBody, signature) {
  if (!VAPI_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", VAPI_WEBHOOK_SECRET);
  hmac.update(rawBody, "utf8");
  const digest = `sha256=${hmac.digest("hex")}`;
  // Vapi typically sends 'sha256=...' in 'x-vapi-signature'
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature || ""));
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"];
  const rawBody = event.body || "";

  try {
    // If Netlify sent base64 body, convert it
    const bodyStr = event.isBase64Encoded ? Buffer.from(rawBody, "base64").toString("utf8") : rawBody;

    if (!verifySignature(bodyStr, sig)) {
      return { statusCode: 401, body: JSON.stringify({ message: "Invalid signature" }) };
    }

    const payload = JSON.parse(bodyStr);
    const { type, data } = payload || {};
    if (!type || !data) {
      return { statusCode: 400, body: JSON.stringify({ message: "Bad payload" }) };
    }

    // Normalize fields we'll store
    const call = data?.call || data; // some events nest under data.call
    const call_id = call?.id || data?.id;
    const assistant_id = call?.assistantId || call?.assistant_id;
    const direction = call?.direction || call?.metadata?.direction;
    const from_number = call?.from?.phoneNumber || call?.from || call?.callerNumber;
    const to_number = call?.to?.phoneNumber || call?.to || call?.calleeNumber;
    const status = call?.status || data?.status || (type === "call.ended" ? "ended" : "unknown");
    const started_at = call?.startedAt || call?.createdAt || data?.createdAt;
    const ended_at = call?.endedAt || call?.completedAt || null;
    const duration_sec = call?.duration || (ended_at && started_at
      ? Math.floor((new Date(ended_at) - new Date(started_at)) / 1000)
      : null);

    // Optional extras you said you wanted to capture:
    const transcript = Array.isArray(call?.transcript)
      ? call.transcript.map(t => t.text).join(" ")
      : call?.transcript || null;

    // naive “top questions” extraction from messages (adjust if you store separately)
    const top_questions = Array.isArray(call?.messages)
      ? call.messages
          .filter(m => m.role === "user" && typeof m.text === "string")
          .map(m => m.text)
          .slice(0, 5)
      : null;

    // Upsert
    const row = {
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
      top_questions, // JSON[] in table
      raw: payload,   // JSONB for full payload (great for debugging)
      last_event_type: type,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("calls")
      .upsert(row, { onConflict: "call_id" });

    if (error) {
      console.error("Supabase upsert error:", error);
      return { statusCode: 500, body: JSON.stringify({ message: "DB error", details: error.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("Webhook handler error:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error" }) };
  }
};
