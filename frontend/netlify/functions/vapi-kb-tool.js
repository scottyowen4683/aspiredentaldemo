// frontend/netlify/functions/vapi-kb-tool.js
//
// Vapi Custom Tool Webhook (STRICT FORMAT):
// - Always returns HTTP 200
// - Always returns { results: [ { toolCallId, result|error } ] }
// - result/error MUST be a single-line string (no \n)
//
// Function behavior:
// - Works with Vapi payload shape where tool calls live under body.message.toolCalls
// - Extracts toolCallId reliably (MUST match Vapi call id)
// - Extracts query reliably (supports object or string arguments)
// - Resolves tenant via (1) assistantId mapping OR (2) URL ?tenant=moreton fallback
// - Embeds query and queries Supabase RPC match_knowledge_chunks
// - Returns a compact single-line string summary of top KB chunks

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

/* =========================
   UTILITIES
   ========================= */

function loadAssistantMap() {
  const p = path.join(__dirname, "tenants", "assistant-map.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function singleLine(str) {
  if (str == null) return "";
  return String(str)
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function okVapi(toolCallId, resultStr) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify({
      results: [
        {
          toolCallId: String(toolCallId || "call_unknown"),
          result: singleLine(resultStr || ""),
        },
      ],
    }),
  };
}

function errVapi(toolCallId, errorStr) {
  return {
    statusCode: 200, // IMPORTANT: Vapi requires 200 even on error
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify({
      results: [
        {
          toolCallId: String(toolCallId || "call_unknown"),
          error: singleLine(errorStr || "Unknown error"),
        },
      ],
    }),
  };
}

function pickFirstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// Vapi sometimes wraps everything under body.message
function unwrapPayload(body) {
  if (body && typeof body === "object" && body.message && typeof body.message === "object") {
    return body.message;
  }
  return body || {};
}

function getTenantFromUrl(event) {
  try {
    const u = new URL(event.rawUrl || event.headers?.referer || "http://x/");
    const tenant = u.searchParams.get("tenant");
    return tenant && tenant.trim() ? tenant.trim() : null;
  } catch {
    const tenant = event.queryStringParameters?.tenant;
    return tenant && String(tenant).trim() ? String(tenant).trim() : null;
  }
}

function extractFirstToolCall(payload) {
  // Vapi log shows payload.toolCalls exists inside message
  const tc =
    payload?.toolCalls?.[0] ||
    payload?.toolCallList?.[0] ||
    payload?.tool_call_list?.[0] ||
    null;

  // Sometimes it’s nested again under toolWithToolCallList[].toolCall
  if (!tc && Array.isArray(payload?.toolWithToolCallList) && payload.toolWithToolCallList[0]?.toolCall) {
    return payload.toolWithToolCallList[0].toolCall;
  }

  return tc;
}

function extractToolCallId(payload) {
  const tc = extractFirstToolCall(payload);
  return pickFirstString(
    payload?.toolCallId,
    payload?.tool_call_id,
    tc?.id
  );
}

function extractQuery(payload) {
  const tc = extractFirstToolCall(payload);

  // direct common fields
  const direct = pickFirstString(payload?.query, payload?.input, payload?.text);
  if (direct) return direct;

  const args = tc?.function?.arguments;

  // Your log shows arguments can be an OBJECT: { query: "..." }
  if (args && typeof args === "object") {
    return pickFirstString(args.query, args.input);
  }

  // Or arguments could be a JSON string: "{\"query\":\"...\"}"
  if (typeof args === "string" && args.trim()) {
    try {
      const parsed = JSON.parse(args);
      return pickFirstString(parsed?.query, parsed?.input) || args.trim();
    } catch {
      return args.trim();
    }
  }

  return null;
}

function extractAssistantId(body, payload) {
  // In your logs, assistant info is outside message: body.assistant.id
  return pickFirstString(
    body?.assistantId,
    body?.assistant_id,
    body?.assistant?.id,
    body?.call?.assistantId,
    body?.call?.assistant?.id,
    body?.metadata?.assistantId,
    body?.metadata?.assistant?.id,

    // sometimes can be inside message too
    payload?.assistantId,
    payload?.assistant_id,
    payload?.assistant?.id
  );
}

function formatKbResults(results, maxChars = 3500) {
  if (!Array.isArray(results) || results.length === 0) {
    return "No relevant knowledge base entries found.";
  }

  let out = "KB matches: ";
  for (const r of results) {
    const part = `[${r.section || "KB"} | ${r.source || "source"}] ${r.content || ""}`;
    const cleaned = singleLine(part);

    if (out.length + cleaned.length + 3 > maxChars) break;
    out += cleaned + " || ";
  }

  return out.replace(/\s\|\|\s$/, "").trim();
}

/* =========================
   HANDLER
   ========================= */

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: "",
    };
  }

  // Vapi expects POST
  if (event.httpMethod !== "POST") {
    return errVapi("call_unknown", "Method Not Allowed (POST required).");
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return errVapi("call_unknown", "Invalid JSON body.");
  }

  // Unwrap Vapi message envelope
  const payload = unwrapPayload(body);

  // Logs (keep)
  console.log("VAPI_RAW_BODY:", JSON.stringify(body).slice(0, 5000));
  console.log("VAPI_QUERYSTRING:", event.queryStringParameters);

  // Extract tool call + query correctly from payload.message.*
  const toolCallId = extractToolCallId(payload) || "call_unknown";
  const query = extractQuery(payload);
  const assistantId = extractAssistantId(body, payload);

  // Tenant resolution:
  // (A) assistantId -> tenant via assistant-map.json
  // (B) fallback: URL query param ?tenant=moreton
  const tenantFromUrl = getTenantFromUrl(event);

  if (!query) {
    return errVapi(
      toolCallId,
      "Missing query. Vapi did not supply arguments.query. Check tool schema required:['query'] and assistant tool call."
    );
  }

  const map = (() => {
    try {
      return loadAssistantMap();
    } catch {
      return {};
    }
  })();

  let tenant_id = null;
  if (assistantId && map[assistantId]) tenant_id = map[assistantId];
  if (!tenant_id && tenantFromUrl) tenant_id = tenantFromUrl;

  if (!tenant_id) {
    return errVapi(
      toolCallId,
      `Missing tenant id. assistantId not mapped and no ?tenant= provided. assistantId=${assistantId || "null"}`
    );
  }

  // Env vars
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

  if (!SUPABASE_URL) return errVapi(toolCallId, "Server misconfig: Missing SUPABASE_URL.");
  if (!SUPABASE_SERVICE_ROLE_KEY)
    return errVapi(toolCallId, "Server misconfig: Missing SUPABASE_SERVICE_ROLE_KEY.");
  if (!OPENAI_API_KEY) return errVapi(toolCallId, "Server misconfig: Missing OPENAI_API_KEY.");

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const emb = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: query,
    });

    const query_embedding = emb.data?.[0]?.embedding;
    if (!query_embedding) {
      return errVapi(toolCallId, "Embedding failed: no embedding returned.");
    }

    const topK = 6;

    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding,
      match_count: topK,
      tenant_filter: tenant_id,
    });

    if (error) {
      return errVapi(toolCallId, `Supabase RPC failed: ${singleLine(JSON.stringify(error))}`);
    }

    const results = (data || []).map((r) => ({
      id: r.id,
      source: r.source,
      section: r.section,
      content: r.content,
      similarity: r.similarity,
    }));

    const resultStr = formatKbResults(results);
    return okVapi(toolCallId, resultStr);
  } catch (e) {
    return errVapi(toolCallId, `KB search failed: ${singleLine(e?.message || e)}`);
  }
};
