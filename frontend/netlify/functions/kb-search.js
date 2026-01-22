// frontend/netlify/functions/kb-search.js
//
// Vapi Custom Tool compatible KB search.
// - Reads tenant from querystring (?tenant=moreton) OR from assistant-map via assistantId
// - Embeds the query
// - Calls Supabase RPC match_knowledge_chunks
// - RETURNS VAPI REQUIRED FORMAT (HTTP 200 + results[] + toolCallId + single-line string)
//
// Security (optional but recommended):
// - If ASPIRE_WEBHOOK_SECRET is set in Netlify env, requests must include header:
//   x-aspire-webhook-secret: <value>

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
  // Vapi requires HTTP 200 always. Errors go inside results[].error (string). :contentReference[oaicite:2]{index=2}
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
      "Access-Control-Allow-Headers":
        "Content-Type, x-aspire-webhook-secret",
    },
    body: JSON.stringify(body),
  };
}

function httpJson(statusCode, bodyObj) {
  // For non-Vapi callers (optional)
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, x-aspire-webhook-secret",
    },
    body: JSON.stringify(bodyObj),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, x-aspire-webhook-secret",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return httpJson(405, { error: "Method Not Allowed" });
  }

  // ---- Security gate (recommended) ----
  // If you set ASPIRE_WEBHOOK_SECRET in Netlify env,
  // then Vapi MUST send x-aspire-webhook-secret header.
  const requiredSecret = process.env.ASPIRE_WEBHOOK_SECRET;
  if (requiredSecret) {
    const provided =
      event.headers["x-aspire-webhook-secret"] ||
      event.headers["X-Aspire-Webhook-Secret"] ||
      event.headers["x-aspire-webhook-secret".toLowerCase()];

    if (!provided || provided !== requiredSecret) {
      // For Vapi, still respond 200 but with tool error
      const safeToolCallId = "unknown";
      return vapiRespond(
        safeToolCallId,
        "",
        "Unauthorized: missing or invalid webhook secret"
      );
    }
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  // Vapi tool calls include toolCallId in the request context.
  // If it isn't present, we still return something usable.
  const toolCallId =
    body?.toolCallId ||
    body?.id ||
    body?.tool_call_id ||
    "unknown";

  try {
    // Accept query from body.query or body.input
    const query = body.query || body.input || "";

    // Tenant can be provided via URL query param (?tenant=moreton)
    const qs = event.queryStringParameters || {};
    const tenantFromUrl = qs.tenant ? String(qs.tenant) : "";

    // Or via assistantId -> tenant map (optional fallback)
    const assistantId = body.assistantId ? String(body.assistantId) : "";
    let tenant_id = tenantFromUrl;

    if (!tenant_id) {
      if (!assistantId) {
        // Vapi will show "No result returned" unless we respond in wrapper format
        return vapiRespond(
          toolCallId,
          "",
          "Missing tenant (use ?tenant=...) and missing assistantId"
        );
      }
      const map = loadAssistantMap();
      tenant_id = map[assistantId];
      if (!tenant_id) {
        return vapiRespond(
          toolCallId,
          "",
          `assistantId is not mapped to a tenant: ${assistantId}`
        );
      }
    }

    if (!query || typeof query !== "string") {
      return vapiRespond(toolCallId, "", "Missing query");
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

    if (!SUPABASE_URL)
      return vapiRespond(toolCallId, "", "Missing SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return vapiRespond(toolCallId, "", "Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!OPENAI_API_KEY)
      return vapiRespond(toolCallId, "", "Missing OPENAI_API_KEY");

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const topK = Number(body.topK || 6);

    const emb = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: query,
    });

    const query_embedding = emb.data[0].embedding;

    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding,
      match_count: topK,
      tenant_filter: tenant_id,
    });

    if (error) {
      return vapiRespond(
        toolCallId,
        "",
        `Supabase RPC failed: ${singleLine(JSON.stringify(error))}`
      );
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      return vapiRespond(
        toolCallId,
        "",
        `No KB matches found for tenant '${tenant_id}'`
      );
    }

    // Build a compact single-line “evidence bundle” for the assistant.
    // Keep it short-ish so it doesn’t bloat the tool response.
    const evidence = rows
      .slice(0, topK)
      .map((r, idx) => {
        const sec = r.section ? ` (${r.section})` : "";
        const src = r.source ? ` [${r.source}]` : "";
        const snippet = singleLine(r.content).slice(0, 380);
        return `${idx + 1}.${src}${sec} ${snippet}`;
      })
      .join(" | ");

    const result = `tenant=${tenant_id} | matches=${rows.length} | ${evidence}`;

    // ✅ Vapi-required wrapper response (HTTP 200) :contentReference[oaicite:3]{index=3}
    return vapiRespond(toolCallId, result, "");
  } catch (err) {
    return vapiRespond(toolCallId, "", err?.message || "Server error");
  }
};
