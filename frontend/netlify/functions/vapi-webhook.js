// /netlify/functions/vapi-webhook.js
// Compatible with both legacy and current Vapi webhook payloads.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const EVAL_MODEL = process.env.EVAL_MODEL || "gpt-4o-mini";
const EVAL_DEFAULT_RUBRIC_ID = process.env.EVAL_DEFAULT_RUBRIC_ID;
const DISABLE_SIGNATURE_CHECK = `${process.env.DISABLE_SIGNATURE_CHECK}` === "true";

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

function extractTranscript(payload) {
  if (payload?.transcript) return String(payload.transcript);
  if (payload?.textPreview) return String(payload.textPreview);
  if (payload?.summary?.transcript) return String(payload.summary.transcript);
  if (Array.isArray(payload?.messages)) {
    return payload.messages.map(m => `${m.role}: ${m.content || ""}`).join("\n");
  }
  return "";
}

function extractTopQuestions(transcript) {
  return (transcript || "")
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => /\?$/.test(l))
    .slice(0, 25);
}

async function callOpenAIForEval({ transcript, rubric }) {
  const system = `You are an evaluation engine. Score a customer service call transcript using this rubric: ${JSON.stringify(rubric)}. 
Return JSON {overall_score, summary, suggestions:[{criterion,tip,impact}]}.`;
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
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "{}";
  let parsed = {};
  try { parsed = JSON.parse(text); } catch (_) {}
  return {
    overall_score: Math.max(0, Math.min(100, Number(parsed.overall_score) || 0)),
    summary: parsed.summary || "",
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
  };
}

export const handler = async (event) => {
  console.log("🔔 Incoming Vapi webhook");
  console.log("Body:", event.body);

  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  let payload = {};
  try { payload = JSON.parse(event.body || "{}"); } catch (e) {
    console.error("Invalid JSON", e);
    return { statusCode: 400, body: "Invalid JSON" };
  }

  // Support both legacy and new field names
  const eventType = payload?.evtType || payload?.type || payload?.event || "unknown";
  const provider_session_id =
    payload?.sessionId || payload?.callId || payload?.id || crypto.randomUUID();
  const assistant_id = payload?.assistantId || payload?.assistant_id || null;
  const assistant_name = payload?.assistantName || payload?.assistant_name || null;

  console.log(`➡️ EventType=${eventType} session=${provider_session_id}`);

  try {
    // Always upsert session
    await sfetch("/sessions", {
      method: "POST",
      body: JSON.stringify([
        {
          provider_session_id,
          assistant_id,
          assistant_name,
          started_at: payload?.startedAt || nowISO(),
          metadata: payload?.metadata || null,
          last_event: eventType,
        },
      ]),
    }).catch(async () => {
      await sfetch(`/sessions?provider_session_id=eq.${provider_session_id}`, {
        method: "PATCH",
        body: JSON.stringify({ last_event: eventType }),
      });
    });

    // Always store an artifact
    const transcript_full = extractTranscript(payload);
    await sfetch("/session_artifacts", {
      method: "POST",
      body: JSON.stringify([
        {
          session_id: provider_session_id,
          transcript_full,
          transcript_preview: transcript_full.slice(0, 280),
          updated_at: nowISO(),
        },
      ]),
    });

    // Determine stage
    const isEnd =
      eventType === "end-of-call-report" ||
      ["call.ended", "session.ended", "call.completed"].includes(eventType) ||
      payload?.status === "completed" ||
      payload?.endedAt;

    if (!isEnd) {
      console.log("🟢 Non-final event stored");
      return { statusCode: 200, body: JSON.stringify({ ok: true, type: eventType }) };
    }

    console.log("🔴 Final event detected → closing session");

    // Finalize session
    await sfetch(`/sessions?provider_session_id=eq.${provider_session_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ended_at: payload?.endedAt || nowISO(),
        outcome: payload?.status || "resolved",
        last_event: eventType,
      }),
    });

    // Evaluate transcript if present
    const rubric = EVAL_DEFAULT_RUBRIC_ID ? await fetchRubricJSON(EVAL_DEFAULT_RUBRIC_ID) : null;
    if (OPENAI_API_KEY && rubric && transcript_full) {
      console.log("🧠 Evaluating with OpenAI");
      const evalRes = await callOpenAIForEval({ transcript: transcript_full, rubric });
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
    }

    // Extract top questions
    const qs = extractTopQuestions(transcript_full);
    if (qs.length) {
      await sfetch("/session_questions", {
        method: "POST",
        body: JSON.stringify(
          qs.map((q) => ({
            session_id: provider_session_id,
            question: q.slice(0, 500),
            asked_at: nowISO(),
          }))
        ),
      });
    }

    console.log("✅ Session finalized successfully");
    return { statusCode: 200, body: JSON.stringify({ ok: true, finalized: true }) };
  } catch (e) {
    console.error("❌ Webhook failure:", e);
    return { statusCode: 500, body: JSON.stringify({ message: e.message }) };
  }
};
