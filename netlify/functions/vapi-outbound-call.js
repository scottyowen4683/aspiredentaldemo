// netlify/functions/vapi-outbound-call.js
const VAPI_BASE_URL = "https://api.vapi.ai";

/**
 * Required Netlify env:
 * - VAPI_API_KEY
 * - VAPI_PHONE_NUMBER_ID    (Vapi "phone number ID", not the E.164)
 *
 * Optional:
 * - MAX_DAILY_CALLS         (number; 0 or unset = no limit)
 * - DEBUG_LOG=1             (prints verbose logs in Netlify function logs)
 */

const DEBUG = process.env.DEBUG_LOG === "1";
function log(...args) { if (DEBUG) console.log(...args); }

// ---------- Simple per-IP 24h limiter (in-memory; resets on cold start) ----------
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_CALLS = Number(process.env.MAX_DAILY_CALLS || "0"); // 0 = no cap
const ipLog = new Map(); // key: "<ip>:YYYY-MM-DD" -> { count, ts }

function getClientIp(event) {
  const xff = event.headers["x-forwarded-for"] || event.headers["x-real-ip"] || event.headers["client-ip"];
  if (!xff) return "unknown";
  // x-forwarded-for can be "client, proxy1, proxy2" - take the first
  return String(xff).split(",")[0].trim() || "unknown";
}

function checkAndCount(ip) {
  if (!MAX_DAILY_CALLS) return { ok: true, used: 0, limit: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;
  const rec = ipLog.get(key);

  if (!rec) {
    ipLog.set(key, { count: 1, ts: Date.now() });
    return { ok: true, used: 1, limit: MAX_DAILY_CALLS };
  }

  // reset if over a day old (defensive; we already key by date)
  if (Date.now() - rec.ts > DAY_MS) {
    ipLog.set(key, { count: 1, ts: Date.now() });
    return { ok: true, used: 1, limit: MAX_DAILY_CALLS };
  }

  if (rec.count >= MAX_DAILY_CALLS) {
    return { ok: false, used: rec.count, limit: MAX_DAILY_CALLS };
  }

  rec.count += 1;
  rec.ts = Date.now();
  ipLog.set(key, rec);
  return { ok: true, used: rec.count, limit: MAX_DAILY_CALLS };
}

// ---------- Helpers ----------
function normalizeAuNumber(input) {
  if (!input) return null;
  const n = String(input).replace(/\s+/g, "");
  // Accept 04xxxxxxxx and convert to +614xxxxxxxx
  if (/^04\d{8}$/.test(n)) return n.replace(/^0/, "+61");
  // Accept +61xxxxxxxxx (9 digits after +61)
  if (/^\+61\d{9}$/.test(n)) return n;
  return null;
}

// ---------- Main handler ----------
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const ip = getClientIp(event);
    const { to, assistantId, context } = JSON.parse(event.body || "{}");

    if (!to || !assistantId) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing to/assistantId" }) };
    }

    // Rate limit (soft)
    const gate = checkAndCount(ip);
    if (!gate.ok) {
      log(`CALL BLOCKED: ip=${ip} used=${gate.used}/${gate.limit}`);
      return {
        statusCode: 429,
        body: JSON.stringify({
          message: "Daily call limit reached. Try again tomorrow.",
          ip,
          limit: gate.limit,
        }),
      };
    }

    const API_KEY = process.env.VAPI_API_KEY;
    const PHONE_ID = process.env.VAPI_PHONE_NUMBER_ID;
    if (!API_KEY || !PHONE_ID) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Server missing VAPI_API_KEY or VAPI_PHONE_NUMBER_ID" }),
      };
    }

    const e164 = normalizeAuNumber(to);
    if (!e164) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Enter a valid Australian mobile: 04xxxxxxxx or +61xxxxxxxxx",
        }),
      };
    }

    const payload = {
      assistantId,
      type: "outbound-phone-call",
      phoneNumberId: PHONE_ID,
      customer: { number: e164 },
      metadata: { feature: "website-cta-outbound", ip, ...(context || {}) },
    };

    log("Outbound payload -> Vapi:", JSON.stringify(payload));
    const res = await fetch(`${VAPI_BASE_URL}/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    log("Vapi /call response:", res.status, text);

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ message: "Vapi error", status: res.status, details: text }),
      };
    }

    return { statusCode: 200, body: text };
  } catch (err) {
    console.error("outbound-call error:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Server error triggering call." }) };
  }
};
