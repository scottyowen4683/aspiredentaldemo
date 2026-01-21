// frontend/netlify/functions/kb_search_moreton.js
// Netlify Function (CommonJS) - returns Vapi Custom Tool envelope: { results: [{ toolCallId, result|error }] }

const fs = require("fs");
const path = require("path");

let KB_TEXT = null;

function loadKb() {
  if (KB_TEXT) return KB_TEXT;
  const kbPath = path.join(__dirname, "..", "kb", "moreton_bay_kb.txt");
  KB_TEXT = fs.readFileSync(kbPath, "utf8");
  return KB_TEXT;
}

function normalise(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bestSnippet(query, kbText) {
  const q = normalise(query);
  if (!q) return null;

  // Split into chunks on blank lines (simple + effective for txt KBs)
  const chunks = kbText
    .split(/\n\s*\n+/g)
    .map((c) => c.trim())
    .filter(Boolean);

  const qWords = q.split(" ").filter((w) => w.length > 2);

  let best = null;
  let bestScore = 0;

  for (const chunk of chunks) {
    const hay = normalise(chunk);
    if (!hay) continue;

    let score = 0;

    // Keyword scoring
    for (const w of qWords) {
      if (hay.includes(w)) score += 2;
    }

    // Bonus for exact phrase-ish match (first 40 chars)
    if (hay.includes(q)) score += 6;

    // Bonus for councillor / division style queries
    if (q.includes("division") && hay.includes("division")) score += 3;
    if (q.includes("councillor") && hay.includes("councillor")) score += 3;

    if (score > bestScore) {
      bestScore = score;
      best = chunk;
    }
  }

  if (!best || bestScore < 3) return null;

  // Keep the reply short and single-line (important for Vapi tool results)
  const trimmed = best.length > 900 ? best.slice(0, 900) + "…" : best;
  return trimmed.replace(/\s*\n+\s*/g, " ").trim();
}

exports.handler = async (event) => {
  // LOG EVERYTHING ONCE so you can see what Vapi is sending
  console.log("kb_search_moreton RAW event.body:", event.body);

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    // If body isn't JSON, still return Vapi envelope with error
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        results: [
          {
            toolCallId: "unknown",
            error: "Request body was not valid JSON",
          },
        ],
      }),
    };
  }

  // Vapi typically sends toolCallId + query, but we handle multiple shapes
  const toolCallId =
    body.toolCallId ||
    body.tool_call_id ||
    body?.toolCall?.id ||
    body?.tool_call?.id ||
    body?.id ||
    body?.callId ||
    body?.call_id ||
    // some platforms nest it:
    body?.tool?.toolCallId ||
    body?.tool?.id;

  const query =
    body.query ||
    body.q ||
    body.search ||
    body?.arguments?.query ||
    body?.input?.query ||
    "";

  if (!toolCallId) {
    console.log("Missing toolCallId. Parsed body:", body);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        results: [
          {
            toolCallId: "missing_toolCallId",
            error:
              "Missing toolCallId in request. Vapi requires it to match the tool call.",
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

  try {
    const kbText = loadKb();
    const snippet = bestSnippet(query, kbText);

    const result = snippet
      ? snippet
      : "No match found in the Moreton Bay knowledge base for that query.";

    // MUST be single-line string
    const singleLine = String(result).replace(/\s*\n+\s*/g, " ").trim();

    console.log("Returning tool result for", toolCallId);

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
    const msg = String(err?.message || err || "Unknown error")
      .replace(/\s*\n+\s*/g, " ")
      .trim();

    console.log("Tool error:", msg);

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
};
