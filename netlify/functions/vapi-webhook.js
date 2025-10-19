// netlify/functions/vapi-webhook.js
// CommonJS (Node 18+ on Netlify), no external deps required.

const crypto = require("crypto");

// ---- Env ----
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DISABLE_SIG   = process.env.DISABLE_SIGNATURE_CHECK === "1"; // keep "1" while testing
const VAPI_SECRET   = process.env.VAPI_WEBHOOK_SECRET || "";       // optional while DISABLE_SIG=1
const DEFAULT_RUBRIC_ID =
  process.env.EVAL_DEFAULT_RUBRIC_ID || "43d9b1fe-570f-4c97-abdb-fbbb73ef3d08";

// ---- Small utils ----
function log(...a) { try { console.log(...a); } catch {} }

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
    "no-answer": "ended",
    canceled: "ended",
  };
  return m[String(s || "").toLowerCase()] || "unknown";
}

// ---- Supabase helpers (DIAGNOSTIC returns) ----
async function sbUpsertSession(row) {
  const url = `${SUPABASE_URL}/rest/v1/sessions?on_conflict=id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      // return=minimal keeps reply small; we still read body for diag text
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  log("sessions upsert ->", res.status, text || "(no body)");
  return { ok: res.ok, status: res.status, text };
}

async function sbUpsertEvalRun(session_id) {
  const url = `${SUPABASE_URL}/rest/v1/eval_runs?on_conflict=session_id,rubric_id`;
  const body = {
    session_id,
    rubric_id: DEFAULT_RUBRIC_ID,
    status: "queued",
    started_at: new Date().toISOString(),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  log("eval_runs upsert ->", res.status, text || "(no body)");
  return { ok: res.ok, status: res.status, text };
}

// ---- Payload helpers ----
function getCall(payload) {
  const d = payload?.data || payload;
  return d?.phoneCall || d?.call || payload?.message?.phoneCall || null;
}
function getCallId(payload) {
  const d = payload?.data || payload;
  const msg = payload?.message;
  const call = getCall(payload);
  return call?.id || d?.id || msg?.callId || msg?.phoneCallId || null;
}
function getTimes(payload) {
  const msg   = payload?.message;
  const d     = payload?.data || payload;
  const call  = getCall(payload);
  const createdAt = call?.createdAt || d?.createdAt || (msg?.timestamp ? new Date(msg.timestamp).toISOString() : null);
  const started_at = call?.startedAt || createdAt || new Date().toISOString();
  const ended_at   = call?.endedAt || call?.completedAt || null;
  return { started_at, ended_at };
}
function getStatus(payload) {
  const call = getCall(payload);
  return mapStatus(call?.status);
}

// ---- Handler ----
exports.handler = async (event) => {
  try {
    // ---------- GET diagnostics ----------
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
            DEFAULT_RUBRIC_ID,
            DISABLE_SIGNATURE_CHECK: DISABLE_SIG,
          }),
        };
      }

      if (q.diag === "write") {
        // Minimal, schema-safe insert using ONLY columns present in your table
        const id = crypto.randomUUID();
        const row = {
          id,                                      // uuid
          started_at: new Date(Date.now() - 60_000).toISOString(),
          ended_at:   new Date().toISOString(),
          updated_at: new Date().toISOString(),
          assistant_id: null,                      // uuid or null (safe)
          channel: "voice",                        // text
          ip: "127.0.0.1",                         // inet accepts dotted string
          outcome: "ended",                        // text
          summary: "diagnostic insert from webhook",
          hangup_reason: null,                     // text
          cost_cents: null,                        // integer
        };

        const result = await sbUpsertSession(row);
        // Only queue eval if session insert succeeded
        let evalResult = null;
        if (result.ok) {
          evalResult = await sbUpsertEvalRun(id);
        }

        return {
          statusCode: result.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: result.ok,
            session_upsert: { status: result.status, text: result.text },
            eval_upsert: evalResult ? { status: evalResult.status, text: evalResult.text } : null,
            id,
          }),
        };
      }

      // plain heartbeat
      return { statusCode: 200, body: "vapi-webhook alive" };
    }

    // ---------- POST from Vapi ----------
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const sig = event.headers["x-vapi-signature"] || event.headers["X-Vapi-Signature"] || "";
    if (!verifySignature(raw, sig)) {
      log("bad signature");
      return { statusCode: 401, body: "bad sig" };
    }

    const payload = JSON.parse(raw);
    const id = getCallId(payload);
    if (!id) {
      log("Skipping: no call id in payload");
      return { statusCode: 200, body: "no id" };
    }

    const { started_at, ended_at } = getTimes(payload);
    const outcome = getStatus(payload);
    const call = getCall(payload);

    // Build a row using only columns that exist in your sessions schema
    const row = {
      id,                                // uuid
      assistant_id: call?.assistantId || null,  // uuid string or null
      started_at,                        // timestamptz
      ended_at,                          // timestamptz (may be null until end)
      updated_at: new Date().toISOString(),
      channel: "voice",                  // text
      ip: call?.metadata?.ip || null,    // inet (string OK), or null
      outcome,                           // text (created/in-progress/ended mapped)
      summary: call?.summary || null,    // text (short summary if provided)
      hangup_reason: call?.endedReason || null, // text
      cost_cents: call?.cost ? Math.round(Number(call.cost) * 100) : null, // integer
    };

    log("UPSERT SESSION ROW:", row);
    const up = await sbUpsertSession(row);
    if (!up.ok) {
      // Return the exact DB error to logs & caller for fast debugging
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, where: "sessions", status: up.status, text: up.text }),
      };
    }

    // Queue eval once the call is ended (has ended_at)
    if (outcome === "ended" && ended_at) {
      const ev = await sbUpsertEvalRun(id);
      if (!ev.ok) {
        // Still return 200 to Vapi, but include diagnostics
        log("Eval queue failed", ev.status, ev.text);
      }
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("webhook error", err);
    return { statusCode: 500, body: "server error" };
  }
};
