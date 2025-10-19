// netlify/functions/vapi-webhook.js
const crypto = require("crypto");

// ---------- Env ----------
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPI_SECRET   = process.env.VAPI_WEBHOOK_SECRET || "";
const DISABLE_SIG   = process.env.DISABLE_SIGNATURE_CHECK === "1";
const DEFAULT_RUBRIC_ID =
  process.env.EVAL_DEFAULT_RUBRIC_ID || "43d9b1fe-570f-4c97-abdb-fbbb73ef3d08";

// ---------- Utils ----------
const log = (...a) => { try { console.log(...a); } catch {} };

function verifySignature(raw, sig) {
  if (DISABLE_SIG) return true;
  if (!sig || !VAPI_SECRET) return false;
  const h = crypto.createHmac("sha256", VAPI_SECRET);
  h.update(raw, "utf8");
  const digest = `sha256=${h.digest("hex")}`;
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig)); }
  catch { return false; }
}

function mapStatus(s) {
  const m = {
    queued: "created",
    created: "created",
    ringing: "in-progress",
    "in-progress": "in-progress",
    inprogress: "in-progress",
    completed: "ended",
    ended: "ended",
    failed: "ended",
    busy: "ended",
    canceled: "ended",
    "no-answer": "ended",
    noanswer: "ended",
  };
  return m[String(s || "").toLowerCase()] || "unknown";
}

// ---------- Supabase helpers ----------
const SBASE = {
  async fetch(path, init = {}) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    return res;
  },
  getSession: async (id) => {
    const r = await SBASE.fetch(`/rest/v1/sessions?id=eq.${id}&select=id,started_at,assistant_id&limit=1`);
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0] || null;
  },
  upsertSession: async (row) => {
    const r = await SBASE.fetch(`/rest/v1/sessions?on_conflict=id`, {
      method: "POST",
      body: JSON.stringify(row),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
    const text = await r.text();
    log("sessions upsert ->", r.status, text || "(no body)");
    return { ok: r.ok, status: r.status, text };
  },
  patchSession: async (id, patch) => {
    const r = await SBASE.fetch(`/rest/v1/sessions?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      headers: { Prefer: "return=minimal" },
    });
    const text = await r.text();
    log("sessions patch ->", r.status, text || "(no body)");
    return r.ok;
  },
  insertTurns: async (rows) => {
    if (!rows?.length) return true;
    const r = await SBASE.fetch(`/rest/v1/turns`, {
      method: "POST",
      body: JSON.stringify(rows),
      headers: { Prefer: "return=minimal" },
    });
    const text = await r.text();
    log("turns insert ->", r.status, text || "(no body)");
    return r.ok;
  },
  upsertEvalRun: async (session_id) => {
    const body = {
      session_id,
      rubric_id: DEFAULT_RUBRIC_ID,
      status: "queued",
      started_at: new Date().toISOString(),
    };
    const r = await SBASE.fetch(`/rest/v1/eval_runs?on_conflict=session_id,rubric_id`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
    const text = await r.text();
    log("eval_runs upsert ->", r.status, text || "(no body)");
    return r.ok;
  },
};

// ---------- Vapi payload helpers ----------
const msgOf = (p) => p?.message || null;
const dataOf = (p) => p?.data || p || null;

function deriveSessionId(payload) {
  const msg = msgOf(payload);
  const d = dataOf(payload);
  const call =
    d?.phoneCall || d?.call || d?.conversation || msg?.phoneCall || msg?.conversation || null;
  return (
    call?.id ||
    d?.id ||
    msg?.callId ||
    msg?.phoneCallId ||
    msg?.conversationId ||
    `fallback-${msg?.timestamp || Date.now()}`
  );
}

function assistantFrom(payload) {
  const msg = msgOf(payload);
  const d = dataOf(payload);
  const call = d?.phoneCall || d?.call || d?.conversation || msg?.phoneCall || msg?.conversation;
  return call?.assistantId || msg?.assistantId || null;
}

function statusFrom(payload) {
  const d = dataOf(payload);
  const call = d?.phoneCall || d?.call || d?.conversation;
  return mapStatus(call?.status);
}

function summaryFrom(payload) {
  const msg = msgOf(payload);
  return (
    msg?.analysis?.summary ||
    msg?.artifact?.summary ||
    null
  );
}

function recordingUrlFrom(payload) {
  const d = dataOf(payload);
  const call = d?.phoneCall || d?.call || d?.conversation;
  return call?.recordingUrl || d?.recordingUrl || null;
}

// ---------- Time handling ----------
async function ensureSessionStart(session_id, tsMillis) {
  if (!Number.isFinite(tsMillis)) return;
  const sess = await SBASE.getSession(session_id);
  const haveStart = sess?.started_at ? new Date(sess.started_at).getTime() : null;
  if (!haveStart || tsMillis < haveStart) {
    await SBASE.patchSession(session_id, {
      started_at: new Date(tsMillis).toISOString(),
      channel: "voice",
    });
  }
}

// ---------- Transcript capture ----------
function turnsFromConversationUpdate(session_id, payload) {
  const msg = msgOf(payload);
  const convo = payload?.conversation || msg?.conversation;
  const arr = msg?.artifact?.messages || convo?.messages || [];
  const ts = Number(msg?.timestamp) || Date.now();

  // We only persist simple user/assistant text lines to keep it lightweight
  const rows = [];
  for (const m of arr) {
    const role = m.role || m.speaker || m.name || "";
    const text = m.text || m.content || m.message || "";
    if (!text || !role) continue;
    if (!/^(user|assistant)$/i.test(role)) continue;
    rows.push({
      session_id,
      role: role.toLowerCase() === "user" ? "user" : "assistant",
      content: text,
      created_at: new Date(ts).toISOString(),
    });
  }
  return rows;
}

// ---------- Handler ----------
exports.handler = async (event) => {
  try {
    // Body
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const preview = rawBody.slice(0, 1000);
    log("📞 Incoming webhook body preview:", preview);

    // Diagnostics
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
      if (q.diag === "env") {
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: true,
            SUPABASE_URL_present: !!SUPABASE_URL,
            SERVICE_KEY_present: !!SERVICE_KEY,
            VAPI_SECRET_present: !!VAPI_SECRET || DISABLE_SIG,
            DEFAULT_RUBRIC_ID,
            DISABLE_SIG,
          }),
        };
      }
      return { statusCode: 200, body: "vapi-webhook alive" };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Signature
    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"] || "";
    if (!verifySignature(rawBody, sig)) return { statusCode: 401, body: "bad sig" };

    // Parse
    const payload = JSON.parse(rawBody);
    const msg = msgOf(payload);
    const session_id = deriveSessionId(payload);

    // 1) On ANY event: capture assistant_id if present & ensure/advance started_at
    const maybeAssistant = assistantFrom(payload);
    if (maybeAssistant) {
      await SBASE.patchSession(session_id, { assistant_id: maybeAssistant, channel: "voice" });
    }
    if (typeof msg?.timestamp === "number") {
      await ensureSessionStart(session_id, msg.timestamp);
    }

    // 2) For conversation updates, append simple turns so the transcript view has content
    if (msg?.type === "conversation-update") {
      const rows = turnsFromConversationUpdate(session_id, payload);
      if (rows.length) await SBASE.insertTurns(rows);
      return { statusCode: 200, body: "ok" };
    }

    // 3) Final event: end-of-call-report -> finalize session + queue eval
    if (msg?.type === "end-of-call-report") {
      const endedAtMs = Number(msg.timestamp) || Date.now();
      const ended_at = new Date(endedAtMs).toISOString();

      const sess = await SBASE.getSession(session_id);
      const started_at =
        sess?.started_at ? new Date(sess.started_at).toISOString() : ended_at;

      const aht_seconds = Math.max(
        0,
        Math.round((new Date(ended_at).getTime() - new Date(started_at).getTime()) / 1000)
      );

      const outcome = "ended";
      const summary = summaryFrom(payload);
      const recUrl = recordingUrlFrom(payload);
      const ended_reason = msg?.endedReason || "customer-ended-call";

      const row = {
        id: session_id,
        assistant_id: maybeAssistant || sess?.assistant_id || null,
        channel: "voice",
        started_at,
        ended_at,
        outcome,
        aht_seconds,
        summary,
        ended_reason,
        recording_url: recUrl,
        updated_at: new Date().toISOString(),
      };

      await SBASE.upsertSession(row);
      await SBASE.upsertEvalRun(session_id);

      return { statusCode: 200, body: "ok" };
    }

    // Ignore mid-call noise we don't use explicitly
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("webhook error", err);
    return { statusCode: 500, body: "server error" };
  }
};
