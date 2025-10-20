// env needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, VAPI_WEBHOOK_SECRET (new), EVAL_MAX_CHARS? (optional)

import crypto from "crypto";
import zlib from "zlib";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const EVAL_MAX_CHARS = Number(process.env.EVAL_MAX_CHARS ?? 1800);

// --- 1) secure your webhook
function assertVapi(req: Request) {
  const secret = req.headers.get("x-vapi-secret") || "";
  if (!process.env.VAPI_WEBHOOK_SECRET || secret !== process.env.VAPI_WEBHOOK_SECRET) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

// --- 2) tiny helpers
type VapiMsg = { role?: string; content?: string; message?: string };
const isUA = (r?: string) => r === "user" || r === "assistant";

function linesFromArray(arr: VapiMsg[] = []) {
  const out: string[] = [];
  for (const m of arr) {
    const role = m.role;
    const text = (m.content ?? m.message ?? "").trim();
    if (isUA(role) && text) out.push(`${role}: ${text}`);
  }
  return out;
}

async function fetchLogUrl(logUrl: string | undefined) {
  if (!logUrl) return [];
  const res = await fetch(logUrl);
  if (!res.ok) return [];
  const buf = await res.buffer();
  const jsonl = logUrl.endsWith(".gz") ? zlib.gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  const lines: string[] = [];
  for (const row of jsonl.split("\n")) {
    if (!row.trim()) continue;
    try {
      const e = JSON.parse(row);
      // Vapi JSONL rows usually have { role, content } when a turn completes:
      const role = e.role ?? e.message?.role;
      const content = (e.content ?? e.message?.content ?? "").trim();
      if (isUA(role) && content) lines.push(`${role}: ${content}`);
    } catch {}
  }
  return lines;
}

function lightConversationFrom(lines: string[]) {
  if (lines.length === 0) return "";
  let convo = lines.join("\n");
  if (convo.length > EVAL_MAX_CHARS) {
    // take the last slice – tends to hold the meaningful resolution
    convo = convo.slice(-EVAL_MAX_CHARS);
  }
  return convo;
}

// --- 3) bare-bones eval (cheap + short)
async function evalConversation(text: string) {
  if (!text) return { score: 0, label: "no-content", notes: "Empty conversation" };

  const prompt =
    "Score 0–3 (0=bad,3=great). Criteria: understood intent, next step clear, polite+concise. " +
    "Return JSON {score,label,notes}. Keep notes <= 25 words.\n\n" + text;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      max_tokens: 120
    })
  });
  const j = await r.json();
  try {
    return JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return { score: 0, label: "parse-error", notes: "Eval parse failed" };
  }
}

// --- 4) main handler (only core bits)
export default async function handler(req: Request) {
  try {
    assertVapi(req);
    const body = await req.json();
    const { message = {} } = body;
    const type = message.type as string;

    // Always log diagnostics (you’re already doing this)
    await supabase.from("webhook_diagnostics").insert({
      raw_headers: Object.fromEntries(req.headers),
      raw_body: JSON.stringify(body),
      received_at: new Date().toISOString(),
    });

    // Only run heavy stuff once at end-of-call
    if (type === "end-of-call-report") {
      const end = message;
      const call = end.call || {};
      const endedReason = end.endedReason || end.status || "unknown";

      // 1) collect candidate sources
      const lines: string[] = [];
      // a) inline analysis summary if ever present
      if (end.analysis?.summary) lines.push(`assistant: ${String(end.analysis.summary).trim()}`);
      // b) transcript text
      if (end.transcript) {
        for (const seg of String(end.transcript).split("\n")) {
          const s = seg.trim();
          if (s) lines.push(s.startsWith("user:") || s.startsWith("assistant:") ? s : `user: ${s}`);
        }
      }
      // c) any inline messages arrays
      if (end.artifact?.messagesOpenAIFormatted) lines.push(...linesFromArray(end.artifact.messagesOpenAIFormatted));
      if (end.artifact?.messages) lines.push(...linesFromArray(end.artifact.messages));
      // d) fallback to logUrl
      if (lines.length === 0) {
        const fromLog = await fetchLogUrl(end.logUrl);
        lines.push(...fromLog);
      }

      const lightConversation = lightConversationFrom(lines);

      // 2) run tiny eval
      const evalResult = await evalConversation(lightConversation);

      // 3) upsert main call row
      await supabase.from("calls").upsert({
        call_id: call.id,
        ended_reason: endedReason,
        started_at: end.startedAt ?? null,
        ended_at: end.endedAt ?? null,
        customer_number: end.customer?.number ?? null,
        assistant_id: end.assistant?.id ?? null,
        recording_url: end.recordingUrl ?? null,
        stereo_recording_url: end.stereoRecordingUrl ?? null,
        log_url: end.logUrl ?? null,
        cost_total: end.cost ?? null,
        cost_breakdown: end.costBreakdown ?? null,
        light_conversation: lightConversation || null,
        eval_score: evalResult.score ?? null,
        eval_label: evalResult.label ?? null,
        eval_notes: evalResult.notes ?? null,
      }, { onConflict: "call_id" });

      return new Response("ok");
    }

    // For other event types (status-update, speech-update) you can early-exit
    return new Response("noop");
  } catch (e: any) {
    // log the error row so you can see it in the same table
    try {
      await supabase.from("webhook_diagnostics").insert({
        raw_headers: {},
        raw_body: JSON.stringify({ error: String(e?.stack || e) }),
        received_at: new Date().toISOString(),
      });
    } catch {}
    return new Response("err", { status: 500 });
  }
}
