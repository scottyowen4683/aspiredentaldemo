// netlify/functions/vapi-outbound-call.js
const VAPI_BASE_URL = "https://api.vapi.ai";

/**
 * Required Netlify env:
 * - VAPI_API_KEY
 * - VAPI_PHONE_NUMBER_ID    (Vapi "phone number ID", not the E.164 number)
 *
 * Optional:
 * - MAX_DAILY_CALLS   (0 or unset = no limit; number per IP per day)
 * - DEBUG_LOG=1
 */
const DEBUG = process.env.DEBUG_LOG === "1";
function log(...a) { if (DEBUG) console.log(...a); }

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_CALLS = Number(process.env.MAX_DAILY_CALLS || "0"); // 0 = no cap
const ipBudget = new Map(); // key "<ip>:YYYY-MM-DD" -> { count, ts }

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

async function callVapi(payload, apiKey) {
  // Try /call first (current), then /call/phone for older route compatibility
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  // Attempt #1: POST /call
  let res = await fetch(`${VAPI_BASE_URL}/call`, { method: "POST", headers, body: JSON.stringify(payload) });
  let text = await res.text();
  if (DEBUG) console.log("Vapi /call ->", res.status, text);

  if (res.ok) return { ok: true, status: res.status, text };

  // If 404 or 400 indicating wrong route shape, try /call/phone
  if (res.status === 404 || res.status === 400) {
    const altPayload = {
      assistantId: payload.assistantId,
      phoneNumberId: payload.phoneNumberId,
      customer: payload.customer,
      metadata: payload.metadata || {},
    };
    const res2 = await fetch(`${VAPI_BASE_URL}/call/phone`, { method: "POST", headers, body: JSON.stringify(altPayload) });
    const text2 = await res2.text();
    if (DEBUG) console.log("Vapi /call/phone ->", res2.status, text2);
    if (res2.ok) return { ok: true, status: res2.status, text: text2 };
    return { ok: false, status: res2.status, text: text2 };
  }

  return { ok: false, status: res.status, text };
}

export const handler = async (event) => {
  // ---- GET diagnostics (browser only) ----
  if (event.httpMethod === "GET") {
    const url = new URL(event.rawUrl || `http://x${event.path}`);
    const diag = url.searchParams.get("diag");
    if (diag === "env") {
      const urlHint = (process.env.VAPI_PHONE_NUMBER_ID || "").slice(0, 4) + (process.env.VAPI_PHONE_NUMBER_ID ? "****" : "");
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          env: {
            VAPI_API_KEY_present: Boolean(process.env.VAPI_API_KEY),
            VAPI_PHONE_NUMBER_ID_present: Boolean(process.env.VAPI_PHONE_NUMBER_ID),
            MAX_DAILY_CALLS,
            DEBUG_LOG: DEBUG,
            PHONE_ID_hint: urlHint || null,
          },
          how_to_place: `Add ?diag=place&to=04xxxxxxxx&assistantId=<your-assistant-id> to this URL to trigger a test call.`,
        }),
      };
    }
    if (diag === "place") {
      const to = url.searchParams.get("to");
      const assistantId = url.searchParams.get("assistantId");
      if (!to || !assistantId) {
        return { statusCode: 400, body: JSON.stringify({ message: "Missing to and/or assistantId query params" }) };
      }
      const ip = getClientIp(event);
      const e164 = normalizeAuNumber(to);
      if (!e164) return { statusCode: 400, body: JSON.stringify({ message: "Enter 04xxxxxxxx or +61xxxxxxxxx" }) };

      const API_KEY = process.env.VAPI_API_KEY;
      const PHONE_ID = process.env.VAPI_PHONE_NUMBER_ID;
      if (!API_KEY || !PHONE_ID) return { statusCode: 500, body: JSON.stringify({ message: "Missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID" }) };

      const payload = {
        assistantId,
        type: "outbound-phone-call",
        phoneNumberId: PHONE_ID,
        customer: { number: e164 },
        metadata: { feature: "diag-place", ip },
      };
      const result = await callVapi(payload, API_KEY);
      const statusCode = result.ok ? 200 : (result.status || 502);
      return { statusCode, body: JSON.stringify({ ok: result.ok, status: result.status, vapi: result.text }) };
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, msg: "outbound-call alive" }) };
  }

  // ---- POST (normal site flow) ----
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

    const e164 = normalizeAuNumber(to);
    if (!e164) return { statusCode: 400, body: JSON.stringify({ message: "Enter 04xxxxxxxx or +61xxxxxxxxx" }) };

    const payload = {
      assistantId,
      type: "outbound-phone-call",
      phoneNumberId: PHONE_ID,
      customer: { number: e164 },
      metadata: { feature: "website-cta-outbound", ip, ...(context || {}) },
    };

    log("Outbound payload -> Vapi", JSON.stringify(payload));
    const result = await callVapi(payload, API_KEY);
    log("Outbound Vapi result", result.status, result.text);

    if (!result.ok) {
      return { statusCode: result.status || 502, body: JSON.stringify({ message: "Vapi error", status: result.status, details: result.text }) };
    }
    return { statusCode: 200, body: result.text };
  } catch (err) {
    console.error("outbound-call error:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error triggering call." }) };
  }
};
