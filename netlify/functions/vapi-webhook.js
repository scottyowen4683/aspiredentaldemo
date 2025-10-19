// /netlify/functions/vapi-webhook.js
// Receives Vapi webhook events, saves session + transcript to Supabase,
// runs LLM scoring against your rubric, persists eval + derived "top questions".

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const EVAL_MODEL = process.env.EVAL_MODEL || "gpt-4o-mini";
const EVAL_DEFAULT_RUBRIC_ID = process.env.EVAL_DEFAULT_RUBRIC_ID; // <- set this in env after seeding

// Simple signature bypass flag (optional)
const DISABLE_SIGNATURE_CHECK = `${process.env.DISABLE_SIGNATURE_CHECK}` === "true";

async function supabaseFetch(path, init = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
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
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }
  return res.json();
}

async function fetchRubricJSON(rubricId) {
  const rows = await supabaseFetch(`/eval_rubrics?id=eq.${rubricId}&select=rubric_json&limit=1`);
  return rows?.[0]?.rubric_json || null;
}

function nowISO() {
  return new Date().toISOString();
}

/**
 * Attempt to normalize transcript from a variety of payloads.
 * Supports:
 *  - { transcript: "full text" }
 *  - { messages: [{role, content}, ...] }
 *  - { artifacts: { transcript: "..." } }
 */
function extractTranscript(payload) {
  if (payload?.transcript) return String(payload.transcript);

  if (Array.isArray(payload?.messages)) {
    return payload.messages
      .map((m) => {
        if (typeof m?.content === "string") return `${m.role || "unknown"}: ${m.content}`;
        if (Array.isArray(m?.content))
          return `${m.role || "unknown"}: ${m.content.map((c) => c?.text || "").join(" ")}`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (payload?.artifacts?.transcript) return String(payload.artifacts.transcript);

  return "";
}

async function callOpenAIForEval({ transcript, rubric }) {
  const system = `You are an evaluation engine. Score a customer service phone call transcript.
Return strict JSON with:
{
  "overall_score": <0-100>,
  "summary": "<2-3 sentence summary>",
  "suggestions": [
    {"criterion":"Intro", "tip":"...", "impact":"high|medium|low"},
    {"criterion":"Question Handling", "tip":"...", "impact":"..."},
    {"criterion":"Sentiment & Empathy", "tip":"...", "impact":"..."}
  ]
}
Use this rubric (JSON) as the scoring guidance:
${JSON.stringify(rubric)}`;

  const user = `Transcript:\n${transcript}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EVAL_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI error: ${t}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  let parsed = {};
  try {
    parsed = JSON.parse(content);
  } catch (_) {}

  // sanitise
  const overall = Math.max(0, Math.min(100, Math.round(Number(parsed.overall_score) || 0)));
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 10) : [];
  const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 1500) : "";

  return { overall_score: overall, summary, suggestions };
}

function extractTopQuestions(transcript) {
  // naive extraction: take lines that look like user/customer questions (end with '?')
  // Later you can replace with an LLM extractor. Good enough to start.
  return (transcript || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /\?$/.test(l))
    .slice(0, 25);
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // NOTE: add signature verification against Vapi headers here if you wish.
  if (!DISABLE_SIGNATURE_CHECK) {
    // Skipping detailed signature checks for simplicity at your request.
  }

  const payload = JSON.parse(event.body || "{}");

  // Vapi payloads vary. We'll capture the important bits if present.
  const provider_session_id =
    payload?.callId || payload?.id || payload?.session_id || crypto.randomUUID();
  const assistant_id =
    payload?.assistantId || payload?.assistant_id || payload?.assistant?.id || null;
  const assistant_name =
    payload?.assistantName || payload?.assistant_name || payload?.assistant?.name || null;
  const eventType = payload?.type || payload?.event || "unknown";

  // Start or upsert a session row on first event
  try {
    if (eventType === "call.started" || eventType === "session.started" || eventType === "call.initiated") {
      const started_at = nowISO();
      await supabaseFetch("/sessions", {
        method: "POST",
        body: JSON.stringify([
          {
            provider_session_id,
            assistant_id,
            assistant_name,
            started_at,
            metadata: payload?.metadata || null,
            last_event: eventType,
          },
        ]),
      });

      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // On update / transcript delivery, store artifacts
    if (eventType === "call.updated" || eventType === "session.updated" || payload?.transcript || payload?.messages) {
      const transcript_full = extractTranscript(payload);
      const transcript_preview = transcript_full?.slice(0, 280);

      // Upsert artifact
      await supabaseFetch("/session_artifacts", {
        method: "POST",
        body: JSON.stringify([
          {
            session_id: provider_session_id,
            transcript_full,
            transcript_preview,
            updated_at: nowISO(),
          },
        ]),
      });

      // Keep session row warm
      await supabaseFetch(`/sessions?provider_session_id=eq.${provider_session_id}`, {
        method: "PATCH",
        body: JSON.stringify({ last_event: eventType }),
      });

      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // On end / completed — compute metrics, evaluate, and store derivations
    if (eventType === "call.ended" || eventType === "session.ended" || eventType === "call.completed") {
      const ended_at = nowISO();

      // Attempt to fetch transcript we previously saved
      const arts = await supabaseFetch(
        `/session_artifacts?session_id=eq.${provider_session_id}&select=transcript_full&limit=1`
      );
      const transcript_full = arts?.[0]?.transcript_full || extractTranscript(payload);

      // Calculate AHT if we have a start time
      let aht_seconds = null;
      try {
        // fetch the session row to find started_at
        const sess = await supabaseFetch(
          `/sessions?provider_session_id=eq.${provider_session_id}&select=started_at,assistant_id,assistant_name&limit=1`
        );
        const started_at = sess?.[0]?.started_at ? new Date(sess[0].started_at) : null;
        if (started_at) {
          aht_seconds = Math.max(0, Math.round((Date.now() - started_at.getTime()) / 1000));
        }
      } catch (_) {}

      // Store end + AHT
      await supabaseFetch(`/sessions?provider_session_id=eq.${provider_session_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ended_at,
          aht_seconds,
          outcome: payload?.outcome || "resolved",
          last_event: eventType,
        }),
      });

      // Evaluate using rubric
      const rubric = EVAL_DEFAULT_RUBRIC_ID ? await fetchRubricJSON(EVAL_DEFAULT_RUBRIC_ID) : null;
      if (OPENAI_API_KEY && rubric && transcript_full) {
        const evalRes = await callOpenAIForEval({ transcript, rubric: rubric, transcript: transcript_full });

        await supabaseFetch("/eval_runs", {
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

      // Derive top-questions
      const qs = extractTopQuestions(transcript_full).slice(0, 25);
      if (qs.length) {
        await supabaseFetch("/session_questions", {
          method: "POST",
          body: JSON.stringify(
            qs.map((q) => ({
              session_id: provider_session_id,
              question: q.substring(0, 500),
              asked_at: nowISO(),
            }))
          ),
        });
      }

      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Ignore other events
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: eventType }) };
  } catch (e) {
    console.error("Webhook error", e);
    return { statusCode: 500, body: JSON.stringify({ message: e.message }) };
  }
};
