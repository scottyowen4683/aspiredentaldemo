// Scores calls in Supabase using OpenAI (auto-triggered by webhook)
export default async (req, res) => {
  // allow browser GET health-check
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, hint: "POST { callId } to run eval" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    // ---- ENV fallbacks (keep names, add the missing one) ----
    const SB_URL =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASEPROJECTURL ||
      process.env.SUPABASE_URL_PUBLIC;

    const SB_SERVICE =
      process.env.SUPABASE_SERVICE_ROLE_KEY || // ✅ added
      process.env.SUPABASE_SERVICE_ROLE ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE ||
      process.env.SERVICE_ROLE_KEY ||
      process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
      process.env.VITE_SUPABASE_SERVICE_ROLE ||
      process.env.VITE_SUPABASE_SERVICE_KEY;

    if (!SB_URL || !SB_SERVICE) {
      return res.status(500).json({ ok: false, error: "Missing Supabase envs" });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const EVAL_MODEL = process.env.EVAL_MODEL || "gpt-4o-mini";

    const body = await readJson(req);
    const callId = body?.callId;
    if (!callId) {
      return res.status(400).json({ ok: false, error: "callId required" });
    }

    // fetch transcript_full cheaply
    const transcript = await selectOne(
      SB_URL,
      SB_SERVICE,
      "session_artifacts",
      { key: "session_id", val: callId, fields: "transcript_full", order: "updated_at.desc" }
    );

    // build short prompt (respect EVAL_MAX_CHARS)
    const maxChars = parseInt(process.env.EVAL_MAX_CHARS || "4000", 10);
    const text = (transcript?.transcript_full || "").slice(0, maxChars);

    // if no transcript yet, write a placeholder eval record and exit
    if (!text) {
      await upsert(SB_URL, SB_SERVICE, "eval_runs", [{
        session_id: callId,
        status: "no-transcript",
        overall_score: null,
        summary: null,
        suggestions: null
      }]);
      return res.status(200).json({ ok: true, info: "no transcript" });
    }

    // call OpenAI
    const prompt = [
      { role: "system", content: "You are a rigorous QA evaluator for voice support calls." },
      {
        role: "user",
        content:
`Evaluate the following transcript against these criteria:
1) Greeting, identification, and tone
2) Correct triage and qualification
3) Accuracy and policy compliance
4) Clear next steps and closure
5) Professionalism and brevity
Return JSON:
{
  "overall_score": 0-100 integer,
  "summary": "2-3 sentences",
  "suggestions": [{"criterion":"...", "tip":"...", "impact":"low|med|high"}]
}

Transcript:
${text}`
      }
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: EVAL_MODEL,
        messages: prompt,
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });

    const j = await r.json();
    const content = j?.choices?.[0]?.message?.content || "{}";
    let out;
    try { out = JSON.parse(content); } catch { out = {}; }

    const row = {
      session_id: callId,
      status: "completed",
      overall_score: clampInt(out.overall_score, 0, 100),
      summary: out.summary || null,
      suggestions: Array.isArray(out.suggestions) ? out.suggestions : null
    };

    await upsert(SB_URL, SB_SERVICE, "eval_runs", [row]);

    // also flip needs_eval=false on calls
    await upsert(SB_URL, SB_SERVICE, "calls", [{ id: callId, needs_eval: false }]);

    return res.status(200).json({ ok: true, scored: row.overall_score ?? null });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e?.message || "unknown" });
  }
};

// --- helpers ---
function clampInt(n, lo, hi) {
  const x = parseInt(n, 10);
  if (Number.isNaN(x)) return null;
  return Math.max(lo, Math.min(hi, x));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw); } catch { return {}; }
}

async function selectOne(url, key, table, { key: col, val, fields, order }) {
  const q = new URL(`${url}/rest/v1/${table}`);
  q.searchParams.set("select", fields);
  q.searchParams.set(col, `eq.${val}`);
  if (order) q.searchParams.set("order", order);
  const r = await fetch(q.toString(), {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const a = await r.json();
  return a?.[0] || null;
}

async function upsert(url, key, table, rows) {
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(rows)
  });
  if (!r.ok) throw new Error(await r.text());
}
