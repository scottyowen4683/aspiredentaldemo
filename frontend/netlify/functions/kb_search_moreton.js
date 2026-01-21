// frontend/netlify/functions/kb_search_moreton.js
const fs = require("fs");
const path = require("path");

function json(res, statusCode, bodyObj) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(bodyObj));
}

function safeSingleLine(s) {
  return String(s || "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractToolCall(body) {
  // Vapi commonly sends tool calls under message.toolCalls or message.toolCallList (varies)
  const msg = body?.message || body;

  const toolCalls =
    msg?.toolCalls ||
    msg?.toolCallList ||
    msg?.tool_calls ||
    msg?.toolCall?.toolCalls ||
    [];

  const first = Array.isArray(toolCalls) ? toolCalls[0] : null;

  // Sometimes Vapi sends one tool call directly
  const toolCallId =
    first?.id ||
    first?.toolCallId ||
    msg?.toolCallId ||
    body?.toolCallId ||
    null;

  // Arguments often come as a JSON string in function.arguments
  let query =
    body?.query ||
    msg?.query ||
    null;

  if (!query) {
    const argStr =
      first?.function?.arguments ||
      first?.function?.args ||
      first?.arguments ||
      null;

    if (typeof argStr === "string" && argStr.trim()) {
      try {
        const parsed = JSON.parse(argStr);
        query = parsed?.query || parsed?.q || parsed?.text || null;
      } catch (e) {
        // If it's not JSON, treat as raw text
        query = argStr;
      }
    } else if (typeof argStr === "object" && argStr) {
      query = argStr?.query || argStr?.q || argStr?.text || null;
    }
  }

  return {
    toolCallId,
    query: safeSingleLine(query || ""),
  };
}

function loadKbText() {
  // Put your KB text file here:
  // frontend/netlify/functions/kb/moreton_kb.txt
  const kbPath = path.join(__dirname, "kb", "moreton_kb.txt");
  if (!fs.existsSync(kbPath)) return null;
  return fs.readFileSync(kbPath, "utf8");
}

function searchKb(kbText, query) {
  if (!kbText || !query) return null;

  // Basic, fast “good enough” search for a pilot:
  // - Find lines containing ALL keywords (ignoring tiny words)
  // - Return top matches + surrounding context
  const keywords = query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter((w) => w.length >= 3);

  if (keywords.length === 0) return null;

  const lines = kbText.split(/\r?\n/);

  // Score lines by keyword hits
  const scored = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const low = l.toLowerCase();

    let hits = 0;
    for (const k of keywords) {
      if (low.includes(k)) hits++;
    }

    // Require at least half the keywords to match (tweakable)
    if (hits >= Math.ceil(keywords.length / 2)) {
      scored.push({ i, hits, l });
    }
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.hits - a.hits);

  // Build a compact answer with small context window
  const top = scored.slice(0, 3).map(({ i }) => {
    const start = Math.max(0, i - 1);
    const end = Math.min(lines.length - 1, i + 2);
    const chunk = lines.slice(start, end + 1).join(" | ");
    return chunk;
  });

  return safeSingleLine(top.join(" || "));
}

exports.handler = async (event, context, callback) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};

    const { toolCallId, query } = extractToolCall(body);

    // IMPORTANT: If toolCallId is missing, Vapi can’t map the response.
    // We still return something to help you debug.
    const effectiveToolCallId = toolCallId || "call_missing_toolCallId";

    const kbText = loadKbText();
    if (!kbText) {
      return callback(
        null,
        {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            results: [
              {
                toolCallId: effectiveToolCallId,
                result:
                  "KB file not found on server. Add it at: frontend/netlify/functions/kb/moreton_kb.txt",
              },
            ],
          }),
        }
      );
    }

    const found = searchKb(kbText, query);

    const result = found
      ? found
      : `No match in KB for: ${safeSingleLine(query)}. Try a different keyword.`;

    return callback(
      null,
      {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: [
            {
              toolCallId: effectiveToolCallId,
              result,
            },
          ],
        }),
      }
    );
  } catch (err) {
    // Must still return Vapi format if possible
    const msg = safeSingleLine(err?.message || "Unknown error");
    return callback(
      null,
      {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: [
            {
              toolCallId: "call_error",
              result: `Tool error: ${msg}`,
            },
          ],
        }),
      }
    );
  }
};
