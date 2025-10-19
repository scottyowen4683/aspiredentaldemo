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
  const today = new Date().toISOString().slice(0, 10);
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
  if (/^04\d{8}$/.test(n)) return n.replace(/^0/, "+61");
  if (/^\+61\d{9}$/.test(n)) return n;
  return null;
}

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

export const handler = async (event) => {
  if (event.httpMethod === "GET") {
    const diag = (event.queryStringParameters || {}).diag;
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
          },
        }),
      };
    }
    if (diag === "place") {
      return { statusCode: 400, body: "Use POST from your UI for place; env check is GET only." };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, msg: "outbound-call alive" }) };
  }

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

    // 1) Place the call with Vapi
    const payload = {
      assistantId,
      type: "outbound-phone-call",
      phoneNumberId: PHONE_ID,
      customer: { number: e164 },
      metadata: { feature: "website-cta-outbound", ip, ...(context || {}) },
    };
    log("Outbound payload -> Vapi", JSON.stringify(payload));
    const res = await fetch(`${VAPI_BASE_URL}/call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    log("Vapi /call response:", res.status, text);
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ message: "Vapi error", status: res.status, details: text }) };
    }

    // 2) Parse Vapi response and upsert the call row immediately
    let callObj;
    try { callObj = JSON.parse(text); } catch { callObj = null; }
    const call_id = callObj?.id || null;

    const row = {
      call_id,
      assistant_id: assistantId,
      direction: "outbound",
      from_number: null,              // unknown until provider reports
      to_number: e164,
      status: "created",              // Vapi returns 'queued' -> map to created
      started_at: callObj?.createdAt || new Date().toISOString(),
      ended_at: null,
      duration_sec: null,
      transcript: null,
      top_questions: null,
      raw: { source: "placed-from-outbound-function", vapi: callObj || text },
      last_event_type: "call.created (local)",
      updated_at: new Date().toISOString(),
    };

    if (row.call_id) {
      const up = await supabaseUpsertCall(row);
      log("Supabase upsert after place:", up.status, up.text);
      if (!up.ok) {
        // Don’t block the user’s call if DB write fails — still return success for the call
        log("WARNING: DB write failed but call placed.");
      }
    } else {
      log("WARNING: Vapi response had no id; skipping DB upsert for creation.");
    }

    // 3) Return Vapi’s response to the UI
    return { statusCode: 200, body: text };
  } catch (err) {
    console.error("outbound-call error:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error triggering call." }) };
  }
};
