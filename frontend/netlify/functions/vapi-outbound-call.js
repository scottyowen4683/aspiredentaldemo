const VAPI_BASE_URL = "https://api.vapi.ai";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { to, assistantId, context } = JSON.parse(event.body || "{}");

    if (!to || !assistantId) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing to/assistantId" }) };
    }

    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
    if (!phoneNumberId) {
      return { statusCode: 500, body: JSON.stringify({ message: "Server missing VAPI_PHONE_NUMBER_ID" }) };
    }

    if (!/^\+61\d{9}$/.test(to)) {
      return { statusCode: 400, body: JSON.stringify({ message: "Enter a valid Australian number (e.g. 0412 345 678)" }) };
    }

    const payload = {
      assistantId,
      phoneNumberId,            // Vapi Phone Number **ID**, not E.164
      customer: { number: to },
      metadata: { feature: "website-cta-outbound", ...(context || {}) },
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
      return { statusCode: r.status, body: JSON.stringify({ message: `Vapi error: ${text}` }) };
    }

    return { statusCode: 201, body: text };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error triggering call." }) };
  }
};
