// frontend/netlify/functions/kb-moreton-search.js

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method Not Allowed" });
    }

    const body = safeJson(event.body);
    const query = (body?.query || "").toString().trim();

    if (!query) {
      return json(400, { error: "Missing required field: query" });
    }

    // --- SIMPLE PILOT SEARCH ---
    // For pilot: read a local text file bundled in your repo OR store content in env var.
    // Option A: store KB text in an env var (recommended for fastest setup):
    const kbText = (process.env.MORETON_BAY_KB_TEXT || "").toString();

    if (!kbText) {
      return json(500, {
        error:
          "KB not configured. Set MORETON_BAY_KB_TEXT env var (paste your KB TXT content).",
      });
    }

    const results = basicSearch(kbText, query, 5);

    return json(200, {
      query,
      results,
      note:
        "Pilot KB search (keyword). Replace with Supabase vector search later without changing Vapi tool.",
    });
  } catch (err) {
    return json(500, { error: err?.message || "Unknown error" });
  }
}

function safeJson(str) {
  try {
    return str ? JSON.parse(str) : {};
  } catch {
    return {};
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(obj),
  };
}

/**
 * Very simple keyword search:
 * - split KB into paragraphs
 * - rank by number of query term hits
 * - return top N snippets
 */
function basicSearch(kbText, query, limit = 5) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const blocks = kbText
    .split(/\n\s*\n/g) // paragraphs
    .map((b) => b.trim())
    .filter(Boolean);

  const scored = blocks
    .map((b) => {
      const lower = b.toLowerCase();
      let score = 0;
      for (const t of terms) {
        const matches = lower.split(t).length - 1;
        score += matches;
      }
      return { score, text: b };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x, i) => ({
      rank: i + 1,
      score: x.score,
      snippet: shorten(x.text, 700),
    }));

  // If no matches, return empty array (assistant will handle)
  return scored;
}

function shorten(s, max = 700) {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}
