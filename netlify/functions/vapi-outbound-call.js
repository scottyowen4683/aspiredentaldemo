// netlify/functions/vapi-outbound-call.js
const VAPI_BASE_URL = "https://api.vapi.ai";

export const handler = async (event) => {
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, hint: "POST { to, assistantId } to place a call via Vapi" }),
    };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { to, assistantId, context = {} } = JSON.parse(event.body || "{}");
    if (!to || !assistantId) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Missing 'to' or 'assistantId'" }) };
    }

    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
    if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: "Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID" }),
      };
    }

    const ip =
      event.headers["x-forwarded-for"]?.split(",")[0] ||
      event.headers["client-ip"] ||
      "unknown";

    // IMPORTANT: Vapi expects this shape (no `from`, no `webhook`)
    const body = {
      type: "outboundPhoneCall",
      assistantId,                 // keep passing the UUID from your UI
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: { number: to },    // destination number here
      metadata: { ip, ...context },// anything you want returned in events
    };

    const resp = await fetch(`${VAPI_BASE_URL}/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const txt = await resp.text();
    if (!resp.ok) {
      console.error("Vapi API error:", resp.status, txt);
      return { statusCode: 400, body: JSON.stringify({ ok: false, status: resp.status, error: txt }) };
    }

    let data;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    return { statusCode: 200, body: JSON.stringify({ ok: true, data }) };
  } catch (err) {
    console.error("Outbound call error:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
