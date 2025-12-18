exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { assistantId, input, previousChatId } = body;

    if (!assistantId || !input) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing assistantId or input" }),
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

    const data = await r.json();

    return {
      statusCode: r.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Server error" }),
    };
  }
};
