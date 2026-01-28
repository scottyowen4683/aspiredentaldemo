// netlify/functions/vapi-outbound-call.js
const VAPI_BASE_URL = "https://api.vapi.ai";

/**
 * Required Netlify env:
 * - VAPI_API_KEY
 * - VAPI_PHONE_NUMBER_ID
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 * - MAX_DAILY_CALLS (0 or unset = no limit)
 * - DEBUG_LOG=1
 */
const DEBUG = process.env.DEBUG_LOG === "1";
function log(...a) { if (DEBUG) console.log(...a); }

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_CALLS = Number(process.env.MAX_DAILY_CALLS || "0"); // 0 = no cap
const ipBudget = new Map();

function getClientIp(event) {
  const xff = event.headers["x-forwarded-for"] || event.headers["x-real-ip"] || event.headers["client-ip"] || event.headers["x-nf-client-connection-ip"];
  return (xff ? String(xff).split(",")[0].trim() : "unknown");
}
function checkAndCount(ip) {
  if (!MAX_DAILY_CALLS) return { ok: true, used: 0, limit: 0 };
  const today = new Date().toISOString().slice(0,10);
  const key = `${ip}:${today}`;
  const rec = ipBudget.get(key);
  if (!rec) { ipBudget.set(key, { count: 1, ts: Date.now() }); return { ok:true, used:1, limit:MAX_DAILY_CALLS }; }
  if (Date.now() - rec.ts > DAY_MS) { ipBudget.set(key, { count: 1, ts: Date.now() }); return { ok:true, used:1, limit:MAX_DAILY_CALLS }; }
  if (rec.count >= MAX_DAILY_CALLS) return { ok:false, used:rec.count, limit:MAX_DAILY_CALLS };
  rec.count += 1; rec.ts = Date.now(); ipBudget.set(key, rec);
  return { ok:true, used:rec.count, limit:MAX_DAILY_CALLS };
}

function normalizeAuNumber(input) {
  if (!input) return null;
  const n = String(input).replace(/\s+/g, "");
  if (/^04\d{8}$/.test(n)) return n.replace(/^0/, "+61"); // 04xxxxxxxx -> +61xxxxxxxxx
  if (/^\+61\d{9}$/.test(n)) return n;
  return null;
}

/** ---- DB helpers ---- */

// Writes a full row to the legacy 'calls' table (you already have this)
async function supabaseUpsertCall(row) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/calls?on_conflict=call_id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

// Writes a minimal row to 'sessions' (what your dashboard reads)
async function supabaseInsertSession({ call_id, assistantId, startedAt }) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Only include assistant_id if it's a valid UUID (your column is uuid)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sessionRow = {
    provider_session_id: call_id,                               // text
    channel: "voice",                                           // text
    started_at: startedAt || new Date().toISOString(),          // timestamptz
    ...(UUID_RE.test(assistantId) ? { assistant_id: assistantId } : {}),
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal", // no body on success
    },
    body: JSON.stringify(sessionRow),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

/** ---- Vapi helper ---- */
async function placeCallViaVapi(payload, apiKey) {
  // Primary route
  let res = await fetch(`${VAPI_BASE_URL}/call`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let text = await res.text();
  if (DEBUG) console.log("Vapi /call response:", res.status, text);

  // Fallback to /call/phone if older behavior is needed
  if (!res.ok && (res.status === 400 || res.status === 404)) {
    const altPayload = {
      assistantId: payload.assistantId,
      phoneNumberId: payload.phoneNumberId,
      customer: payload.customer,
      metadata: payload.metadata || {},
    };
    const res2 = await fetch(`${VAPI_BASE_URL}/call/phone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(altPayload),
    });
    const text2 = await res2.text();
    if (DEBUG) console.log("Vapi /call/phone response:", res2.status, text2);
    return { ok: res2.ok, status: res2.status, text: text2 };
  }

  return { ok: res.ok, status: res.status, text };
}

/** ---- Netlify function handler ---- */
exports.handler = async (event) => {
  // ---- GET diagnostics (env + manual place) ----
  if (event.httpMethod === "GET") {
    const qs = event.queryStringParameters || {};
    const diag = qs.diag;

    if (diag === "env") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          env: {
            VAPI_API_KEY_present: !!process.env.VAPI_API_KEY,
            VAPI_PHONE_NUMBER_ID_present: !!process.env.VAPI_PHONE_NUMBER_ID,
            SUPABASE_URL_present: !!process.env.SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY_present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            MAX_DAILY_CALLS,
            DEBUG_LOG: DEBUG,
          },
        }),
      };
    }

    if (diag === "place") {
      const toRaw = qs.to;
      const assistantId = qs.assistantId;
      if (!toRaw || !assistantId) {
        return { statusCode: 400, body: JSON.stringify({ message: "Missing to and/or assistantId query params" }) };
      }
      const e164 = normalizeAuNumber(toRaw);
      if (!e164) return { statusCode: 400, body: JSON.stringify({ message: "Enter 04xxxxxxxx or +61xxxxxxxxx" }) };

      const API_KEY = process.env.VAPI_API_KEY;
      const PHONE_ID = process.env.VAPI_PHONE_NUMBER_ID;
      if (!API_KEY || !PHONE_ID) return { statusCode: 500, body: JSON.stringify({ message: "Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID" }) };

      const payload = {
        assistantId,
        type: "outboundPhoneCall", // ✅ correct type
        phoneNumberId: PHONE_ID,
        customer: { number: e164 },
        metadata: { feature: "diag-place" },
      };

      const result = await placeCallViaVapi(payload, API_KEY);
      return { statusCode: result.ok ? 200 : (result.status || 502), body: JSON.stringify(result) };
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, msg: "outbound-call alive" }) };
  }

  // ---- POST (normal UI flow) ----
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const ip = getClientIp(event);
    const { to, assistantId, context } = JSON.parse(event.body || "{}");
    if (!to || !assistantId) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing to/assistantId" }) };
    }

    const gate = checkAndCount(ip);
    if (!gate.ok) {
      log(`CALL BLOCKED ip=${ip} used=${gate.used}/${gate.limit}`);
      return { statusCode: 429, body: JSON.stringify({ message: "Daily call limit reached. Try again tomorrow." }) };
    }

    const API_KEY = process.env.VAPI_API_KEY;
    const PHONE_ID = process.env.VAPI_PHONE_NUMBER_ID;
    if (!API_KEY || !PHONE_ID) {
      return { statusCode: 500, body: JSON.stringify({ message: "Server missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID" }) };
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ message: "Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }) };
    }

    const e164 = normalizeAuNumber(to);
    if (!e164) return { statusCode: 400, body: JSON.stringify({ message: "Enter 04xxxxxxxx or +61xxxxxxxxx" }) };

    // 1) Place the call (✅ fixed type)
    const payload = {
      assistantId,
      type: "outboundPhoneCall",
      phoneNumberId: PHONE_ID,
      customer: { number: e164 },
      metadata: { feature: "website-cta-outbound", ip, ...(context || {}) },
    };
    log("Outbound payload -> Vapi", JSON.stringify(payload));

    const result = await placeCallViaVapi(payload, API_KEY);
    if (!result.ok) {
      return { statusCode: result.status || 502, body: JSON.stringify({ message: "Vapi error", status: result.status, details: result.text }) };
    }

    // 2) Upsert into 'calls' (legacy table you already have)
    let callObj; try { callObj = JSON.parse(result.text); } catch { callObj = null; }
    const call_id = callObj?.id || null;

    const callsRow = {
      call_id,
      assistant_id: assistantId,
      direction: "outbound",
      from_number: null,
      to_number: e164,
      status: "created",
      started_at: callObj?.createdAt || new Date().toISOString(),
      ended_at: null,
      duration_sec: null,
      transcript: null,
      top_questions: null,
      raw: { source: "placed-from-outbound-function", vapi: callObj || result.text },
      last_event_type: "call.created (local)",
      updated_at: new Date().toISOString(),
    };

    if (callsRow.call_id) {
      const up1 = await supabaseUpsertCall(callsRow);
      log("Supabase upsert CALL after place:", up1.status, up1.text);
    } else {
      log("WARNING: Vapi response had no id; skipping CALLS upsert.");
    }

    // 3) Also insert a minimal 'sessions' row so the dashboard updates now
    if (call_id) {
      const up2 = await supabaseInsertSession({
        call_id,
        assistantId,
        startedAt: callObj?.createdAt,
      });
      log("Supabase upsert SESSION after place:", up2.status, up2.text);
    } else {
      log("WARNING: No call_id for sessions insert.");
    }

    // 4) Return Vapi’s response to the UI
    return { statusCode: 200, body: result.text };
  } catch (err) {
    console.error("outbound-call error:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error triggering call." }) };
  }
};
