// frontend/netlify/functions/kb-moreton-search.js

export async function handler(event) {
  // Always return HTTP 200 to Vapi, even on “errors”
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: "",
      };
    }

    const body = safeJson(event.body);

    // Vapi MUST receive toolCallId echoed back
    const toolCallId =
      body?.toolCallId ||
      body?.tool_call_id ||
      body?.toolCall?.id ||
      body?.message?.toolCallId ||
      body?.message?.tool_call_id ||
      body?.call?.toolCallId ||
      body?.call?.tool_call_id ||
      null;

    // Vapi passes your parameters under different shapes depending on tool type
    const query =
      (body?.query ||
        body?.input?.query ||
        body?.arguments?.query ||
        body?.params?.query ||
        "").toString().trim();

    if (!toolCallId) {
      return vapiRespond("call_unknown", "ERROR: Missing toolCallId in request.");
    }

    if (!query) {
      return vapiRespond(toolCallId, "ERROR: Missing required field: query");
    }

    // Pilot KB in env var
    const kbText = (process.env.MORETON_BAY_KB_TEXT || "").toString();
    if (!kbText.trim()) {
      return vapiRespond(
        toolCallId,
        "ERROR: KB not configured. Netlify env var MORETON_BAY_KB_TEXT is empty."
      );
    }

    const hits = basicSearch(kbText, query, 5);

    if (!hits.length) {
      return vapiRespond(
        toolCallId,
        `NO_MATCH: No KB match found for "${query}".`
      );
    }

    // IMPORTANT: Vapi wants a SINGLE LINE string (no line breaks)
    const answer = hits
      .map((h, i) => `(${i + 1}) ${h.snippet}`)
      .join(" | ")
      .replace(/\s+/g, " ")
      .trim();

    return vapiRespond(toolCallId, answer);
  } catch (err) {
    // Still HTTP 200 with tool-shaped error
    const msg = (err?.message || "Unknown error").toString();
    return vapiRespond("call_unknown", `ERROR: ${msg}`);
  }
}

function vapiRespond(toolCallId, resultOrErrorString) {
  // MUST be HTTP 200
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({
      results: [
        {
          toolCallId,
          // Vapi requires string type
          result: String(resultOrErrorString).replace(/\n/g, " ").trim(),
        },
      ],
    }),
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function safeJson(str) {
  try {
    return str ? JSON.parse(str) : {};
  } catch {
    return {};
  }
}

/**
 * Simple keyword search: split KB into paragraphs, score hits, return top N.
 */
function basicSearch(kbText, query, limit = 5) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((t) => t.length >= 3);

  const blocks = kbText
    .split(/\n\s*\n/g)
    .map((b) => b.trim())
    .filter(Boolean);

  const scored = blocks
    .map((b) => {
      const lower = b.toLowerCase();
      let score = 0;
      for (const t of terms) score += countOccurrences(lower, t);
      return { score, text: b };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({
      score: x.score,
      snippet: shorten(x.text, 500),
    }));

  return scored;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    idx = haystack.indexOf(needle, idx);
    if (idx === -1) break;
    count++;
    idx += needle.length;
  }
  return count;
}

function shorten(s, max = 500) {
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max).trimEnd() + "…";
}
