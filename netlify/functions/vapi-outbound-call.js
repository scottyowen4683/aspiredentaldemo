// /netlify/functions/vapi-outbound-call.js
// Outbound Vapi call with CORS + health check (Netlify Functions style)

const VAPI_BASE_URL = "https://api.vapi.ai";

// --- tiny helpers ---
const CORS = {
  "access-control-allow-origin": "*",                 // or your domain
  "access-control-allow-methods": "POST,OPTIONS,GET",
  "access-control-allow-headers": "content-type,authorization",
};
const json = (statusCode, obj, extra = {}) => ({
  statusCode,
  headers: { "content-type": "application/json", ...CORS, ...extra },
  body: JSON.stringify(obj),
});
const text = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { ...CORS, ...extra },
  body,
});
const safeJson = (s) => {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
};

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") return text(204, "");

  // Health check in browser
  if (event.httpMethod === "GET") {
    return json(200, { ok: true, hint: "POST { to, assistantId } to place a call via Vapi" });
  }

  if (event.httpMethod !== "POST") {
    return text(405, "Method Not Allowed");
  }

  try {
    const { to, assistantId, context = {} } = safeJson(event.body);
    if (!to || !assistantId) {
      return json(400, { ok: false, message: "Missing 'to' or 'assistantId'" });
    }

    // --- Load environment values (no renames) ---
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
    const FROM_NUMBER = process.env.VITE_VAPI_FROM_NUMBER;
    const WEBHOOK_URL =
      process.env.VAPI_WEBHOOK_URL ||
      `https://${event.headers.host}/.netlify/functions/vapi-webhook`; // safe default

    if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
      return json(500, {
        ok: false,
        message:
          "Missing Vapi envs: VAPI_API_KEY or VAPI_PHONE_NUMBER_ID.",
      });
    }

    // Optional: client IP/meta
    const ip =
      event.headers["x-forwarded-for"]?.split(",")[0] ||
      event.headers["client-ip"] ||
      "unknown";

    // --- Compose Vapi request ---
    const body = {
      assistantId,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      from: FROM_NUMBER,
      to,
      webhook: WEBHOOK_URL, // ensure events hit your webhook
      metadata: { ip, ...context },
    };

    const res = await fetch(`${VAPI_BASE_URL}/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const textBody = await res.text();
    if (!res.ok) {
      console.error("Vapi API error:", res.status, textBody);
      return json(502, { ok: false, status: res.status, error: textBody });
    }

    let data;
    try { data = JSON.parse(textBody); } catch { data = { raw: textBody }; }
    return json(200, { ok: true, data });
  } catch (err) {
    console.error("Outbound call error:", err);
    return json(500, { ok: false, message: "Server error during outbound call.", error: err.message });
  }
};
