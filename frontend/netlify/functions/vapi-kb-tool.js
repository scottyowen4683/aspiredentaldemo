// frontend/netlify/functions/vapi-kb-tool.js
//
// Vapi Custom Tool wrapper for your KB search.
// IMPORTANT: Vapi requires this response shape:
// { results: [ { toolCallId: "...", result: "..." } ] }
//
// This function:
// - extracts toolCallId + assistantId + query from Vapi’s request (handles multiple shapes)
// - maps assistantId -> tenant_id (assistant-map.json)
// - embeds query (OpenAI embeddings)
// - calls Supabase RPC match_knowledge_chunks
// - returns a SINGLE-LINE string in Vapi’s required wrapper format

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

// ---- helpers ----
function loadAssistantMap() {
  // This path is relative to the deployed function folder
  const p = path.join(__dirname, "tenants", "assistant-map.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function vapiOk(toolCallId, result) {
  // result MUST be a string and ideally single-line
  const singleLine =
    typeof result === "string"
      ? result.replace(/\s+/g, " ").trim()
      : JSON.stringify(result).replace(/\s+/g, " ").trim();

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      results: [
        {
          toolCallId: toolCallId || "unknown",
          result: singleLine,
        },
      ],
    }),
  };
}

function vapiErr(toolCallId, message) {
  // Still return 200 with a result string (Vapi expects results wrapper even on error)
  return vapiOk(toolCallId, `ERROR: ${message}`);
}

// Try to pull values from multiple possible shapes of Vapi payloads
function extractFromVapi(body) {
  const toolCallId =
    body?.toolCallId ||
    body?.message?.toolCallId ||
    body?.tool_call_id ||
    body?.id ||
    body?.message?.id ||
    null;

  const params =
    body?.parameters ||
    body?.toolInput ||
    body?.tool_input ||
    body?.arguments ||
    body?.args ||
    body?.input ||
    body ||
    {};

  const query =
    params?.query ||
    params?.question ||
    params?.text ||
    params?.input ||
    body?.query ||
    body?.input ||
    null;

  const assistantId =
    params?.assistantId ||
    params?.assistant_id ||
    body?.assistantId ||
    body?.assistant_id ||
    body?.assistant?.id ||
    body?.message?.assistantId ||
    null;

  const topK = Number(params?.topK || body?.topK || 6);

  return { toolCallId, assistantId, query, topK };
}

// Optional auth header protection (recommended)
function isAuthorised(event) {
  const secret = process.env.ASPIRE_WEBHOOK_SECRET;
  if (!secret) return true; // if you haven’t set it, don’t block calls

  const auth =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    event.headers?.AUTHORIZATION ||
    "";

  // Support: "Bearer <secret>" or just "<secret>"
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : auth.trim();
  return token === secret;
}

// ---- handler ----
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

  if (event.httpMethod !== "POST") {
    // Vapi will only call POST; return wrapper anyway
    return vapiOk("unknown", "ERROR: Method Not Allowed (use POST)");
  }

  if (!isAuthorised(event)) {
    // Still return wrapper
    const body = event.body ? safeJson(event.body) : {};
    const { toolCallId } = extractFromVapi(body);
    return vapiErr(toolCallId, "Unauthorised (bad or missing Authorization)");
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  const { toolCallId, assistantId, query, topK } = extractFromVapi(body);

  try {
    if (!assistantId) {
      return vapiErr(
        toolCallId,
        "Missing assistantId in tool request. Remove assistantId as a tool parameter and let Vapi pass it automatically (recommended), or ensure it’s included."
      );
    }

    if (!query || typeof query !== "string") {
      return vapiErr(toolCallId, "Missing query");
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

    if (!SUPABASE_URL) return vapiErr(toolCallId, "Missing SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return vapiErr(toolCallId, "Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!OPENAI_API_KEY) return vapiErr(toolCallId, "Missing OPENAI_API_KEY");

    const map = loadAssistantMap();
    const tenant_id = map[assistantId];

    if (!tenant_id) {
      return vapiErr(
        toolCallId,
        `assistantId is not mapped to a tenant (assistantId=${assistantId}). Check assistant-map.json`
      );
    }

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
      return vapiErr(toolCallId, "Embedding failed (no embedding returned)");
    }

    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding,
      match_count: topK,
      tenant_filter: tenant_id,
    });

    if (error) {
      return vapiErr(toolCallId, `Supabase RPC failed: ${error.message || ""}`);
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      return vapiOk(
        toolCallId,
        `No KB matches found for tenant '${tenant_id}' for query: ${query}`
      );
    }

    // Build a compact single-line “snippets” string for the model to use
    const snippets = rows
      .slice(0, topK)
      .map((r, idx) => {
        const section = (r.section || "").toString().trim();
        const content = (r.content || "").toString().trim();
        const sim =
          typeof r.similarity === "number"
            ? r.similarity.toFixed(4)
            : String(r.similarity || "");
        return `[#${idx + 1} sim=${sim}${section ? ` section="${section}"` : ""}] ${content}`;
      })
      .join(" | ");

    return vapiOk(
      toolCallId,
      `tenant=${tenant_id} | query="${query}" | matches=${rows.length} | ${snippets}`
    );
  } catch (err) {
    return vapiErr(toolCallId, err?.message || "Server error");
  }
};

// small helper if you want it above
function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
