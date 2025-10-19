// netlify/functions/vapi-webhook.js
const crypto = require("crypto");

/**
 * Env (required)
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - EVAL_DEFAULT_RUBRIC_ID
 *
 * Env (optional)
 *  - VAPI_WEBHOOK_SECRET         (set + keep DISABLE_SIGNATURE_CHECK=0 in prod)
 *  - DISABLE_SIGNATURE_CHECK=1   (dev only)
 *  - DEBUG_LOG=1
 */

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPI_SECRET   = process.env.VAPI_WEBHOOK_SECRET || "";
const SKIP_SIG      = process.env.DISABLE_SIGNATURE_CHECK === "1";
const DEFAULT_RUBRIC_ID =
  process.env.EVAL_DEFAULT_RUBRIC_ID || "43d9b1fe-570f-4c97-abdb-fbbb73ef3d08";
const DEBUG = process.env.DEBUG_LOG === "1";
const log = (...a) => { if (DEBUG) try { console.log(...a); } catch {} };

/* ------------------ signature ------------------ */
function verifySignature(raw, sig) {
  if (SKIP_SIG) return true;
  if (!sig || !VAPI_SECRET) return false;
  const h = crypto.createHmac("sha256", VAPI_SECRET);
  h.update(raw, "utf8");
  const digest = `sha256=${h.digest("hex")}`;
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig)); }
  catch { return false; }
}

/* ------------------ supabase helpers ------------------ */
async function sfetch(path, init = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init.headers || {}),
    },
  });
}
async function upsertSession(row) {
  const r = await sfetch(`/rest/v1/sessions?on_conflict=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  const t = await r.text(); log("sessions upsert ->", r.status, t || "(no body)");
  return { ok: r.ok, status: r.status, text: t };
}
async function patchSession(id, patch) {
  const r = await sfetch(`/rest/v1/sessions?id=eq.${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return r.ok;
}
async function readTranscript(session_id) {
  const r = await sfetch(`/rest/v1/session_transcripts?session_id=eq.${session_id}&select=content&limit=1`);
  if (!r.ok) return "";
  const rows = await r.json();
  return rows?.[0]?.content || "";
}
async function writeTranscript(session_id, content) {
  // upsert single-row per session_id
  const r = await sfetch(`/rest/v1/session_transcripts?on_conflict=session_id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ session_id, content }),
  });
  const t = await r.text(); log("transcript upsert ->", r.status, t || "(no body)");
  return r.ok;
}
async function lookupAssistantFromCalls(call_id) {
  // your calls table has call_id + assistant_id
  const r = await sfetch(`/rest/v1/calls?select=assistant_id&call_id=eq.${encodeURIComponent(call_id)}&limit=1`);
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0]?.assistant_id || null;
}
async function queueEval(session_id) {
  const r = await sfetch(`/rest/v1/eval_runs?on_conflict=session_id,rubric_id`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      session_id,
      rubric_id: DEFAULT_RUBRIC_ID,
      status: "queued",
      started_at: new Date().toISOString(),
    }),
  });
  const t = await r.text(); log("eval_runs upsert ->", r.status, t || "(no body)");
  return r.ok;
}

/* ------------------ payload helpers ------------------ */
const isUuid = v => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const getMsg  = p => p?.message || null;

function deriveSessionId(msg) {
  const candidates = [msg?.callId, msg?.phoneCallId, msg?.conversationId];
  for (const c of candidates) if (isUuid(c)) return c;
  // deterministically mint a uuid from assistantId + first timestamp
  const seed = `${msg?.assistantId || ""}|${msg?.timestamp || Date.now()}`;
  const hash = crypto.createHash("sha1").update(seed).digest("hex");
  // make a uuid-like string from sha1 (not RFC4122 strict, but 36 chars)
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
}

function timesFromMsg(msg) {
  const ts = typeof msg?.timestamp === "number" ? new Date(msg.timestamp) : new Date();
  const ended_at   = ts.toISOString();
  const started_at = new Date(ts.getTime() - 2*60*1000).toISOString();
  return { started_at, ended_at };
}

function renderTranscriptFromMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  return messages
    .map(m => {
      const text = m.message ?? m.content ?? m.text ?? "";
      const who =
        m.role === "user"      ? "User" :
        m.role === "assistant" ? "AI"   :
        (m.role || "system");
      return `${who}: ${text}`.trim();
    })
    .filter(Boolean)
    .join("\n");
}

/* ------------------ handler ------------------ */
exports.handler = async (event) => {
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    log("📞 webhook preview:", raw.slice(0, 900));

    // quick diagnostics
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
      if (q.diag === "env") {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: true,
            SUPABASE_URL: !!SUPABASE_URL,
            SERVICE_KEY: !!SERVICE_KEY,
            EVAL_DEFAULT_RUBRIC_ID: DEFAULT_RUBRIC_ID,
            SKIP_SIG,
          }),
        };
      }
      return { statusCode: 200, body: "vapi-webhook alive" };
    }

    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"] || "";
    if (!verifySignature(raw, sig)) return { statusCode: 401, body: "bad sig" };

    const payload = JSON.parse(raw);
    const msg = getMsg(payload);
    if (!msg) return { statusCode: 200, body: "no message" };

    // Build/derive a session id that stays stable for all related messages
    const session_id = deriveSessionId(msg);

    // If we see an assistantId early, attach it so the dashboard shows a name
    if (msg.assistantId) {
      await upsertSession({ id: session_id, assistant_id: msg.assistantId, channel: "voice" });
    }

    // 1) Accumulate transcript during the call on speech/conversation updates
    if (["speech-update", "conversation-update", "user-interrupted"].includes(msg.type)) {
      // Try to turn whatever messages are present into readable lines, then append
      const chunk = renderTranscriptFromMessages(msg?.artifact?.messages || msg?.conversation || []);
      if (chunk) {
        const existing = await readTranscript(session_id);
        const merged = existing ? `${existing}\n${chunk}` : chunk;
        await writeTranscript(session_id, merged);
      }
      return { statusCode: 200, body: "ok" };
    }

    // 2) Finalize on end events
    if (msg.type === "status-update" && String(msg.status).toLowerCase() === "ended") {
      // do nothing here; wait for the end-of-call-report to carry summary/analysis
      return { statusCode: 200, body: "ended ack" };
    }

    if (msg.type === "end-of-call-report") {
      const { started_at, ended_at } = timesFromMsg(msg);
      const aht_seconds = Math.max(0, Math.round((new Date(ended_at) - new Date(started_at)) / 1000));

      // pull transcript lines from:
      //   (a) previously accumulated transcript rows
      //   (b) artifact.messages on the report itself (fallback)
      let transcript = await readTranscript(session_id);
      if (!transcript) {
        const fromReport = renderTranscriptFromMessages(msg?.artifact?.messages || []);
        if (fromReport) {
          transcript = fromReport;
          await writeTranscript(session_id, transcript);
        }
      }

      // try to fill assistant_id if still empty via calls table
      let assistant_id = msg?.assistantId || await lookupAssistantFromCalls(session_id);

      const summary =
        msg?.analysis?.summary ||
        msg?.artifact?.summary ||
        null;

      const hangup_reason = msg?.endedReason || "customer-ended-call";

      const row = {
        id: session_id,
        assistant_id: assistant_id || null,
        started_at,
        ended_at,
        channel: "voice",
        outcome: "ended",
        summary,
        hangup_reason,
        aht_seconds,
      };

      log("UPSERT SESSION ROW:", row);
      const up = await upsertSession(row);
      if (!up.ok) {
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ok: false, where: "sessions", status: up.status, text: up.text }),
        };
      }

      // enqueue eval so the SCORE column populates
      await queueEval(session_id);

      return { statusCode: 200, body: "ok" };
    }

    // ignore other noise
    return { statusCode: 200, body: "ignored" };
  } catch (err) {
    console.error("webhook error", err);
    return { statusCode: 500, body: "server error" };
  }
};
