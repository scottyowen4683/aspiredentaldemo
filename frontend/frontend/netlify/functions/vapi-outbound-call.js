// netlify/functions/vapi-outbound-call.js
const VAPI_BASE_URL = "https://api.vapi.ai";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { to, assistantId, context } = JSON.parse(event.body || "{}");

    if (!to || !assistantId) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing to/assistantId" }) };
    }

    // Vapi requires a Phone Number ID from your dashboard (not the E.164 number).
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
    if (!phoneNumberId) {
      return { statusCode: 500, body: JSON.stringify({ message: "Server missing VAPI_PHONE_NUMBER_ID" }) };
    }

    // Optional: basic AU format check
    if (!/^\+61\d{9}$/.test(to)) {
      return { statusCode: 400, body: JSON.stringify({ message: "Enter a valid Australian number (e.g. 0412 345 678)" }) };
    }

    // Payload expected by Vapi for outbound phone calls
    const payload = {
      assistantId,                    // your OUTBOUND assistant id
      phoneNumberId,                  // <-- THIS is the critical bit
      customer: { number: to },       // who to call
      // Optional: pass context/metadata
      metadata: { feature: "website-cta-outbound", ...(context || {}) },

      // Optional: tighten behavior (safe defaults)
      // assistantOverrides: {
      //   firstMessage: "Hi, it's Scott’s cloned AI voice from Aspire. You just requested a quick demo call.",
      //   maxDurationSeconds: 180,
      // }
    };

    const r = await fetch(`${VAPI_BASE_URL}/call/phone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) {
      // Bubble the Vapi error back to the UI for easy debugging
      return { statusCode: r.status, body: JSON.stringify({ message: `Vapi error: ${text}` }) };
    }

    return { statusCode: 201, body: text };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error triggering call." }) };
  }
};
