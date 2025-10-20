// netlify/functions/vapi-webhook.js
// Logs sessions + a LIGHT transcript slice, then evaluates ONLY that slice to control cost.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EVAL_MODEL = process.env.EVAL_MODEL || "gpt-4o-mini";
const EVAL_DEFAULT_RUBRIC_ID = process.env.EVAL_DEFAULT_RUBRIC_ID;

// Max characters we’ll send to OpenAI (default 1800 ~ ~500-700 tokens)
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
  if (!res.ok) {
    const text = await res.text();
    console.error("Supabase error:", res.status, text);
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchRubricJSON(rubricId) {
  const rows = await sfetch(`/eval_rubrics?id=eq.${rubricId}&select=rubric_json&limit=1`);
  return rows?.[0]?.rubric_json || null;
}

/**
 * Build a LIGHT conversation string:
 * - only user/assistant turns
 * - strip system/prompts
 * - cap to EVAL_MAX_CHARS (keep the last turns which are most relevant)
 */
function lightConversation(msg) {
  let lines = [];

  // Preferred: message.conversation [{role, content}]
  if (Array.isArray(msg?.conversation)) {
    for (const c of msg.conversation) {
      const role = (c.role || "").toLowerCase();
      if (role === "user" || role === "assistant") {
        const content = typeof c.content === "string" ? c.content : "";
        if (content) lines.push(`${role}: ${content}`);
      }
    }
  }

  // Fallback: artifact.messages [{role, message}]
  if (!lines.length && Array.isArray(msg?.artifact?.messages)) {
    for (const m of msg.artifact.messages) {
      const role = (m.role || "").toLowerCase();
      if (role === "user" || role === "assistant") {
        const content = typeof m.message === "string" ? m.message : "";
        if (content) lines.push(`${role}: ${content}`);
      }
    }
  }

  let convo = lines.join("\n");
  // keep the last EVAL_MAX_CHARS characters (usually the most decision-relevant)
  if (convo.length > EVAL_MAX_CHARS) {
    convo = convo.slice(-EVAL_MAX_CHARS);
  }
  return convo;
}

function extractTopQuestions(transcript) {
  return (transcript || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.endsWith("?"))
    .slice(0, 25);
}

async function callOpenAIForEval({ transcript, rubric }) {
  if (!transcript) return { overall_score: 0, summary: "", suggestions: [] };

  const system = `You are an evaluation engine. Score a customer-service call using this rubric JSON: ${JSON.stringify(
    rubric
  )}.
Return strict JSON: {"overall_score":0-100,"summary":"2-4 sentences","suggestions":[{"criterion":"Intro","tip":"...","impact":"high|medium|low"}]}.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EVAL_MODEL,
      temperature: 0.2,
      messages: [{ role: "system", content: system }, { role: "user", content: transcript }],
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
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  // Vapi payload envelope is { message: { ... } }
  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }
  const msg = payload?.message || {};

  const callHeaderId = event.headers?.["x-call-id"] || event.headers?.["X-Call-Id"];
  const provider_session_id =
    callHeaderId || msg?.call?.id || msg?.id || `session-${Date.now()}`;

  const assistant_id = msg?.call?.assistantId || msg?.assistant?.id || null;
  const assistant_name = msg?.assistant?.name || null;

  const eventType = String(msg?.type || "").toLowerCase();
  const status = String(msg?.status || "").toLowerCase();
  const endedAt = msg?.endedAt;

  try {
    // 1) upsert session on ANY event
    await sfetch("/sessions", {
      method: "POST",
      body: JSON.stringify([
        {
          provider_session_id,
          assistant_id,
          assistant_name,
          started_at: msg?.call?.createdAt || nowISO(),
          metadata: {
            phone: msg?.call?.customer?.number || null,
            provider: msg?.call?.phoneCallProvider || null,
          },
          last_event: eventType || status || "unknown",
        },
      ]),
    }).catch(async () => {
      await sfetch(`/sessions?provider_session_id=eq.${provider_session_id}`, {
        method: "PATCH",
        body: JSON.stringify({ last_event: eventType || status || "unknown" }),
      });
    });

    // 2) store LIGHT transcript slice (cost control)
    const convo = lightConversation(msg);
    if (convo) {
      await sfetch("/session_artifacts", {
        method: "POST",
        body: JSON.stringify([
          {
            session_id: provider_session_id,
            transcript_full: convo,                      // this is the light slice
            transcript_preview: convo.slice(0, 280),
            updated_at: nowISO(),
          },
        ]),
      });
    }

    // 3) detect END
    const isEnd =
      status === "completed" ||
      status === "ended" ||
      eventType === "end-of-call-report";

    if (!isEnd) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, type: eventType || status || "update" }) };
    }

    // 4) finalize session
    let aht_seconds = null;
    try {
      const srow = await sfetch(
        `/sessions?provider_session_id=eq.${provider_session_id}&select=started_at&limit=1`
      );
      const started = srow?.[0]?.started_at ? new Date(srow[0].started_at).getTime() : null;
      if (started) aht_seconds = Math.max(0, Math.round((Date.now() - started) / 1000));
    } catch {}

    await sfetch(`/sessions?provider_session_id=eq.${provider_session_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ended_at: endedAt || nowISO(),
        aht_seconds,
        outcome: status || "resolved",
        last_event: eventType || "completed",
      }),
    });

    // 5) evaluation on the LIGHT slice only
    const latest = await sfetch(
      `/session_artifacts?session_id=eq.${provider_session_id}&select=transcript_full&order=updated_at.desc&limit=1`
    );
    const evalInput = latest?.[0]?.transcript_full || "";

    const rubric = EVAL_DEFAULT_RUBRIC_ID ? await fetchRubricJSON(EVAL_DEFAULT_RUBRIC_ID) : null;
    if (OPENAI_API_KEY && rubric && evalInput) {
      const evalRes = await callOpenAIForEval({ transcript: evalInput, rubric });
      await sfetch("/eval_runs", {
        method: "POST",
        body: JSON.stringify([
          {
            session_id: provider_session_id,
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

      // Top questions (from light transcript)
      const qs = extractTopQuestions(evalInput);
      if (qs.length) {
        await sfetch("/session_questions", {
          method: "POST",
          body: JSON.stringify(
            qs.map((q) => ({ session_id: provider_session_id, question: q.slice(0, 500), asked_at: nowISO() }))
          ),
        });
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, finalized: true }) };
  } catch (e) {
    console.error("Webhook error:", e);
    return { statusCode: 500, body: JSON.stringify({ message: e.message }) };
  }
};
