// frontend/netlify/functions/vapi-kb-tool.js
//
// Vapi-friendly wrapper for KB search.
// - Accepts Vapi's various request body shapes
// - Extracts { query } (required) and { assistantId } (required)
// - Maps assistantId -> tenant_id (assistant-map.json)
// - Embeds query (OpenAI embeddings)
// - Calls Supabase RPC match_knowledge_chunks
// - Returns a clean JSON payload (always non-empty)

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

function loadAssistantMap() {
  const p = path.join(__dirname, "tenants", "assistant-map.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(body),
  };
}

function pickFirstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function extractQuery(body) {
  // Try all common places Vapi / tool runners may put args
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
    body?.tool_call?.arguments?.input,
    body?.payload?.query,
    body?.payload?.input
  );
}

function extractAssistantId(body) {
  // Your Vapi tool SHOULD send assistantId, but in practice it may be nested.
  return pickFirstString(
    body?.assistantId,
    body?.assistant_id,
    body?.assistant?.id,
    body?.assistant?.assistantId,
    body?.call?.assistantId,
    body?.call?.assistant?.id,
    body?.metadata?.assistantId,
    body?.metadata?.assistant?.id,
    body?.request?.assistantId,
    body?.request?.assistant?.id
  );
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

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};

    // Extract query + assistantId robustly
    const query = extractQuery(body);
    const assistantId = extractAssistantId(body);

    // Optional topK
    const topK = Number(
      body?.topK ??
        body?.top_k ??
        body?.arguments?.topK ??
        body?.arguments?.top_k ??
        6
    );

    if (!query) {
      return json(400, {
        error: "Missing query",
        hint:
          "Ensure your Vapi tool has a parameter named 'query' and the assistant is passing it.",
        receivedKeys: Object.keys(body || {}),
      });
    }

    if (!assistantId) {
      return json(400, {
        error: "Missing assistantId",
        hint:
          "Vapi must include assistantId in the tool call context. If it doesn't, we can hardcode tenant via URL param as a fallback.",
        receivedKeys: Object.keys(body || {}),
      });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!SUPABASE_URL) return json(500, { error: "Missing SUPABASE_URL" });
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return json(500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    if (!OPENAI_API_KEY) return json(500, { error: "Missing OPENAI_API_KEY" });

    const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

    // Map assistantId -> tenant
    const map = loadAssistantMap();
    const tenant_id = map[assistantId];

    if (!tenant_id) {
      return json(403, {
        error: "assistantId is not mapped to a tenant",
        assistantId,
      });
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Embed query
    const emb = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: query,
    });

    const query_embedding = emb.data?.[0]?.embedding;
    if (!query_embedding) {
      return json(500, { error: "Failed to generate query embedding" });
    }

    // Search via RPC
    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding,
      match_count: topK,
      tenant_filter: tenant_id,
    });

    if (error) {
      return json(500, { error: "Supabase RPC failed", details: error });
    }

    const results = (data || []).map((r) => ({
      id: r.id,
      source: r.source,
      section: r.section,
      content: r.content,
      similarity: r.similarity,
    }));

    // IMPORTANT: Always return a non-empty object (Vapi hates empty/undefined)
    return json(200, {
      ok: true,
      tenant_id,
      assistantId,
      query,
      topK,
      results,
    });
  } catch (err) {
    return json(500, { error: err?.message || "Server error" });
  }
};
