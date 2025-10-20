// /netlify/functions/vapi-webhook.js
// Minimal diagnostic version: just log every payload into Supabase.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const handler = async (event) => {
  try {
    // Write the raw webhook payload into Supabase
    const res = await fetch(`${SUPABASE_URL}/rest/v1/webhook_logs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([
        {
          raw_headers: event.headers || {},
          raw_body: event.body || "",
        },
      ]),
    });

    const text = await res.text();
    console.log("Webhook diagnostic insert result:", text);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("Diagnostic webhook error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
