// netlify/functions/vapi-chat.js

exports.handler = async (event) => {
  // Basic CORS (safe for your own site)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { assistantId, input, previousChatId } = body || {};

    if (!assistantId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing assistantId" }),
      };
    }

    if (!input || typeof input !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing input" }),
      };
    }

    const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;

    if (!VAPI_PRIVATE_KEY) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing VAPI_PRIVATE_KEY on server" }),
      };
    }

    // Vapi create chat: requires assistantId/assistant/sessionId/previousChatId (we use assistantId)
    const payload = {
      assistantId,
      input,
      ...(previousChatId ? { previousChatId } : {}),
    };

    const r = await fetch("https://api.vapi.ai/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_PRIVATE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!r.ok) {
      // Bubble up Vapi’s error so the UI can show the real reason
      return {
        statusCode: r.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            data?.error ||
            data?.message ||
            `Vapi request failed (${r.status})`,
          details: data,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error("[vapi-chat] error", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err?.message || "Server error" }),
    };
  }
};
