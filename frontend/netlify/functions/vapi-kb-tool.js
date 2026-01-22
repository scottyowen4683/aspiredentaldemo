// frontend/netlify/functions/vapi-kb-tool.js
//
// Vapi Custom Tool Webhook (STRICT FORMAT):
// - Always returns HTTP 200
// - Always returns { results: [ { toolCallId, result|error } ] }
// - result/error MUST be a single-line string (no \n)
//
// This version:
// ✅ Robust tenant + session resolution (body, metadata, querystring, headers, vapi shapes)
// ✅ 3.2 READ conversation memory (public.conversation_sessions) (table configurable)
// ✅ Optional 3.3 WRITE memory (ENV controlled)
// ✅ Optional webhook secret verification (ENV controlled)
// ✅ Debug logs toggled via ENV (no redeploy)
// ✅ Safe fail-open behaviour for memory
//
// ENV you can set in Netlify:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - OPENAI_API_KEY
// - EMBED_MODEL (default text-embedding-3-small)
//
// Optional memory controls:
// - ENABLE_MEMORY_READ=true|false (default true)
// - ENABLE_MEMORY_WRITE=true|false (default false)
// - MEMORY_TABLE=conversation_sessions (default conversation_sessions)
// - MEMORY_SUMMARY_MODEL=gpt-4o-mini (default gpt-4o-mini)
// - MEMORY_MAX_CHARS=1200 (default 1200)
// - MEMORY_CONTEXT_PREFIX="Conversation summary:" (default "Conversation summary:")
// - MEMORY_FAIL_OPEN=true|false (default true)
//
// Optional security:
// - ASPIRE_WEBHOOK_SECRET=your_secret (if set, require header X-Aspire-Webhook-Secret)
//
// Optional debug:
// - DEBUG_VAPI=true|false (default false)
// - DEBUG_VAPI_BODY_MAX=4000 (default 4000)

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

/* =========================
   CONFIG
========================= */

const CFG = {
  embedModel: process.env.EMBED_MODEL || "text-embedding-3-small",

  enableMemoryRead:
    String(process.env.ENABLE_MEMORY_READ || "true").toLowerCase() === "true",
  enableMemoryWrite:
    String(process.env.ENABLE_MEMORY_WRITE || "false").toLowerCase() === "true",

  memoryTable: process.env.MEMORY_TABLE || "conversation_sessions",
  memorySummaryModel: process.env.MEMORY_SUMMARY_MODEL || "gpt-4o-mini",
  memoryMaxChars: Number(process.env.MEMORY_MAX_CHARS || 1200),
  memoryContextPrefix:
    process.env.MEMORY_CONTEXT_PREFIX || "Conversation summary:",
  memoryFailOpen:
    String(process.env.MEMORY_FAIL_OPEN || "true").toLowerCase() === "true",

  webhookSecret: process.env.ASPIRE_WEBHOOK_SECRET || null,

  debug:
    String(process.env.DEBUG_VAPI || "false").toLowerCase() === "true",
  debugBodyMax: Number(process.env.DEBUG_VAPI_BODY_MAX || 4000),
};

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

function safeJsonParse(maybeJson) {
  if (maybeJson == null) return null;
  if (typeof maybeJson === "object") return maybeJson;
  if (typeof maybeJson !== "string") return null;
  const s = maybeJson.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Aspire-Webhook-Secret, X-Aspire-Session-Id, X-Aspire-Tenant-Id",
  };
}

function getHeader(event, name) {
  // Netlify normalises headers in lowercase often
  const h = event.headers || {};
  const direct = h[name];
  if (direct) return direct;
  const lower = h[name.toLowerCase()];
  if (lower) return lower;
  // sometimes Netlify uses mixed
  const foundKey = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return foundKey ? h[foundKey] : null;
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

/* =========================
   EXTRACTION (ROBUST)
========================= */

function extractToolCallId(body) {
  return pickFirstString(
    body?.toolCallId,
    body?.tool_call_id,
    body?.toolCall?.id,
    body?.tool_call?.id,
    body?.message?.toolCallId,
    body?.message?.toolCalls?.[0]?.id,
    body?.call?.toolCallId,
    body?.call?.id
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
    body?.metadata?.assistant_id
  );
}

function extractTenantId(body) {
  return pickFirstString(
    body?.tenantId,
    body?.tenant_id,
    body?.metadata?.tenantId,
    body?.metadata?.tenant_id,
    body?.message?.tenantId,
    body?.message?.metadata?.tenantId,
    body?.message?.metadata?.tenant_id
  );
}

function getTenantFromUrl(event) {
  const qsTenant = event.queryStringParameters?.tenant;
  if (qsTenant && String(qsTenant).trim()) return String(qsTenant).trim();

  try {
    const u = new URL(event.rawUrl || "http://x/");
    const tenant = u.searchParams.get("tenant");
    return tenant && tenant.trim() ? tenant.trim() : null;
  } catch {
    return null;
  }
}

function getSessionFromUrl(event) {
  const qs = event.queryStringParameters || {};
  const direct = qs.sessionId || qs.session_id;
  if (direct && String(direct).trim()) return String(direct).trim();

  try {
    const u = new URL(event.rawUrl || "http://x/");
    const sid = u.searchParams.get("sessionId") || u.searchParams.get("session_id");
    return sid && sid.trim() ? sid.trim() : null;
  } catch {
    return null;
  }
}

// Session id: THIS IS THE KEY FIX.
// We prioritise "your" session id (metadata/sessionId), not Vapi chatId/callId.
function extractSessionId(body, event, toolCallId) {
  const fromBodyOrMeta = pickFirstString(
    body?.sessionId,
    body?.session_id,
    body?.metadata?.sessionId,
    body?.metadata?.session_id,
    body?.message?.metadata?.sessionId,
    body?.message?.metadata?.session_id,
    body?.message?.sessionId,
    body?.message?.session_id
  );
  if (fromBodyOrMeta) return fromBodyOrMeta;

  const fromHeader = pickFirstString(
    getHeader(event, "X-Aspire-Session-Id"),
    getHeader(event, "X-Session-Id")
  );
  if (fromHeader) return fromHeader;

  const fromUrl = getSessionFromUrl(event);
  if (fromUrl) return fromUrl;

  // last resort fallbacks (NOT ideal, but keeps tool working)
  return (
    pickFirstString(
      body?.conversationId,
      body?.conversation_id,
      body?.call?.id,
      body?.call?.callId,
      body?.call?.call_id,
      body?.message?.conversationId
    ) || String(toolCallId || "session_unknown")
  );
}

// Query can be in multiple places and sometimes nested as JSON string
function extractQuery(body) {
  const direct = pickFirstString(body?.query, body?.input, body?.text);
  if (direct) return direct;

  const argCandidates = [
    body?.toolCall?.arguments,
    body?.tool_call?.arguments,
    body?.message?.toolCall?.arguments,
    body?.message?.toolCalls?.[0]?.function?.arguments,
    body?.message?.toolCalls?.[0]?.arguments,
  ];

  for (const c of argCandidates) {
    const parsed = safeJsonParse(c) || c;
    const q = pickFirstString(parsed?.query, parsed?.text, parsed?.input);
    if (q) return q;
  }

  const params = safeJsonParse(body?.params) || body?.params;
  const q2 = pickFirstString(params?.query, params?.text, params?.input);
  if (q2) return q2;

  return null;
}

/* =========================
   OPTIONAL SECURITY
========================= */

function verifySecret(event) {
  if (!CFG.webhookSecret) return true;
  const got = getHeader(event, "X-Aspire-Webhook-Secret");
  return got && String(got).trim() === String(CFG.webhookSecret).trim();
}

/* =========================
   MEMORY (READ + WRITE)
========================= */

async function loadConversationSummary(supabase, tenant_id, sessionId) {
  if (!CFG.enableMemoryRead) return null;

  try {
    const { data, error } = await supabase
      .from(CFG.memoryTable)
      .select("summary")
      .eq("session_id", sessionId)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (error || !data?.summary) return null;
    return data.summary;
  } catch {
    return null;
  }
}

async function updateConversationSummary({
  supabase,
  openai,
  tenant_id,
  sessionId,
  previousSummary,
  userQuery,
  kbResultString,
}) {
  if (!CFG.enableMemoryWrite) return;

  const prev = (previousSummary || "").slice(0, CFG.memoryMaxChars);
  const uq = singleLine(userQuery).slice(0, 800);
  const kb = singleLine(kbResultString).slice(0, 800);

  const prompt = [
    "You are maintaining a short rolling summary of a user's ongoing chat session.",
    "Update the summary using the latest user message and the system's answer context.",
    "Rules:",
    `- Output must be plain text, max ${CFG.memoryMaxChars} characters.`,
    "- Keep only stable facts and the user's current intent.",
    "- Do not store sensitive identifiers unnecessarily.",
    "- Be concise.",
    "",
    `PREVIOUS SUMMARY: ${prev || "(none)"}`,
    `LATEST USER MESSAGE: ${uq}`,
    `SYSTEM CONTEXT (KB RESULT SNIPPET): ${kb}`,
    "",
    "Return the UPDATED SUMMARY only.",
  ].join("\n");

  try {
    const resp = await openai.chat.completions.create({
      model: CFG.memorySummaryModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    let newSummary = resp?.choices?.[0]?.message?.content || null;
    if (!newSummary) return;

    newSummary = singleLine(newSummary).slice(0, CFG.memoryMaxChars);

    // NOTE: This requires a UNIQUE constraint/index on (tenant_id, session_id)
    const { error } = await supabase.from(CFG.memoryTable).upsert(
      {
        tenant_id,
        session_id: sessionId,
        summary: newSummary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,session_id" }
    );

    if (error) throw error;
  } catch (e) {
    if (!CFG.memoryFailOpen) {
      throw new Error(`Memory write failed: ${singleLine(e?.message || e)}`);
    }
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
    const part = `[${r.section || "KB"} | ${r.source || "source"}] ${r.content || ""}`;
    const clean = singleLine(part);
    if (out.length + clean.length + 4 > maxChars) break;
    out += clean + " || ";
  }
  return out.replace(/\s\|\|\s$/, "").trim();
}

/* =========================
   HANDLER
========================= */

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  if (!verifySecret(event)) {
    return errVapi("call_unknown", "Unauthorized (invalid webhook secret).");
  }

  if (event.httpMethod !== "POST") {
    return errVapi("call_unknown", "POST required.");
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return errVapi("call_unknown", "Invalid JSON body.");
  }

  const toolCallId = extractToolCallId(body) || "call_unknown";
  const query = extractQuery(body);
  const assistantId = extractAssistantId(body);

  // tenant can be passed in body/meta OR query param OR header
  const tenantFromBody = extractTenantId(body);
  const tenantFromUrl = getTenantFromUrl(event);
  const tenantFromHeader = pickFirstString(getHeader(event, "X-Aspire-Tenant-Id"));

  let tenant_id =
    tenantFromBody ||
    tenantFromHeader ||
    (() => {
      try {
        const map = loadAssistantMap();
        return assistantId && map[assistantId] ? map[assistantId] : null;
      } catch {
        return null;
      }
    })() ||
    tenantFromUrl;

  const sessionId = extractSessionId(body, event, toolCallId);

  if (CFG.debug) {
    console.log("VAPI_DEBUG_tenant_id:", tenant_id);
    console.log("VAPI_DEBUG_sessionId:", sessionId);
    console.log("VAPI_DEBUG_toolCallId:", toolCallId);
    console.log("VAPI_DEBUG_qs:", event.queryStringParameters || {});
    console.log("VAPI_DEBUG_body:", JSON.stringify(body).slice(0, CFG.debugBodyMax));
  }

  if (!tenant_id) {
    return errVapi(toolCallId, `Missing tenant id. assistantId=${assistantId || "null"} sessionId=${sessionId}`);
  }

  if (!query) {
    return errVapi(toolCallId, "Missing query.");
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!SUPABASE_URL) return errVapi(toolCallId, "Server misconfig: Missing SUPABASE_URL.");
  if (!SUPABASE_SERVICE_ROLE_KEY) return errVapi(toolCallId, "Server misconfig: Missing SUPABASE_SERVICE_ROLE_KEY.");
  if (!OPENAI_API_KEY) return errVapi(toolCallId, "Server misconfig: Missing OPENAI_API_KEY.");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    // 3.2 READ MEMORY
    const conversationSummary = await loadConversationSummary(supabase, tenant_id, sessionId);

    const queryForEmbedding = conversationSummary
      ? `${CFG.memoryContextPrefix}\n${conversationSummary}\n\nUser question:\n${query}`
      : query;

    const emb = await openai.embeddings.create({
      model: CFG.embedModel,
      input: queryForEmbedding,
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
      return errVapi(toolCallId, `Knowledge search failed: ${singleLine(JSON.stringify(error))}`);
    }

    const kbResult = formatKbResults(data || []);

    // OPTIONAL 3.3 WRITE MEMORY
    await updateConversationSummary({
      supabase,
      openai,
      tenant_id,
      sessionId,
      previousSummary: conversationSummary,
      userQuery: query,
      kbResultString: kbResult,
    });

    return okVapi(toolCallId, kbResult);
  } catch (e) {
    return errVapi(toolCallId, `KB tool failed: ${singleLine(e?.message || e)}`);
  }
};
