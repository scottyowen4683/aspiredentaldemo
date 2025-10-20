// /netlify/functions/vapi-webhook.js
// Receives Vapi webhook events, logs them verbosely, saves session + transcript to Supabase,
// runs LLM scoring against your rubric, persists eval + derived "top questions".

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const EVAL_MODEL = process.env.EVAL_MODEL || "gpt-4o-mini";
const EVAL_DEFAULT_RUBRIC_ID = process.env.EVAL_DEFAULT_RUBRIC_ID;
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
    console.error("Supabase error:", res.status, text);
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
Return strict JSON with keys overall_score, summary, suggestions[]. 
Use this rubric: ${JSON.stringify(rubric)}`;

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
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
    }),
  });

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  let parsed = {};
  try {
    parsed = JSON.parse(content);
  } catch (_) {}
  const overall = Math.max(0, Math.min(100, Math.round(Number(parsed.overall_score) || 0)));
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 10) : [];
  const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 1500) : "";
  return { overall_score: overall, summary, suggestions };
}

function extractTopQuestions(transcript) {
  return (transcript || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /\?$/.test(l))
    .slice(0, 25);
}

export const handler = async (event) => {
  console.log("🔔 Incoming webhook event");
  console.log("Headers:", JSON.stringify(event.headers, null, 2));
  console.log("Body raw:", event.body);

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!DISABLE_SIGNATURE_CHECK) {
    // skipping signature verification for now
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    console.error("Failed to parse JSON body", e);
    return { statusCode: 400, body: "Invalid JSON" };
  }

  console.log("Parsed payload:", JSON.stringify(payload, null, 2));

  const provider_session_id =
    payload?.callId || payload?.id || payload?.session_id || crypto.randomUUID();
  const assistant_id =
    payload?.assistantId || payload?.assistant_id || payload?.assistant?.id || null;
  const assistant_name =
    payload?.assistantName || payload?.assistant_name || payload?.assistant?.name || null;
  const eventType = payload?.type || payload?.event || "unknown";

  console.log(`➡️ Event type: ${eventType}  Session: ${provider_session_id}`);

  try {
    // ---- Start event ----
    if (["call.started", "session.started", "call.initiated"].includes(eventType)) {
      const started_at = nowISO();
      console.log("🟢 call.started - creating session");
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

    // ---- Update / transcript event ----
    if (
      ["call.updated", "session.updated"].includes(eventType) ||
      payload?.transcript ||
      payload?.messages
    ) {
      console.log("🟡 call.updated - saving transcript artifact");
      const transcript_full = extractTranscript(payload);
      const transcript_preview = transcript_full?.slice(0, 280);

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

      await supabaseFetch(`/sessions?provider_session_id=eq.${provider_session_id}`, {
        method: "PATCH",
        body: JSON.stringify({ last_event: eventType }),
      });

      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // ---- End event ----
    if (["call.ended", "session.ended", "call.completed"].includes(eventType)) {
      console.log("🔴 call.ended - finalizing session");
      const ended_at = nowISO();

      const arts = await supabaseFetch(
        `/session_artifacts?session_id=eq.${provider_session_id}&select=transcript_full&limit=1`
      );
      const transcript_full = arts?.[0]?.transcript_full || extractTranscript(payload);

      let aht_seconds = null;
      try {
        const sess = await supabaseFetch(
          `/sessions?provider_session_id=eq.${provider_session_id}&select=started_at,assistant_id,assistant_name&limit=1`
        );
        const started_at = sess?.[0]?.started_at ? new Date(sess[0].started_at) : null;
        if (started_at) {
          aht_seconds = Math.max(0, Math.round((Date.now() - started_at.getTime()) / 1000));
        }
      } catch (_) {}

      await supabaseFetch(`/sessions?provider_session_id=eq.${provider_session_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ended_at,
          aht_seconds,
          outcome: payload?.outcome || "resolved",
          last_event: eventType,
        }),
      });

      const rubric = EVAL_DEFAULT_RUBRIC_ID
        ? await fetchRubricJSON(EVAL_DEFAULT_RUBRIC_ID)
        : null;
      if (OPENAI_API_KEY && rubric && transcript_full) {
        console.log("🧠 Evaluating transcript with OpenAI");
        const evalRes = await callOpenAIForEval({
          transcript: transcript_full,
          rubric,
        });
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

      console.log("✅ call.ended - session finalized");
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    console.log("⚪ Ignored event type:", eventType);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ignored: eventType }) };
  } catch (e) {
    console.error("❌ Webhook error:", e);
    return { statusCode: 500, body: JSON.stringify({ message: e.message }) };
  }
};
