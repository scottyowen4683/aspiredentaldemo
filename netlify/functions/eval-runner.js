/**
 * netlify/functions/eval-runner.js
 *
 * Evaluates short transcripts or summaries against your rubric
 * and stores the result in Supabase.
 */

import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MODEL = process.env.EVAL_MODEL || "gpt-4o-mini";
const RUBRIC_ID = process.env.EVAL_DEFAULT_RUBRIC_ID;
const CHAR_LIMIT = Number(process.env.EVAL_MAX_CHARS || 1800);

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    // Simple health check so Netlify lists this function
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, msg: "eval-runner alive" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const transcript = String(body.transcript || "").trim();

    if (!transcript) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Missing transcript" }),
      };
    }

    // Limit size to save costs
    const text = transcript.slice(-CHAR_LIMIT);

    const prompt = `
You are an evaluation assistant using rubric ${RUBRIC_ID}.
Rate the call 0–3 (0=poor, 3=excellent) on:
1. Introduction and tone
2. Ability to understand caller intent
3. Helpfulness and next steps
4. Professional clarity

Return ONLY valid JSON:
{"score": <0-3>, "label": "<short label>", "notes": "<≤25 words>"}

Transcript:
${text}
`;

    // ---- OpenAI call ----
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 120,
        response_format: { type: "json_object" },
      }),
    });

    const data = await r.json();
    let parsed = {};
    try {
      parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    } catch {
      parsed = { score: 0, label: "parse-error", notes: "Invalid model output" };
    }

    // ---- Store in Supabase ----
    const { error } = await supabase.from("eval_runs").insert({
      rubric_id: RUBRIC_ID,
      model_used: MODEL,
      score: parsed.score ?? 0,
      label: parsed.label ?? "unrated",
      notes: parsed.notes ?? "",
      transcript_excerpt: text,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, ...parsed }),
    };
  } catch (err) {
    console.error("Eval error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: String(err.message || err) }),
    };
  }
};
