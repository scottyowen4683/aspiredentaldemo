// netlify/functions/eval-runner.js
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EVAL_MODEL = process.env.EVAL_MODEL || "gpt-4o-mini";
const BATCH_LIMIT = parseInt(process.env.EVAL_BATCH_LIMIT || "5", 10);

const jsonHeaders = {
  "Content-Type": "application/json",
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

// ---------- Supabase helpers ----------
async function sbSelect(table, qs) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, { headers: jsonHeaders });
  if (!res.ok) throw new Error(`Select ${table} failed: ${res.status} ${await res.text()}`);
  return res.json();
}
async function sbSelectOne(table, qs) {
  const data = await sbSelect(table, `${qs}&limit=1`);
  return data?.[0] || null;
}
async function sbUpdate(table, qs, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update ${table} failed: ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({}));
}
async function sbInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!res.ok) throw new Error(`Insert ${table} failed: ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({}));
}
const eq = (v) => `eq.${v}`;
const is = (v) => `is.${v}`;

// ---------- OpenAI helper ----------
async function callOpenAI(system, user) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: EVAL_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(text); } catch { return { parse_error: text }; }
}

// ---------- Build eval prompt ----------
function buildPrompt({ transcript, rubric, weights, checklist, promptText }) {
  const criteria = Object.keys(weights);
  const weightsList = criteria.map(k => `${k}: ${weights[k]}`).join(", ");

  const sys = `You are an expert QA evaluator for voice/chat AI agents. Score objectively from 0 to 100 for each criterion based on transcript evidence. Be strict but fair. Use the provided weights to compute overall_score = sum(weight_i * score_i) * 100 (weights sum to 1). Return strict JSON.`;

  const user = `
RUBRIC NAME: ${rubric.name} (${rubric.version})
WEIGHTS: ${weightsList}
CHECKLIST (guidance):
${criteria.map(k => `- ${k}: ${checklist?.[k] || ""}`).join("\n")}

AGENT PROMPT / POLICY (if provided, use it to judge adherence):
${promptText ? promptText : "(none provided)"}

TRANSCRIPT (chronological):
${transcript || "(empty)"}

Return JSON:
{
  "scores": { "${criteria.join(`": 0, "`)}": 0 },
  "overall_score": 0,
  "summary": "one-paragraph overview of performance",
  "suggestions": [
    {"criterion": "accuracy", "tip": "Keep rates aligned with the July 2024 schedule...", "impact": "high"},
    {"criterion": "tone", "tip": "Acknowledge resident concern before giving policy.", "impact": "medium"}
  ]
}
Rules:
- scores are integers 0..100
- overall_score is 0..100 (weighted by WEIGHTS, not a plain average)
- suggestions: 3–6 items, each actionable and specific
`;

  return { sys, user };
}

// ---------- Core evaluator ----------
async function evaluateRun(evalRow) {
  // Load transcript
  const transcriptRow = await sbSelectOne("session_transcripts", `session_id=${eq(evalRow.session_id)}`);
  const transcript = transcriptRow?.transcript || "";

  // Load rubric
  const rubric = await sbSelectOne("eval_rubrics", `id=${eq(evalRow.rubric_id)}`);
  if (!rubric) throw new Error("Rubric not found");
  const weights = rubric.weights || {};
  const checklist = rubric.checklist || {};

  // --- Load assistant prompt text dynamically ---
  let promptText = "";
  if (evalRow.session_id) {
    const session = await sbSelectOne("sessions", `id=${eq(evalRow.session_id)}`);
    if (session?.assistant_id) {
      const assistant = await sbSelectOne("assistants", `id=${eq(session.assistant_id)}`);
      promptText = assistant?.prompt_text || "";
    }
  }

  const { sys, user } = buildPrompt({ transcript, rubric, weights, checklist, promptText });

  const result = await callOpenAI(sys, user);

  if (!result || typeof result !== "object" || result.parse_error) {
    throw new Error(`Eval parse error: ${result?.parse_error || "no JSON"}`);
  }

  const scores = result.scores || {};
  const overall = Math.max(0, Math.min(100, Math.round(result.overall_score || 0)));
  const summary = result.summary || "";
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions.slice(0, 8) : [];

  await sbUpdate("eval_runs", `id=${eq(evalRow.id)}`, {
    scores,
    overall_score: overall,
    summary,
    suggestions,
    status: "complete",
    completed_at: new Date().toISOString(),
    error: null,
  });

  await sbUpdate("sessions", `id=${eq(evalRow.session_id)}`, { eval_overall: overall }).catch(() => {});

  return { ok: true, evalId: evalRow.id, overall };
}

// ---------- Fetch pending runs ----------
async function getPending(limit) {
  return sbSelect("eval_runs", `status=${eq("pending")}&order=started_at.desc&limit=${encodeURIComponent(limit)}`);
}

// ---------- HTTP handler ----------
exports.handler = async (event) => {
  // CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: "",
    };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Single-session mode
    if (body.sessionId) {
      const evalRow = await sbSelectOne("eval_runs", `session_id=${eq(body.sessionId)}&status=${eq("pending")}`);
      if (!evalRow) {
        return { statusCode: 404, body: JSON.stringify({ error: "No pending eval for that sessionId" }) };
      }
      const out = await evaluateRun(evalRow);
      return { statusCode: 200, body: JSON.stringify(out) };
    }

    // Batch mode
    const batch = body.batch === true;
    const limit = batch ? BATCH_LIMIT : 1;
    const pendings = await getPending(limit);
    if (!pendings.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, processed: 0 }) };
    }

    const results = [];
    for (const ev of pendings) {
      try {
        results.push(await evaluateRun(ev));
      } catch (err) {
        await sbUpdate("eval_runs", `id=${eq(ev.id)}`, {
          status: "error",
          error: String(err.message || err),
          completed_at: new Date().toISOString(),
        }).catch(() => {});
        results.push({ ok: false, evalId: ev.id, error: String(err.message || err) });
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: true, processed: results.length, results }),
    };
  } catch (err) {
    console.error("eval-runner error", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "internal error" }) };
  }
};
