// frontend/netlify/functions/vapi-kb-tool.js
//
// Vapi Custom Tool Webhook (STRICT FORMAT):
// - Always returns HTTP 200
// - Always returns { results: [ { toolCallId, result|error } ] }
// - result/error MUST be a single-line string (no \n)
//
// What this version includes (so you don't keep redeploying):
// ✅ 3.2 READ conversation memory (from public.conversation_sessions)
// ✅ Optional WRITE conversation memory (Phase 3.3) controlled by ENV flags
// ✅ Robust extraction for Vapi payload shapes (including JSON-string arguments)
// ✅ Optional webhook secret verification (ENV controlled)
// ✅ Configurable table/model/limits via ENV (switch behaviour without redeploy)
// ✅ Safe “no memory yet” behaviour (does not break KB)
//
// ENV you can set in Netlify (suggested):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - OPENAI_API_KEY
// - EMBED_MODEL (default text-embedding-3-small)
//
// Optional memory controls:
// - ENABLE_MEMORY_READ=true|false (default true)
// - ENABLE_MEMORY_WRITE=true|false (default false)  <-- turn on later without code change
// - MEMORY_TABLE=conversation_sessions (default conversation_sessions)
// - MEMORY_SUMMARY_MODEL=gpt-4o-mini (default gpt-4o-mini)
// - MEMORY_MAX_CHARS=1200 (default 1200)
// - MEMORY_CONTEXT_PREFIX="Conversation summary:" (optional)
// - MEMORY_UPDATE_STRATEGY=merge (default merge)
// - MEMORY_FAIL_OPEN=true|false (default true)  // if write fails, still answer KB
//
// Optional security:
// - ASPIRE_WEBHOOK_SECRET=your_secret (if set, require header X-Aspire-Webhook-Secret)

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

/* =========================
   CONFIG
========================= */

const CFG = {
  embedModel: process.env.EMBED_MODEL || "text-embedding-3-small",

  // Memory behaviour toggles
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

  // Optional secret verification
  webhookSecret: process.env.ASPIRE_WEBHOOK_SECRET || null,
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
      "Content-Type, Authorization, X-Aspire-Webhook-Secret",
  };
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
    body?.metadata?.assistantId
  );
}

function extractTenantId(body) {
  return pickFirstString(
    body?.tenantId,
    body?.tenant_id,
    body?.metadata?.tenantId,
    body?.metadata?.tenant_id,
    body?.message?.tenantId,
    body?.message?.metadata?.tenantId
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

// Session id: critical for continuity
function extractSessionId(body, toolCallId) {
  return (
    pickFirstString(
      body?.sessionId,
      body?.session_id,
      body?.conversationId,
      body?.conversation_id,
      body?.call?.id,
      body?.call?.callId,
      body?.call?.call_id,
      body?.message?.conversationId,
      body?.message?.sessionId
    ) || String(toolCallId || "session_unknown")
  );
}

// Query can be in multiple places and sometimes nested as JSON string
function extractQuery(body) {
  // Direct fields
  const direct = pickFirstString(body?.query, body?.input, body?.text);
  if (direct) return direct;

  // ToolCall arguments
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

  // As a last resort, sometimes Vapi puts it under params
  const params = safeJsonParse(body?.params) || body?.params;
  const q2 = pickFirstString(params?.query, params?.text, params?.input);
  if (q2) return q2;

  return null;
}

/* =========================
   OPTIONAL SECURITY
========================= */

function verifySecret(event) {
  if (!CFG.webhookSecret) return true; // no secret configured => allow
  const got = event.headers?.["x-aspire-webhook-secret"] || event.headers?.["X-Aspire-Webhook-Secret"];
  return got && String(got).trim() === String(CFG.webhookSecret).trim();
}

/* =========================
   MEMORY (READ + WRITE)
========================= */

// 3.2 READ: load summary from conversation_sessions
async function loadConversationSummary(supabase, tenant_id, sessionId) {
  try {
    const { data, error } = await supabase
      .from("conversation_sessions")     // ✅ correct table
      .select("summary")
      .eq("session_id", sessionId)
      .eq("tenant_id", tenant_id)
      .maybeSingle();                   // ✅ avoids hard error if not found

    if (error || !data?.summary) return null;
    return data.summary;
  } catch {
    return null;
  }
}


// Phase 3.3 (optional): update summary via GPT and upsert to conversation_sessions
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

  // Guardrails: keep memory compact
  const prev = (previousSummary || "").slice(0, CFG.memoryMaxChars);
  const uq = singleLine(userQuery).slice(0, 800);
  const kb = singleLine(kbResultString).slice(0, 800);

  // Prompt designed to produce a tight rolling summary
  const prompt = [
    "You are maintaining a short rolling summary of a user's ongoing chat session.",
    "Update the summary using the latest user message and the system's answer context.",
    "Rules:",
    `- Output must be plain text, max ${CFG.memoryMaxChars} characters.`,
    "- Keep only stable facts and the user's current intent.",
    "- Do not store sensitive identifiers unnecessarily.",
    "- No bullet points unless needed; be concise.",
    "",
    `PREVIOUS SUMMARY: ${prev || "(none)"}`,
    `LATEST USER MESSAGE: ${uq}`,
    `SYSTEM CONTEXT (KB RESULT SNIPPET): ${kb}`,
    "",
    "Return the UPDATED SUMMARY only.",
  ].join("\n");

  let newSummary = null;

  try {
    const resp = await openai.chat.completions.create({
      model: CFG.memorySummaryModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    newSummary = resp?.choices?.[0]?.message?.content || null;
    if (!newSummary) return;

    newSummary = singleLine(newSummary).slice(0, CFG.memoryMaxChars);

    // Upsert row (requires unique index on (tenant_id, session_id) to be perfect,
    // but even without it, this will still insert; best practice is the unique index you already planned)
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
    // fail open: ignore write errors, continue serving answers
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

  // Optional secret check (prevents randoms hitting your endpoint)
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

  // Light debug (safe)
  console.log("VAPI_BODY_KEYS:", Object.keys(body || {}).slice(0, 50));
  console.log("VAPI_QS:", event.queryStringParameters || {});

  const toolCallId = extractToolCallId(body) || "call_unknown";
  const query = extractQuery(body);
  const assistantId = extractAssistantId(body);
  const sessionId = extractSessionId(body, toolCallId);

  if (!query) {
    return errVapi(toolCallId, "Missing query.");
  }

  // Resolve tenant_id
  const tenantFromBody = extractTenantId(body);
  const tenantFromUrl = getTenantFromUrl(event);

  let tenant_id =
    tenantFromBody ||
    (() => {
      try {
        const map = loadAssistantMap();
        return assistantId && map[assistantId] ? map[assistantId] : null;
      } catch {
        return null;
      }
    })() ||
    tenantFromUrl;

  if (!tenant_id) {
    return errVapi(
      toolCallId,
      `Missing tenant id. assistantId=${assistantId || "null"} sessionId=${sessionId}`
    );
  }

  // Env checks (fail fast, but still 200 for Vapi)
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!SUPABASE_URL) return errVapi(toolCallId, "Server misconfig: Missing SUPABASE_URL.");
  if (!SUPABASE_SERVICE_ROLE_KEY)
    return errVapi(toolCallId, "Server misconfig: Missing SUPABASE_SERVICE_ROLE_KEY.");
  if (!OPENAI_API_KEY) return errVapi(toolCallId, "Server misconfig: Missing OPENAI_API_KEY.");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    /* =========================
       3.2 READ MEMORY (if exists)
    ========================= */
    const conversationSummary = await loadConversationSummary(supabase, tenant_id, sessionId);

    // IMPORTANT: embeddings can take multi-line input; response to Vapi remains single-line.
    const queryForEmbedding = conversationSummary
      ? `${CFG.memoryContextPrefix}\n${conversationSummary}\n\nUser question:\n${query}`
      : query;

    /* =========================
       Embedding
    ========================= */
    const emb = await openai.embeddings.create({
      model: CFG.embedModel,
      input: queryForEmbedding,
    });

    const query_embedding = emb.data?.[0]?.embedding;
    if (!query_embedding) {
      return errVapi(toolCallId, "Embedding failed: no embedding returned.");
    }

    /* =========================
       Vector search (RPC)
    ========================= */
    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding,
      match_count: 6,
      tenant_filter: tenant_id,
    });

    if (error) {
      return errVapi(toolCallId, `Knowledge search failed: ${singleLine(JSON.stringify(error))}`);
    }

    const kbResult = formatKbResults(data || []);

    /* =========================
       OPTIONAL: 3.3 WRITE MEMORY
       (Turn on by setting ENABLE_MEMORY_WRITE=true)
    ========================= */
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
