// /netlify/functions/vapi-outbound-call.js
// Handles outbound calls through Vapi and ensures call event data
// returns to your webhook for transcript + scoring + dashboard logging.

const VAPI_BASE_URL = "https://api.vapi.ai";

export const handler = async (event) => {
  // ✅ Allow browser GET for quick health-check
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        hint: "POST { to, assistantId } to place a call via Vapi"
      }),
    };
  }

  // Restrict all other methods to POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // Parse body from front end
    const { to, assistantId, context = {} } = JSON.parse(event.body || "{}");

    if (!to || !assistantId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing 'to' or 'assistantId'" }),
      };
    }

    // --- Load environment values ---
    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
    const FROM_NUMBER =
      process.env.VITE_VAPI_FROM_NUMBER || process.env.VAPI_FROM_NUMBER;
    const WEBHOOK_URL =
      process.env.VAPI_WEBHOOK_URL ||
      "https://aspireexecutive.ai/.netlify/functions/vapi-webhook";

    if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message:
            "Server missing required Vapi environment variables (VAPI_API_KEY or VAPI_PHONE_NUMBER_ID).",
        }),
      };
    }

    // --- Optional: basic call limit / IP metadata ---
    const ip =
      event.headers["x-forwarded-for"]?.split(",")[0] ||
      event.headers["client-ip"] ||
      "unknown";

    // --- Compose request body for Vapi API ---
    const body = {
      assistantId,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      from: FROM_NUMBER,
      to,
      webhook: WEBHOOK_URL, // 👈 ensures call events come back to your webhook
      metadata: { ip, ...context },
    };

    // --- Make request to Vapi ---
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
        body: JSON.stringify({
          ok: false,
          status: res.status,
          error: text,
        }),
      };
    }

    // --- Parse success response ---
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    console.log("✅ Outbound call triggered:", data);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, data }),
    };
  } catch (err) {
    console.error("❌ Outbound call error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Server error during outbound call.",
        error: err.message,
      }),
    };
  }
};
