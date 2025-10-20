// /netlify/functions/vapi-outbound-call.js
// Outbound phone call via Vapi with correct nested schema.
// Keeps your existing env var names and behavior.

const VAPI_BASE_URL = "https://api.vapi.ai";

export const handler = async (event) => {
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, hint: "POST { to, assistantId } to place a call" }),
    };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { to, assistantId, context = {} } = JSON.parse(event.body || "{}");

    if (!to || !assistantId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Missing 'to' or 'assistantId'" }),
      };
    }

    // --- Env (unchanged names) ---
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
    const FROM_NUMBER = process.env.VITE_VAPI_FROM_NUMBER;
    const WEBHOOK_URL =
      process.env.VAPI_WEBHOOK_URL ||
      "https://aspireexecutive.ai/.netlify/functions/vapi-webhook";

    if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error:
            "Missing env: VAPI_API_KEY or VAPI_PHONE_NUMBER_ID",
        }),
      };
    }

    // Basic IP tag
    const ip =
      event.headers["x-forwarded-for"]?.split(",")[0] ||
      event.headers["client-ip"] ||
      "unknown";

    // IMPORTANT: Vapi expects phone fields nested under `phone`, and webhook under `server`.
    const body = {
      assistantId,                    // must be a UUID
      phone: {
        to,                           // e.g. +61XXXXXXXXX
        from: FROM_NUMBER || undefined, // optional, but keep if you have it
        phoneNumberId: VAPI_PHONE_NUMBER_ID
      },
      server: {
        url: WEBHOOK_URL              // ensures events hit your webhook
      },
      metadata: { ip, ...context }
    };

    const res = await fetch(`${VAPI_BASE_URL}/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("Vapi API error:", res.status, text);
      return {
        statusCode: 502,
        body: JSON.stringify({ ok: false, status: res.status, error: text }),
      };
    }

    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return { statusCode: 200, body: JSON.stringify({ ok: true, data }) };
  } catch (err) {
    console.error("Outbound call error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
