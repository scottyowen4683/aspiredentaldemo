// frontend/netlify/functions/vapi-kb-tool.js
//
// Vapi Custom Tool Webhook (STRICT FORMAT):
// - Always returns HTTP 200
// - Always returns { results: [ { toolCallId, result|error } ] }
// - result/error MUST be a single-line string (no \n)
//
// Tenant resolution order (most reliable first):
// 1) tenantId sent in the webhook body (from your website widget / vapi-chat)
// 2) assistantId -> assistant-map.json (if assistantId is present)
// 3) URL query string ?tenant=moreton fallback
//
// Function behavior:
// - Extracts toolCallId from Vapi payload
// - Extracts query from Vapi payload
// - Embeds query and queries Supabase RPC match_knowledge_chunks
// - Returns a single-line string summary of top KB chunks

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
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Aspire-Webhook-Secret",
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Aspire-Webhook-Secret",
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

function extractToolCallId(body) {
  // Vapi may send this in different shapes
  return pickFirstString(
    body?.toolCallId,
    body?.tool_call_id,
    body?.toolCall?.id,
    body?.tool_call?.id,
    body?.message?.toolCallId,
    body?.message?.toolCall?.id,
    body?.call?.toolCallId,
    body?.message?.toolCalls?.[0]?.id,
    body?.message?.toolCallList?.[0]?.id
  );
}

function extractQuery(body) {
  // Your tool parameter is "query" in Vapi, but it often arrives nested.
  return pickFirstString(
    body?.query,
    body?.input,
    body?.text,
    body?.arguments?.query,
    body?.params?.query,
    body?.toolCall?.arguments?.query,
    body?.tool_call?.arguments?.query,
    body?.message?.toolCall?.arguments?.query,
    body?.message?.toolCalls?.[0]?.function?.arguments?.query,
    body?.message?.toolCallList?.[0]?.function?.arguments?.query
  );
}

function extractAssistantId(body) {
  return pickFirstString(
    body?.assistantId,
    body?.assistant_id,
    body?.assistant?.id,
    body?.call?.assistantId,
    body?.call?.assistant?.id,
    body?.metadata?.assistantId,
    body?.metadata?.assistant?.id
  );
}

function extractTenantId(body) {
  // Allow tenantId to be passed from your website widget / vapi-chat path
  return pickFirstString(
    body?.tenantId,
    body?.tenant_id,
    body?.metadata?.tenantId,
    body?.metadata?.tenant_id,
    body?.message?.tenantId,
    body?.message?.metadata?.tenantId
  );
}

function getTenantFromUrl(event) {
  // Netlify gives queryStringParameters reliably
  const qsTenant = event.queryStringParameters?.tenant;
  if (qsTenant && String(qsTenant).trim()) return String(qsTenant).trim();

  // Also try rawUrl if available
  try {
    const u = new URL(event.rawUrl || "http://x/");
    const tenant = u.searchParams.get("tenant");
    return tenant && tenant.trim() ? tenant.trim() : null;
  } catch {
    return null;
  }
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Aspire-Webhook-Secret",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return errVapi("call_unknown", "Method Not Allowed (POST required).");
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return errVapi("call_unknown", "Invalid JSON body.");
  }

  // Debug logs (keep while stabilising)
  console.log("VAPI_RAW_BODY:", JSON.stringify(body).slice(0, 5000));
  console.log("VAPI_QUERYSTRING:", event.queryStringParameters);

  const toolCallId = extractToolCallId(body) || "call_unknown";
  const query = extractQuery(body);
  const assistantId = extractAssistantId(body);

  // Tenant resolution
  const tenantFromBody = extractTenantId(body);
  const tenantFromUrl = getTenantFromUrl(event);

  if (!query) {
    return errVapi(
      toolCallId,
      "Missing query. Ensure the Vapi tool has required parameter 'query' and the assistant is passing it."
    );
  }

  let tenant_id = null;

  // 1) Explicit tenantId passed in body
  if (tenantFromBody) tenant_id = tenantFromBody;

  // 2) assistantId map
  if (!tenant_id) {
    const map = (() => {
      try {
        return loadAssistantMap();
      } catch {
        return {};
      }
    })();
    if (assistantId && map[assistantId]) tenant_id = map[assistantId];
  }

  // 3) URL fallback
  if (!tenant_id && tenantFromUrl) tenant_id = tenantFromUrl;

  if (!tenant_id) {
    return errVapi(
      toolCallId,
      `Missing tenant id. No tenantId in body, assistantId not mapped, and no ?tenant= provided. assistantId=${assistantId || "null"}`
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

    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding,
      match_count: 6,
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

    return okVapi(toolCallId, formatKbResults(results));
  } catch (e) {
    return errVapi(toolCallId, `KB search failed: ${singleLine(e?.message || e)}`);
  }
};
