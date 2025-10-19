// netlify/functions/eval-runner.js

/**
 * Purpose:
 *  - Pick eval_runs with status='queued'
 *  - Read session + transcript
 *  - Call OpenAI (EVAL_MODEL) to produce {overall:number, summary:string}
 *  - Update sessions.eval_overall + sessions.eval_summary
 *  - Mark eval_runs.status='completed'
 *
 * Required env:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - OPENAI_API_KEY
 *  - EVAL_MODEL               (e.g., "gpt-4o-mini")
 * Optional:
 *  - EVAL_BATCH_LIMIT=5
 *  - DEBUG_LOG=1
 */

const DEBUG = process.env.DEBUG_LOG === "1";
function log(...a) { if (DEBUG) try { console.log(...a); } catch {} }

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVAL_MODEL    = process.env.EVAL_MODEL || "gpt-4o-mini";
const BATCH_LIMIT   = Number(process.env.EVAL_BATCH_LIMIT || "5");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function sbFetch(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init.headers || {}),
    },
  });
  return res;
}

async function getQueuedRuns() {
  const res = await sbFetch(`/rest/v1/eval_runs?status=eq.queued&order=started_at.asc&limit=${BATCH_LIMIT}`);
  if (!res.ok) return [];
  return res.json();
}

async function getSession(session_id) {
  const res = await sbFetch(`/rest/v1/sessions?id=eq.${session_id}&select=id,summary,started_at,ended_at`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0] || null;
}

async function getTranscript(session_id) {
  const res = await sbFetch(`/rest/v1/session_transcripts?session_id=eq.${session_id}&select=content&limit=1`);
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.content || null;
}

async function setRunStatus(run_id, status) {
  const res = await sbFetch(`/rest/v1/eval_runs?id=eq.${run_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    }),
  });
  return res.ok;
}

async function updateSessionEval(session_id, overall, summary) {
  const res = await sbFetch(`/rest/v1/sessions?id=eq.${session_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eval_overall: overall,
      eval_summary: summary,
    }),
  });
  return res.ok;
}

async function askOpenAI(model, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

function buildEvalPrompt({ transcript, sessionSummary }) {
  const rubric = `
You are an evaluator. Score the assistant's performance from 0-100 and write a 1-2 sentence overview.
Consider clarity, helpfulness, tone, and whether the call purpose was addressed.
Return strict JSON: {"overall": <number 0-100>, "summary": "<short text>"}.
`;
  return `${rubric}

=== TRANSCRIPT ===
${transcript || "(no transcript available)"}

=== SESSION SUMMARY ===
${sessionSummary || "(none)"}
`;
}

async function processOne(run) {
  try {
    const session = await getSession(run.session_id);
    if (!session) { await setRunStatus(run.id, "failed"); return; }

    const transcript = await getTranscript(run.session_id);
    const prompt = buildEvalPrompt({
      transcript,
      sessionSummary: session.summary || "",
    });

    const result = await askOpenAI(EVAL_MODEL, prompt);
    const overall  = Math.max(0, Math.min(100, Number(result.overall) || 0));
    const overview = String(result.summary || "").slice(0, 2000);

    await updateSessionEval(run.session_id, overall, overview);
    await setRunStatus(run.id, "completed");
  } catch (e) {
    console.error("eval error", e);
    await setRunStatus(run.id, "failed");
  }
}

exports.handler = async (event) => {
  try {
    // GET ?diag=env: quick sanity
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
      if (q.diag === "env") {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: true,
            SUPABASE_URL: !!SUPABASE_URL,
            SERVICE_KEY: !!SERVICE_KEY,
            OPENAI_API_KEY: !!OPENAI_API_KEY,
            EVAL_MODEL,
            BATCH_LIMIT,
          }),
        };
      }
    }

    const runs = await getQueuedRuns();
    log(`eval-runner picked ${runs.length} run(s)`);
    for (const r of runs) {
      await processOne(r);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, processed: runs.length }) };
  } catch (err) {
    console.error("eval-runner error", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
