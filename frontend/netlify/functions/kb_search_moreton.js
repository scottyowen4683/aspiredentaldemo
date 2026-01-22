import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "ASPIRE_WEBHOOK_SECRET",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const EMBEDDING_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Optional allowlist: comma-separated tenant ids, e.g. "moreton_bay,gold_coast"
function isAllowedTenant(tenantId) {
  const allow = (process.env.ALLOWED_TENANTS || "").trim();
  if (!allow) return true; // if not set, allow all (but still protected by secret header)
  const set = new Set(allow.split(",").map(s => s.trim()).filter(Boolean));
  return set.has(tenantId);
}

async function embed(text) {
  const resp = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return resp.data[0].embedding;
}

export async function handler(event) {
  try {
    // 1) Simple shared-secret auth (required)
    const secret = event.headers["x-aspire-secret"] || event.headers["X-Aspire-Secret"];
    if (!secret || secret !== process.env.ASPIRE_WEBHOOK_SECRET) {
      return {
        statusCode: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    // 2) Parse input
    const body = event.body ? JSON.parse(event.body) : {};

    // Accept either "council" or "tenant_id"
    const tenant_id = (body.tenant_id || body.council || "").trim();
    const query = (body.query || "").trim();

    if (!tenant_id) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing 'tenant_id' (or 'council')" }),
      };
    }
    if (!query) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing 'query'" }),
      };
    }

    if (!isAllowedTenant(tenant_id)) {
      return {
        statusCode: 403,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Tenant not allowed" }),
      };
    }

    // 3) Embed the query
    const queryEmbedding = await embed(query);

    // 4) Similarity search via RPC (recommended) OR fallback to vector column search later
    // ASSUMPTION NOTE: This expects you have an RPC called `match_knowledge_chunks`.
    // If your RPC name differs, tell me the name and I’ll adjust the code.
    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      p_tenant_id: tenant_id,
      p_query_embedding: queryEmbedding,
      p_match_count: 5,
    });

    if (error) throw error;

    // 5) Return top chunks
    const chunks = (data || []).map(row => ({
      id: row.id,
      tenant_id: row.tenant_id,
      source: row.source,
      section: row.section,
      content: row.content,
      similarity: row.similarity,
      priority: row.priority,
    }));

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id,
        query,
        chunks,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: err.message || "Server error" }),
    };
  }
}
