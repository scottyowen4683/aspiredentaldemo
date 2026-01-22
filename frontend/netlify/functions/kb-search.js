// frontend/netlify/functions/kb-search.js
//
// Purpose:
// - Given assistantId + query, map assistantId -> tenant_id
// - Embed the query
// - Call Supabase RPC match_knowledge_chunks
// - Return top KB chunks (only for that tenant)
//
// This is designed to be called by Vapi tools/webhooks or your own backend.

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
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const assistantId = body.assistantId;
    const query = body.query || body.input; // allow either field name
    const topK = Number(body.topK || 6);

    if (!assistantId || typeof assistantId !== "string") {
      return json(400, { error: "Missing assistantId" });
    }
    if (!query || typeof query !== "string") {
      return json(400, { error: "Missing query (or input)" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!SUPABASE_URL) return json(500, { error: "Missing SUPABASE_URL" });
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return json(500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY" });
    if (!OPENAI_API_KEY) return json(500, { error: "Missing OPENAI_API_KEY" });

    const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

    const map = loadAssistantMap();
    const tenant_id = map[assistantId];

    if (!tenant_id) {
      return json(403, {
        error: "assistantId is not mapped to a tenant",
        assistantId
      });
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    const emb = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: query
    });

    const query_embedding = emb.data[0].embedding;

    // Calls your RPC function (you already have match_knowledge_chunks)
    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding,
      match_count: topK,
      tenant_filter: tenant_id
    });

    if (error) {
      return json(500, { error: "Supabase RPC failed", details: error });
    }

    // Return a clean payload for Vapi tool usage
    return json(200, {
      tenant_id,
      topK,
      results: (data || []).map((r) => ({
        id: r.id,
        source: r.source,
        section: r.section,
        content: r.content,
        similarity: r.similarity
      }))
    });
  } catch (err) {
    return json(500, { error: err?.message || "Server error" });
  }
};
