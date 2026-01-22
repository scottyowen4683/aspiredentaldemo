// frontend/netlify/functions/kb-search.js
//
// Supports 2 routing modes:
// A) Preferred: pass tenant in URL query string: ?tenant=moreton
// B) Fallback: pass assistantId (body or query string) and map via assistant-map.json
//
// Optional auth:
// - If ASPIRE_API_KEY is set in Netlify env vars, requests MUST include header: x-aspire-key

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
      "Access-Control-Allow-Headers": "Content-Type, x-aspire-key",
    },
    body: JSON.stringify(body),
  };
}

function getQueryParam(event, key) {
  const raw = event.rawQuery || "";
  const sp = new URLSearchParams(raw);
  const v = sp.get(key);
  return v && String(v).trim() ? String(v).trim() : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-aspire-key",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    // Optional API key protection
    const ASPIRE_API_KEY = process.env.ASPIRE_API_KEY;
    if (ASPIRE_API_KEY) {
      const provided =
        event.headers?.["x-aspire-key"] ||
        event.headers?.["X-Aspire-Key"] ||
        event.headers?.["x-aspire-key".toLowerCase()];
      if (!provided || provided !== ASPIRE_API_KEY) {
        return json(401, { error: "Unauthorized (missing/invalid x-aspire-key)" });
      }
    }

    const body = event.body ? JSON.parse(event.body) : {};

    const query = body.query || body.input; // allow either field name
    const topK = Number(body.topK || 6);

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

    // Preferred: tenant passed in URL
    let tenant_id = getQueryParam(event, "tenant");

    // Fallback: tenant via assistant-map
    if (!tenant_id) {
      const assistantId =
        (body.assistantId && String(body.assistantId).trim()) ||
        getQueryParam(event, "assistantId");

      if (!assistantId) {
        return json(400, {
          error:
            "Missing tenant. Pass ?tenant=moreton in URL (preferred) or provide assistantId (body or ?assistantId=...).",
        });
      }

      const map = loadAssistantMap();
      tenant_id = map[assistantId];

      if (!tenant_id) {
        return json(403, {
          error: "assistantId is not mapped to a tenant",
          assistantId,
        });
      }
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

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
      return json(500, { error: "Supabase RPC failed", details: error });
    }

    return json(200, {
      tenant_id,
      topK,
      results: (data || []).map((r) => ({
        id: r.id,
        source: r.source,
        section: r.section,
        content: r.content,
        similarity: r.similarity,
      })),
    });
  } catch (err) {
    return json(500, { error: err?.message || "Server error" });
  }
};
