// frontend/netlify/functions/vapi-kb-tool.js

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

/* =========================
   HELPERS
========================= */

function loadAssistantMap() {
  const p = path.join(__dirname, "tenants", "assistant-map.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function singleLine(str) {
  if (str == null) return "";
  return String(str).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
}

function pickFirstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/* =========================
   VAPI RESPONSE HELPERS
========================= */

function okVapi(toolCallId, resultStr) {
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({
      results: [{ toolCallId: String(toolCallId), result: singleLine(resultStr) }],
    }),
  };
}

function errVapi(toolCallId, errorStr) {
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({
      results: [{ toolCallId: String(toolCallId), error: singleLine(errorStr) }],
    }),
  };
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Aspire-Webhook-Secret",
  };
}

/* =========================
   EXTRACTION
========================= */

function extractToolCallId(body) {
  return pickFirstString(
    body?.toolCallId,
    body?.tool_call_id,
    body?.message?.toolCalls?.[0]?.id,
    body?.call?.id
  );
}

function extractQuery(body) {
  return pickFirstString(
    body?.query,
    body?.input,
    body?.text,
    body?.toolCall?.arguments?.query,
    body?.message?.toolCalls?.[0]?.function?.arguments?.query
  );
}

function extractAssistantId(body) {
  return pickFirstString(
    body?.assistantId,
    body?.assistant?.id,
    body?.call?.assistantId
  );
}

function extractTenantId(body) {
  return pickFirstString(
    body?.tenantId,
    body?.metadata?.tenantId
  );
}

function getTenantFromUrl(event) {
  return event.queryStringParameters?.tenant || null;
}

/* =========================
   STEP 2.2 — LOAD CONTEXT
========================= */

async function loadConversationSummary(supabase, tenant_id, sessionId) {
  try {
    const { data, error } = await supabase
      .from("conversation_state")
      .select("summary")
      .eq("tenant_id", tenant_id)
      .eq("session_id", sessionId)
      .single();

    if (error || !data?.summary) return null;
    return data.summary;
  } catch {
    return null; // table may not exist yet — intentional
  }
}

/* =========================
   FORMAT RESULTS
========================= */

function formatKbResults(results, maxChars = 3500) {
  if (!Array.isArray(results) || results.length === 0) {
    return "No relevant knowledge base entries found.";
  }

  let out = "KB matches: ";
  for (const r of results) {
    const part = `[${r.section} | ${r.source}] ${r.content}`;
    const clean = singleLine(part);
    if (out.length + clean.length > maxChars) break;
    out += clean + " || ";
  }
  return out.replace(/\s\|\|\s$/, "");
}

/* =========================
   HANDLER
========================= */

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return errVapi("unknown", "POST required.");
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return errVapi("unknown", "Invalid JSON body.");
  }

  const toolCallId = extractToolCallId(body) || "call_unknown";
  const query = extractQuery(body);
  const assistantId = extractAssistantId(body);

  // STEP 2.1 session id
  const sessionId =
    body?.sessionId ||
    body?.conversationId ||
    body?.call?.id ||
    toolCallId;

  if (!query) {
    return errVapi(toolCallId, "Missing query.");
  }

  let tenant_id =
    extractTenantId(body) ||
    (() => {
      try {
        return loadAssistantMap()[assistantId];
      } catch {
        return null;
      }
    })() ||
    getTenantFromUrl(event);

  if (!tenant_id) {
    return errVapi(toolCallId, "Missing tenant id.");
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  /* ===== STEP 2.2 IN ACTION ===== */

  const conversationSummary = await loadConversationSummary(
    supabase,
    tenant_id,
    sessionId
  );

  const queryForEmbedding = conversationSummary
    ? `Conversation context:\n${conversationSummary}\n\nUser question:\n${query}`
    : query;

  /* ================================= */

  const emb = await openai.embeddings.create({
    model: process.env.EMBED_MODEL || "text-embedding-3-small",
    input: queryForEmbedding,
  });

  const query_embedding = emb.data?.[0]?.embedding;

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding,
    match_count: 6,
    tenant_filter: tenant_id,
  });

  if (error) {
    return errVapi(toolCallId, "Knowledge search failed.");
  }

  return okVapi(toolCallId, formatKbResults(data || []));
};
