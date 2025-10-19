// /netlify/functions/vapi-outbound-call.js
// Triggers a Vapi outbound call using your assistant + fromNumber

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const {
      to,
      fromNumber = process.env.VITE_VAPI_FROM_NUMBER, // E.164 callerID
      assistantId,
      context = {},
    } = JSON.parse(event.body || "{}");

    if (!to || !assistantId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing to or assistantId" }),
      };
    }

    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
    if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Server missing VAPI credentials" }),
      };
    }

    // Optional simple abuse guard (per IP / day)
    const maxDaily = parseInt(process.env.MAX_DAILY_CALLS || "50", 10);
    const ip = event.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
    // You can wire a Redis/Supabase counter here if needed. Keeping minimal.

    const res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistantId,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        from: fromNumber,          // your purchased number
        to,                        // target number
        metadata: { ip, ...context }, // comes back in webhook
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { statusCode: 502, body: JSON.stringify({ message: text }) };
    }

    const data = await res.json();
    return { statusCode: 200, body: JSON.stringify({ ok: true, data }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error" }) };
  }
};
