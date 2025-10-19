// netlify/functions/vapi-outbound-call.js
const VAPI_API_KEY = process.env.VAPI_API_KEY;  // add in Netlify env
const DEFAULT_ASSISTANT_ID = process.env.VAPI_DEFAULT_ASSISTANT_ID || null;

exports.handler = async (event) => {
  // CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: "",
    };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    if (!VAPI_API_KEY) {
      return { statusCode: 500, body: "Missing VAPI_API_KEY" };
    }

    const body = JSON.parse(event.body || "{}");
    const to = body.to || body.phoneNumber;
    const assistantId = body.assistantId || DEFAULT_ASSISTANT_ID;
    const metadata = body.metadata || {};

    if (!to) return { statusCode: 400, body: "Missing 'to' phone number (E.164)" };
    if (!assistantId) return { statusCode: 400, body: "Missing 'assistantId'" };

    // Minimal Vapi create-call request
    const res = await fetch("https://api.vapi.ai/calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VAPI_API_KEY}`,
      },
      body: JSON.stringify({
        assistantId,
        phoneNumber: to,
        metadata, // include clientId/promptVersion/etc if you want
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("Vapi outbound error:", res.status, text);
      return { statusCode: res.status, body: text };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: text,
    };
  } catch (err) {
    console.error("outbound-call fn error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
