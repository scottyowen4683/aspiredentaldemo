// Scores a completed call and writes into eval_runs (Netlify Functions style).
// Uses your existing envs (no renames), and falls back safely.

export const handler = async (event) => {
  try {
    // Health check in browser
    if (event.httpMethod === "GET") {
      return json(200, { ok: true, hint: "POST { callId } to score a call" });
    }
    if (event.httpMethod !== "POST") {
      return text(405, "Method Not Allowed");
    }

    const body = safeJson(event.body);
    const callId = body?.callId || body?.session_id;
    if (!callId) return json(400, { ok: false, error: "Missing callId" });

    // ---- Supabase envs (same fallbacks as webhook) ----
    const SB_URL =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASEPROJECTURL ||
      process.env.SUPABASE_URL_PUBLIC;

    const SB_SERVICE =
      process.env.SUPABASE_SERVICE_ROLE ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE ||
      process.env.SERVICE_ROLE_KEY ||
      process.env.VITE_SUPABASE_SERVICE_ROLE ||
      process.env.VITE_SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SB_URL || !SB_SERVICE) {
      return json(500, { ok: false, error: "Missing Supabase envs" });
    }

    // ---- Load transcript (full if available, else preview) ----
    const transcript = await loadTranscript(SB_URL, SB_SERVICE, callId);

    // ---- Model selection ----
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const EVAL_MODEL =
      process.env.EVAL_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini"; // you said you use 4o-mini

    // ---- Build prompt ----
    const rubricId = process.env.EVAL_DEFAULT_RUBRIC_ID || "default";
    const maxChars = parseInt(process.env.EVAL_MAX_CHARS || "4000", 10);
    const sliced = (transcript || "").slice(0, maxChars);

    let scorePayload = {
      overall_score: 0,
      summary: "No transcript available.",
      suggestions: [],
    };

    if (OPENAI_API_KEY && sliced.trim()) {
      const userMsg = [
        "You are a QA evaluator. Return STRICT JSON only.",
        "Fields: overall_score (0-100), summary (<=60 words), suggestions (array of {criterion, tip, impact}).",
        `Rubric: ${rubricId}.`,
        "Transcript follows between <<< >>>",
        `<<<\n${sliced}\n>>>`,
      ].join("\n");

      const completion = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EVAL_MODEL,
          temperature: 0.2,
          messages: [
            { role: "system", content: "Return only valid JSON." },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
        }),
      });

      const raw = await completion.text();
      if (!/^2\d\d$/.test(String(completion.status))) {
        throw new Error(`OpenAI error ${completion.status}: ${raw}`);
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const j = JSON.parse(raw);
        parsed = safeJson(j?.choices?.[0]?.message?.content);
      }

      if (parsed && typeof parsed === "object") {
        scorePayload.overall_score = clampInt(parsed.overall_score, 0, 100);
        scorePayload.summary = String(parsed.summary || "").slice(0, 600);
        scorePayload.suggestions = Array.isArray(parsed.suggestions)
          ? parsed.suggestions.slice(0, 10)
          : [];
      }
    }

    // ---- Write eval_runs ----
    const row = {
      session_id: callId,
      status: "completed",
      overall_score: scorePayload.overall_score,
      summary: scorePayload.summary,
      suggestions: scorePayload.suggestions,
      completed_at: new Date().toISOString(),
    };

    await supabaseUpsert(SB_URL, SB_SERVICE, "eval_runs", row);

    // Clear needs_eval on calls
    await supabasePatch(SB_URL, SB_SERVICE, "calls", { needs_eval: false }, { id: callId });

    return json(200, { ok: true, callId, score: scorePayload.overall_score });
  } catch (e) {
    return json(200, { ok: false, error: e?.message || "unknown" });
  }
};

// ---------- helpers ----------

function text(statusCode, body, headers = {}) {
  return { statusCode, headers, body };
}
function json(statusCode, obj, headers = {}) {
  return {
    statusCode,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(obj),
  };
}
function safeJson(raw) {
  try {
    return typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
  } catch {
    return {};
  }
}
function clampInt(n, lo, hi) {
  const x = parseInt(n, 10);
  if (isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

async function supabaseUpsert(url, serviceKey, table, row) {
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([row]),
  });
  if (!r.ok) throw new Error(`Supabase upsert failed: ${await r.text()}`);
}

async function supabasePatch(url, serviceKey, table, patch, eq) {
  const qs = Object.entries(eq)
    .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`)
    .join("&");
  const r = await fetch(`${url}/rest/v1/${table}?${qs}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`Supabase patch failed: ${await r.text()}`);
}

async function loadTranscript(url, key, sessionId) {
  // Try session_artifacts.transcript_full first
  const art = await fetch(
    `${url}/rest/v1/session_artifacts?select=transcript_full,updated_at&session_id=eq.${encodeURIComponent(
      sessionId
    )}&order=updated_at.desc&limit=1`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }
  );
  if (art.ok) {
    const rows = await art.json();
    if (rows?.[0]?.transcript_full) return rows[0].transcript_full;
  }
  // Fallback: calls.transcript_preview
  const calls = await fetch(
    `${url}/rest/v1/calls?id=eq.${encodeURIComponent(sessionId)}&select=transcript_preview`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (calls.ok) {
    const rows = await calls.json();
    return rows?.[0]?.transcript_preview || "";
  }
  return "";
}
