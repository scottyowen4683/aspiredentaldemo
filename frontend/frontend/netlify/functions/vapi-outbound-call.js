// netlify/functions/vapi-outbound-call.js
const VAPI_BASE_URL = "https://api.vapi.ai";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { to, fromNumber, assistantId, context } = JSON.parse(event.body || "{}");

    if (!to || !fromNumber || !assistantId) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing to/fromNumber/assistantId" }) };
    }
    if (!/^\+61\d{9}$/.test(to)) {
      return { statusCode: 400, body: JSON.stringify({ message: "Only Australian numbers are allowed (E.164)." }) };
    }

    const payload = {
      assistantId,                 // OUTBOUND assistant id passed from frontend
      type: "outbound",
      phone: { to, from: fromNumber },
      metadata: { feature: "website-cta-outbound", ...(context || {}) },
    };

    const r = await fetch(`${VAPI_BASE_URL}/calls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`, // set in Netlify env
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) {
      return { statusCode: r.status, body: JSON.stringify({ message: `Vapi error: ${text}` }) };
    }

    return { statusCode: 202, body: text };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error triggering call." }) };
  }
};
