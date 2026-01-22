// frontend/netlify/functions/vapi-kb-tool.js
//
// Vapi Custom Tool Webhook (STRICT FORMAT):
// - Always returns HTTP 200
// - Always returns { results: [ { toolCallId, result|error } ] }
// - result/error MUST be a single-line string (no \n)
//
// Function behavior:
// - Extracts toolCallId from Vapi payload
// - Extracts query from Vapi payload
// - Resolves tenant via (1) assistantId mapping OR (2) URL ?tenant=moreton fallback
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

function extractToolCallId(body) {
  // Vapi may send this in different shapes
  return pickFirstString(
    body?.toolCallId,
    body?.tool_call_id,
    body?.toolCall?.id,
    body?.tool_call?.id,
    body?.message?.toolCallId,
    body?.message?.toolCall?.id,
    body?.call?.toolCallId
  );
}

function extractQuery(body) {
  // Your tool parameter is "query" in Vapi, but it often arrives nested.
  return pickFirstString(
    body?.query,
    body?.input,
    body?.text,
    body?.arguments?.query,
    body?.arguments?.input,
    body?.params?.query,
    body?.params?.input,
    body?.toolCall?.arguments?.query,
    body?.toolCall?.arguments?.input,
    body?.message?.toolCall?.arguments?.query,
    body?.message?.toolCall?.arguments?.input,
    body?.tool_call?.arguments?.query,
    body?.tool_call?.arguments?.input
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

function getTenantFromUrl(event) {
  try {
    const u = new URL(event.rawUrl || event.headers?.referer || "http://x/");
    // Netlify provides rawUrl in most environments
    const tenant = u.searchParams.get("tenant");
    return tenant && tenant.trim() ? tenant.trim() : null;
  } catch {
    // fallback parse from event.queryStringParameters
    const tenant = event.queryStringParameters?.tenant;
    return tenant && String(tenant).trim() ? String(tenant).trim() : null;
  }
}

function formatKbResults(results, maxChars = 3500) {
  if (!Array.isArray(results) || results.length === 0) {
    return "No relevant knowledge base entries found.";
  }

  // Build a compact single-line response the model can use.
  // Keep it short enough to avoid truncation / tool limits.
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
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: "",
    };
  }

  // Vapi expects POST
  if (event.httpMethod !== "POST") {
    // Still return 200 with error envelope to keep Vapi happy
    return errVapi("call_unknown", "Method Not Allowed (POST required).");
  }

  let body = {};
try {
  body = event.body ? JSON.parse(event.body) : {};
} catch {
  return errVapi("call_unknown", "Invalid JSON body.");
}

console.log("VAPI_RAW_BODY:", JSON.stringify(body).slice(0, 5000));
console.log("VAPI_QUERYSTRING:", event.queryStringParameters);


  const toolCallId = extractToolCallId(body) || "call_unknown";
  const query = extractQuery(body);
  const assistantId = extractAssistantId(body);

  // Tenant resolution:
  // (A) assistantId -> tenant via assistant-map.json
  // (B) fallback: URL query param ?tenant=moreton
  const tenantFromUrl = getTenantFromUrl(event);

  if (!query) {
    return errVapi(
      toolCallId,
      "Missing query. Ensure the Vapi tool has required parameter 'query' and the assistant is passing it."
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
