// frontend/netlify/functions/kb_search_moreton.js
// Vapi Custom Tool responder: MUST return { results: [{ toolCallId, result|error }] } with HTTP 200

export async function handler(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};

    // Vapi MUST get its toolCallId echoed back exactly.
    // Different runtimes sometimes nest it differently; cover common shapes.
    const toolCallId =
      body.toolCallId ||
      body.tool_call_id ||
      body?.tool?.toolCallId ||
      body?.tool?.id ||
      body?.id ||
      body?.call?.id ||
      // sometimes arguments come nested, while tool call lives elsewhere
      (Array.isArray(body?.toolCalls) && body.toolCalls[0]?.id) ||
      (Array.isArray(body?.tool_calls) && body.tool_calls[0]?.id);

    const query =
      body.query ||
      body.q ||
      body.search ||
      body?.arguments?.query ||
      body?.input?.query ||
      "";

    // If toolCallId is missing, Vapi can't match the response to the call.
    // Still return HTTP 200 with an error string, but note: Vapi may still discard without an ID.
    if (!toolCallId) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: [
            {
              toolCallId: "missing_toolCallId",
              error:
                "Missing toolCallId in request payload. Vapi requires toolCallId to match tool call.",
            },
          ],
        }),
      };
    }

    if (!query || String(query).trim().length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: [
            {
              toolCallId,
              error: "Missing required parameter: query",
            },
          ],
        }),
      };
    }

    // ---- Your KB lookup goes here ----
    // For now this is a placeholder that proves the tool plumbing works.
    // Replace `answer` with your actual KB retrieval output.
    const answer = `KB lookup placeholder: I received your query "${String(
      query
    ).trim()}".`;

    // Vapi requires SINGLE LINE strings. Remove line breaks.
    const singleLine = String(answer).replace(/\s*\n+\s*/g, " ").trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        results: [
          {
            toolCallId,
            result: singleLine,
          },
        ],
      }),
    };
  } catch (err) {
    // IMPORTANT: still HTTP 200, error must be a string
    const msg = String(err?.message || err || "Unknown error").replace(
      /\s*\n+\s*/g,
      " "
    );

    // attempt to recover toolCallId if parse failed
    let toolCallId = "unknown";
    try {
      const body = event.body ? JSON.parse(event.body) : {};
      toolCallId =
        body.toolCallId ||
        body.tool_call_id ||
        body?.tool?.toolCallId ||
        body?.tool?.id ||
        body?.id ||
        "unknown";
    } catch {}

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        results: [
          {
            toolCallId,
            error: msg,
          },
        ],
      }),
    };
  }
}
