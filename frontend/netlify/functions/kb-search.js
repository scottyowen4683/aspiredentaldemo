// frontend/netlify/functions/kb-search.js

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

function loadAssistantMap() {
  const p = path.join(__dirname, "tenants", "assistant-map.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function singleLine(str) {
  return String(str || "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function vapiRespond(toolCallId, resultString, errorString) {
  const body = {
    results: [
      errorString
        ? { toolCallId, error: singleLine(errorString) }
        : { toolCallId, result: singleLine(resultString) },
    ],
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-aspire-webhook-secret",
    },
    body: JSON.stringify(body),
  };
}

function httpJson(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-aspire-webhook-secret",
    },
    body: JSON.stringify(bodyObj),
  };
}

/**
 * Very light intent detection for “lookup” style questions.
 * Keep it deterministic. No LLM here.
 */
function detectLookupType(q) {
  const s = q.toLowerCase();

  // bins / collection day
  const binSignals = [
    "bin day",
    "bin collection",
    "collection day",
    "when is my bin",
    "when is bin",
    "general waste",
    "recycling",
    "green waste",
    "green bin",
    "wheelie",
  ];
  if (binSignals.some((x) => s.includes(x))) return "bins";

  return null;
}

/**
 * Extract a suburb-ish token.
 * Works for common patterns:
 * - "Griffin"
 * - "bin day griffin"
 * - "in Griffin"
 * - "Griffin general waste bin day"
 */
function extractSuburb(q) {
  const raw = String(q || "").trim();
  if (!raw) return "";

  // If it's a single word, treat as suburb candidate
  if (/^[A-Za-z][A-Za-z\s'-]{1,40}$/.test(raw) && raw.split(/\s+/).length <= 3) {
    // e.g. "Griffin", "North Lakes"
    return raw;
  }

  // "in <suburb>"
  const m = raw.match(/\bin\s+([A-Za-z][A-Za-z\s'-]{1,40})\b/i);
  if (m && m[1]) return m[1].trim();

  // Try last token group after common phrases
  const m2 = raw.match(/(?:bin day|collection day|bin collection)\s+([A-Za-z][A-Za-z\s'-]{1,40})/i);
  if (m2 && m2[1]) return m2[1].trim();

  return "";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-aspire-webhook-secret",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return httpJson(405, { error: "Method Not Allowed" });
  }

  // ---- Security gate ----
  const requiredSecret = process.env.ASPIRE_WEBHOOK_SECRET;
  if (requiredSecret) {
    const provided =
      event.headers["x-aspire-webhook-secret"] ||
      event.headers["X-Aspire-Webhook-Secret"] ||
      event.headers["x-aspire-webhook-secret".toLowerCase()];

    if (!provided || provided !== requiredSecret) {
      const safeToolCallId = "unknown";
      return vapiRespond(safeToolCallId, "", "Unauthorized: missing or invalid webhook secret");
    }
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  const toolCallId = body?.toolCallId || body?.id || body?.tool_call_id || "unknown";

  try {
    const query = body.query || body.input || "";
    const qs = event.queryStringParameters || {};
    const tenantFromUrl = qs.tenant ? String(qs.tenant) : "";

    const assistantId = body.assistantId ? String(body.assistantId) : "";
    let tenant_id = tenantFromUrl;

    if (!tenant_id) {
      if (!assistantId) {
        return vapiRespond(toolCallId, "", "Missing tenant (use ?tenant=...) and missing assistantId");
      }
      const map = loadAssistantMap();
      tenant_id = map[assistantId];
      if (!tenant_id) {
        return vapiRespond(toolCallId, "", `assistantId is not mapped to a tenant: ${assistantId}`);
      }
    }

    if (!query || typeof query !== "string") {
      return vapiRespond(toolCallId, "", "Missing query");
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

    if (!SUPABASE_URL) return vapiRespond(toolCallId, "", "Missing SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) return vapiRespond(toolCallId, "", "Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!OPENAI_API_KEY) return vapiRespond(toolCallId, "", "Missing OPENAI_API_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const topK = Number(body.topK || 6);

    // -----------------------------
    // 1) METADATA-FIRST LOOKUP
    // -----------------------------
    const lookupType = detectLookupType(query);
    let rows = [];

    if (lookupType === "bins") {
      const suburb = extractSuburb(query);
      // Only attempt metadata lookup if we have
