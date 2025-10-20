// eval-runner.js  (Web API handler)
// VERSION: 2025-10-20 14:10

export default async (request, context) => {
  try {
    const body = await request.json().catch(() => ({}));
    const callId = body?.callId;

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
      process.env.VITE_SUPABASE_SERVICE_KEY;

    if (!SB_URL || !SB_SERVICE) {
      return json({ ok: false, error: "Missing Supabase envs" }, 500);
    }
    if (!callId) return json({ ok: false, error: "Missing callId" }, 400);

    // 1) Pull the latest full transcript for this call
    const transcript = await fetchOne(
      `${SB_URL}/rest/v1/session_artifacts?select=transcript_full&session_id=eq.${encodeURIComponent(
        callId
      )}&order=updated_at.desc&limit=1`,
      SB_SERVICE
    ).then((r) => (r?.[0]?.transcript_full || "").trim());

    // 2) If no transcript yet, soft exit (webhook will re-trigger later)
    if (!transcript) return json({ ok: true, skipped: "no transcript yet" });

    // 3) Evaluate using your chosen model (uses EVAL_MODEL if set)
    const model =
      process.env.EVAL_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini";

    const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY;
    if (!openaiKey) return json({ ok: false, error: "Missing OPENAI_API_KEY" }, 500);

    const rubric = `Score the call 0-100 with short summary and 2-4 suggestions.
Return JSON: { "overall_score": number, "summary": string, "suggestions": [{ "criterion": string, "tip": string, "impact": "low|med|high" }] }`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You are a strict QA evaluator for customer service calls." },
          { role: "user", content: `${rubric}\n\nTranscript:\n${transcript}` },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`OpenAI error: ${errText}`);
    }
    const comp = await aiRes.json();
    const parsed = safeJson(comp?.choices?.[0]?.message?.content);

    // 4) Persist score + suggestions on "calls"
    const score = clampInt(parsed?.overall_score, 0, 100);
    const patch = {
      score,
      rubric_json: parsed || null,
      needs_eval: false,
      evaluated_at: new Date().toISOString(),
    };

    await supabasePatch(SB_URL, SB_SERVICE, "calls", "id", callId, patch);

    console.log("eval-runner OK", { callId, score, model });
    return json({ ok: true, callId, score, model });
  } catch (e) {
    console.error("eval-runner error", e);
    return json({ ok: false, error: e?.message || "unknown" }, 200);
  }
};

// ---------- helpers ----------
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function safeJson(s) {
  try {
    return typeof s === "string" ? JSON.parse(s) : s || null;
  } catch {
    return null;
  }
}

function clampInt(n, lo, hi) {
  const x = Math.round(Number(n || 0));
  return Math.max(lo, Math.min(hi, x));
}

async function fetchOne(url, serviceKey) {
  const r = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!r.ok) throw new Error(`Supabase fetch failed: ${await r.text()}`);
  return r.json();
}

async function supabasePatch(url, serviceKey, table, keyCol, keyVal, patch) {
  const r = await fetch(`${url}/rest/v1/${table}?${keyCol}=eq.${encodeURIComponent(keyVal)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Supabase patch failed: ${text}`);
  }
}
