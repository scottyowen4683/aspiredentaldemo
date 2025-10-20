// netlify/functions/eval-runner.js
// Pingable function to (re)run evaluation for a given session_id.
// Usage: GET /.netlify/functions/eval-runner?id=<provider_session_id>

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EVAL_MODEL = process.env.EVAL_MODEL || "gpt-4o-mini";
const EVAL_DEFAULT_RUBRIC_ID = process.env.EVAL_DEFAULT_RUBRIC_ID;
const EVAL_MAX_CHARS = Number(process.env.EVAL_MAX_CHARS || 1800);

function nowISO() { return new Date().toISOString(); }

async function sfetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchRubricJSON(rubricId) {
  const rows = await sfetch(`/eval_rubrics?id=eq.${rubricId}&select=rubric_json&limit=1`);
  return rows?.[0]?.rubric_json || null;
}

async function callOpenAIForEval({ transcript, rubric }) {
  const system = `Evaluate this phone-call snippet with rubric: ${JSON.stringify(rubric)}.
Return JSON {overall_score, summary, suggestions:[{criterion,tip,impact}]}.`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EVAL_MODEL,
      temperature: 0.2,
      messages: [{ role: "system", content: system }, { role: "user", content: transcript.slice(-EVAL_MAX_CHARS) }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const data = await res.json();
  let parsed = {};
  try { parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}"); } catch {}
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.overall_score) || 0)));
  return {
    overall_score: score,
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 1000) : "",
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 8) : [],
  };
}

export const handler = async (event) => {
  try {
    const id = new URLSearchParams(event.queryStringParameters || {}).get("id");
    if (!id) {
      return { statusCode: 400, body: "Missing id query param (?id=...)" };
    }

    const arts = await sfetch(
      `/session_artifacts?session_id=eq.${id}&select=transcript_full&order=updated_at.desc&limit=1`
    );
    const transcript = arts?.[0]?.transcript_full || "";
    if (!transcript) {
      return { statusCode: 404, body: "No transcript for that session" };
    }

    const rubric = EVAL_DEFAULT_RUBRIC_ID ? await fetchRubricJSON(EVAL_DEFAULT_RUBRIC_ID) : null;
    if (!OPENAI_API_KEY || !rubric) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "Missing OPENAI key or rubric" }) };
    }

    const evalRes = await callOpenAIForEval({ transcript, rubric });
    const saved = await sfetch("/eval_runs", {
      method: "POST",
      body: JSON.stringify([
        {
          session_id: id,
          rubric_id: EVAL_DEFAULT_RUBRIC_ID,
          model: EVAL_MODEL,
          overall_score: evalRes.overall_score,
          summary: evalRes.summary,
          suggestions: evalRes.suggestions,
          status: "completed",
          started_at: nowISO(),
          completed_at: nowISO(),
        },
      ]),
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, saved }) };
  } catch (e) {
    return { statusCode: 500, body: `eval-runner error: ${e.message}` };
  }
};
