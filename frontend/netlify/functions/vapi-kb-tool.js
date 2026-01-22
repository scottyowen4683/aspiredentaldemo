// frontend/netlify/functions/vapi-kb-tool.js
//
// Vapi Custom Tool wrapper for your KB search.
// Vapi will ignore results if toolCallId doesn't EXACTLY match the call_... id.
// This version finds toolCallId robustly by scanning the whole payload for call_...

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

// ---------- helpers ----------
function loadAssistantMap() {
  const p = path.join(__dirname, "tenants", "assistant-map.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function jsonResp(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

// Vapi REQUIRED wrapper
function vapiWrap(toolCallId, resultString) {
  const s =
    typeof resultString === "string"
      ? resultString.replace(/\s+/g, " ").trim()
      : JSON.stringify(resultString).replace(/\s+/g, " ").trim();

  return jsonResp(200, {
    results: [
      {
        toolCallId: toolCallId,
        result: s,
      },
    ],
  });
}

// Find first "call_XXXX" anywhere in the body (most reliable)
function sniffToolCallId(bodyObj) {
  try {
    const s = JSON.stringify(bodyObj);
    const m = s.match(/call_[A-Za-z0-9]+/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

// best-effort normal extraction too
function extract(bodyObj) {
  const params =
    bodyObj?.parameters ||
    bodyObj?.toolInput ||
    bodyObj?.tool_input ||
    bodyObj?.arguments ||
    bodyObj?.args ||
    bodyObj?.input ||
    bodyObj ||
    {};

  const query =
    params?.query ||
    params?.question ||
    params?.text ||
    params?.input ||
    bodyObj?.query ||
    bodyObj?.input ||
    null;

  const assistantId =
    params?.assistantId ||
    params?.assistant_id ||
    bodyObj?.assistantId ||
    bodyObj?.assistant_id ||
    bodyObj?.assistant?.id ||
    bodyObj?.message?.assistantId ||
    bodyObj?.message?.assistant_id ||
    null;

  const topK = Number(params?.topK || bodyObj?.topK || 6);

  return { query, assistantId, topK };
}

// Optional auth – if set, Vapi must send Authorization: Bearer <secret>
function isAuthorised(event) {
  const secret = process.env.ASPIRE_WEBHOOK_SECRET;
  if (!secret) return true;

  const auth =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    event.headers?.AUTHORIZATION ||
    "";

  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : auth.trim();
  return token === secret;
}

// ---------- handler ----------
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResp(204, {});
  }

  // Always return Vapi wrapper even on wrong method (avoids silent failure)
  if (event.httpMethod !== "POST") {
    return vapiWrap("call_unknown", "ERROR: Method Not Allowed (use POST)");
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  // Critical: ensure toolCallId matches Vapi’s call_... id
  const toolCallId =
    body?.toolCallId ||
    body?.message?.toolCallId ||
    body?.tool_call_id ||
    body?.id ||
    sniffToolCallId(body) ||
    "call_unknown";

  // Auth check (if you set ASPIRE_WEBHOOK_SECRET)
  if (!isAuthorised(event)) {
    return vapiWrap(toolCallId, "ERROR: Unauthorised (missing/invalid Authorization)");
  }

  const { query, assistantId, topK } = extract(body);

  try {
    if (!query || typeof query !== "string") {
      return vapiWrap(toolCallId, "ERROR: Missing query");
    }
    if (!assistantId || typeof assistantId !== "string") {
      return vapiWrap(
        toolCallId,
        "ERROR: Missing assistantId in tool request (Vapi payload didn’t include it)."
      );
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

    if (!SUPABASE_URL) return vapiWrap(toolCallId, "ERROR: Missing SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY)
      return vapiWrap(toolCallId, "ERROR: Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!OPENAI_API_KEY) return vapiWrap(toolCallId, "ERROR: Missing OPENAI_API_KEY");

    const map = loadAssistantMap();
    const tenant_id = map[assistantId];

    if (!tenant_id) {
      return vapiWrap(
        toolCallId,
        `ERROR: assistantId not mapped to tenant (assistantId=${assistantId}). Check assistant-map.json.`
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
      return vapiWrap(toolCallId, "ERROR: Embedding failed (no embedding returned)");
    }

    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding,
      match_count: Number.isFinite(topK) ? topK : 6,
      tenant_filter: tenant_id,
    });

    if (error) {
      return vapiWrap(toolCallId, `ERROR: Supabase RPC failed: ${error.message || "unknown"}`);
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      return vapiWrap(toolCallId, `tenant=${tenant_id} | No KB matches found for: "${query}"`);
    }

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

    return vapiWrap(
      toolCallId,
      `tenant=${tenant_id} | query="${query}" | matches=${rows.length} | ${snippets}`
    );
  } catch (err) {
    return vapiWrap(toolCallId, `ERROR: ${err?.message || "Server error"}`);
  }
};
