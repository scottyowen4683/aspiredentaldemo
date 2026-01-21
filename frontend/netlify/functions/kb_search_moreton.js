import fs from "fs";
import path from "path";

function normalise(s) {
  return (s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s@().-]/g, "")
    .trim();
}

function extractDivisionNumber(query) {
  const q = (query || "").toLowerCase();
  // matches: "division 3", "divison 3", "div 3", "division:3"
  const m = q.match(/\bdiv(?:ision|ison)?\s*[:\-]?\s*(\d{1,2})\b/);
  if (m && m[1]) return Number(m[1]);
  return null;
}

function getLines(text) {
  return (text || "").split(/\r?\n/).map((l) => l.trim());
}

function buildDivisionIndex(lines) {
  // Creates a map: divisionNumber -> array of lines that mention that division
  const map = new Map();
  for (const line of lines) {
    const m = line.match(/\bdivision\s*(\d{1,2})\b/i);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (!map.has(n)) map.set(n, []);
      map.get(n).push(line);
    }
  }
  return map;
}

function bestGeneralMatch(lines, query) {
  const q = normalise(query);
  if (!q) return null;

  const qTerms = q.split(" ").filter(Boolean);

  let best = { score: 0, line: null };
  for (const line of lines) {
    const nl = normalise(line);
    if (!nl) continue;

    let score = 0;
    for (const t of qTerms) {
      if (t.length <= 2) continue;
      if (nl.includes(t)) score += 1;
    }

    // small boost if line contains exact query phrase
    if (nl.includes(q)) score += 3;

    if (score > best.score) best = { score, line };
  }

  return best.score > 0 ? best.line : null;
}

export async function handler(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const query = body?.query || body?.input || "";

    const kbPath = path.join(process.cwd(), "netlify", "functions", "kb", "moreton_kb.txt");

    if (!fs.existsSync(kbPath)) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reply:
            "KB file not found on server. Add it at: frontend/netlify/functions/kb/moreton_kb.txt",
        }),
      };
    }

    const kb = fs.readFileSync(kbPath, "utf8");
    const lines = getLines(kb).filter(Boolean);

    // 1) If the query is asking for a specific division, return ONLY that division block/line(s).
    const div = extractDivisionNumber(query);
    if (div !== null) {
      const divIndex = buildDivisionIndex(lines);

      // direct hits
      const hits = divIndex.get(div) || [];

      // Also scan for "Division X:" style inside larger lines
      // and return the sentence/segment that contains the division.
      const inlineHits = [];
      const rx = new RegExp(`\\bDivision\\s*${div}\\b[^|.\\n]*`, "gi");
      for (const raw of lines) {
        const m = raw.match(rx);
        if (m && m.length) inlineHits.push(...m.map((x) => x.trim()));
      }

      const combined = [...new Set([...hits, ...inlineHits])].filter(Boolean);

      if (combined.length) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reply: combined.slice(0, 6).join(" | "),
          }),
        };
      }

      // if no match found for that division, say so clearly
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reply: `I couldn't find Division ${div} in the Moreton Bay KB content currently loaded.`,
        }),
      };
    }

    // 2) Otherwise: best general match
    const best = bestGeneralMatch(lines, query);
    if (best) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: best }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reply:
          "I couldn't find that in the Moreton Bay KB content currently loaded. Try rephrasing the question or ask about a specific service/topic.",
      }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reply: `Tool error: ${err?.message || "Unknown error"}`,
      }),
    };
  }
}
