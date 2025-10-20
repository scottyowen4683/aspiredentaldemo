// netlify/functions/eval-runner.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { callId } = JSON.parse(event.body || "{}");
  if (!callId) return { statusCode: 400, body: "Missing callId" };

  try {
    // 1) Load transcript
    const { data: tx } = await supabase
      .from("transcripts")
      .select("full_transcript")
      .eq("call_id", callId)
      .maybeSingle();

    const transcript = tx?.full_transcript || "";
    if (!transcript) throw new Error("No transcript found");

    // 2) Use GPT-4o-mini to score the call
    const rubricPrompt = `
You are an evaluation model for Aspire Executive Solutions.
Score the service call transcript 0–100 across these five criteria (equal weight):

1. Greeting & identification of self/company
2. Intent capture and confirmation
3. Guidance and resolution quality
4. Clarity and brevity (≤30 words per turn)
5. Proper closing and next steps

Return JSON exactly in this format:
{
  "total": <int>,
  "breakdown": {
    "greeting": <int>,
    "intent": <int>,
    "resolution": <int>,
    "clarity": <int>,
    "closing": <int>
  },
  "notes": "<one-line summary>"
}

Transcript:
${transcript.slice(-5000)}
`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 250,
        messages: [
          { role: "system", content: "You are a precise evaluator that outputs only valid JSON." },
          { role: "user", content: rubricPrompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    const j = await r.json();
    const content = j.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);

    const score = parsed.total || 0;
    const rubric = parsed.breakdown || {};
    const notes = parsed.notes || "";

    // 3) Update DB
    await supabase
      .from("calls")
      .update({
        score,
        rubric_json: { breakdown: rubric, notes },
        transcript_preview: transcript.slice(0, 400),
        updated_at: new Date().toISOString()
      })
      .eq("id", callId);

    return { statusCode: 200, body: JSON.stringify({ ok: true, score }) };
  } catch (err) {
    console.error("eval-runner error", err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
