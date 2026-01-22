// netlify/functions/vapi-chat.js
//
// Multi-tenant KB retrieval + Vapi chat + stable session memory
//
// Adds:
// ✅ Accepts sessionId from widget (stable across reloads)
// ✅ Reads rolling summary from public.conversation_sessions
// ✅ Uses summary + question for embeddings (fixes short follow-ups like "7am?")
// ✅ Optional write-back summary (ENV controlled, so no redeploy)
// ✅ Works even if memory is missing (fail-open)
//
// IMPORTANT: Your current table PK is session_id only.
// This code upserts onConflict: "session_id" (not tenant_id,session_id).

const fs = require("fs");
const path = require("path");

/* =========================
   RESPONSE HELPERS
========================= */

function json(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(bodyObj),
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function singleLine(str) {
  if (str == null) return "";
  return String(str).replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
}

function normaliseTenantId(value) {
  if (!value || typeof value !== "string") return null;
  return value.trim().toLowerCase();
}

function parseAllowedTenants(envVal) {
  if (!envVal || typeof envVal !== "string") return null;
  const list = envVal
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : null;
}

/* =========================
   TENANT MAP
========================= */

function loadAssistantMap() {
  const p = path.join(__dirname, "tenants", "assistant-map.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function resolveTenantId(rawTenantId, assistantId) {
  // 1) explicit tenantId wins (if provided by widget)
  const direct = normaliseTenantId(rawTenantId);
  if (direct) return direct;

  // 2) fallback: assistantId -> tenant map
  if (assistantId && typeof assistantId === "string") {
    try {
      const map = loadAssistantMap();
      const mapped = map?.[assistantId];
      const t = normaliseTenantId(mapped);
      if (t) return t;
    } catch {
      // ignore
    }
  }

  return null;
}

/* =========================
   KB CONTEXT BUILDER
========================= */

function buildKbContext(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return "";

  const lines = [];
  lines.push("COUNCIL KNOWLEDGE BASE EXCERPTS (use these as the source of truth)");
  lines.push("--------------------------------------------------------------");

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i] || {};
    const section = m.section ? String(m.section) : "General";
    const source = m.source ? String(m.source) : "Knowledge Base";
    const content = m.content ? String(m.content) : "";
    const sim = typeof m.similarity === "number" ? m.similarity : null;

    lines.push(`\n[${i + 1}] Source: ${source}`);
    lines.push(`[${i + 1}] Section: ${section}`);
    if (sim !== null) lines.push(`[${i + 1}] Similarity: ${sim.toFixed(3)}`);
    lines.push(`[${i + 1}] Content:\n${content}`);
  }

  lines.push("\n--------------------------------------------------------------");
  return lines.join("\n");
}

/* =========================
   OPENAI: EMBEDDING
========================= */

async function createEmbedding({ apiKey, model, input }) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });

  const raw = await r.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!r.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      (typeof data?.raw === "string" && data.raw.trim()
        ? data.raw
        : `OpenAI embeddings request failed (${r.status})`);
    throw new Error(msg);
  }

  const embedding = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length < 10) {
    throw new Error("OpenAI embeddings returned no embedding vector.");
  }

  return embedding;
}

/* =========================
   SUPABASE RPC: MATCH
========================= */

async function supabaseRpcMatch({
  supabaseUrl,
  serviceRoleKey,
  tenantId,
  embedding,
  matchCount,
}) {
  const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/match_knowledge_chunks`;

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  // Attempt 1: send array
  let r = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_query_embedding: embedding,
      p_match_count: matchCount,
    }),
  });

  let raw = await r.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (r.ok) return data;

  // Attempt 2: send vector literal string
  r = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_query_embedding: `[${embedding.join(",")}]`,
      p_match_count: matchCount,
    }),
  });

  raw = await r.text();
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!r.ok) {
    const msg =
      data?.message ||
      data?.error ||
      (typeof data?.raw === "string" && data.raw.trim()
        ? data.raw
        : `Supabase RPC failed (${r.status})`);
    throw new Error(msg);
  }

  return data;
}

/* =========================
   SESSION MEMORY (READ/WRITE)
========================= */

const MEM = {
  enabledRead: String(process.env.ENABLE_MEMORY_READ || "true").toLowerCase() === "true",
  enabledWrite: String(process.env.ENABLE_MEMORY_WRITE || "false").toLowerCase() === "true",
  table: process.env.MEMORY_TABLE || "conversation_sessions",
  maxChars: Number(process.env.MEMORY_MAX_CHARS || 1200),
  model: process.env.MEMORY_SUMMARY_MODEL || "gpt-4o-mini",
  failOpen: String(process.env.MEMORY_FAIL_OPEN || "true").toLowerCase() === "true",
};

async function loadConversationSummary({ supabaseUrl, serviceRoleKey, tenantId, sessionId }) {
  if (!MEM.enabledRead) return null;
  if (!supabaseUrl || !serviceRoleKey) return null;
  if (!tenantId || !sessionId) return null;

  try {
    const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${MEM.table}?select=summary&tenant_id=eq.${encodeURIComponent(
      tenantId
    )}&session_id=eq.${encodeURIComponent(sessionId)}&limit=1`;

    const r = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    const raw = await r.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : [];
    } catch {
      data = [];
    }

    if (!r.ok) return null;
    const row = Array.isArray(data) ? data[0] : null;
    return row?.summary ? String(row.summary) : null;
  } catch {
    return null;
  }
}

async function updateConversationSummary({
  openaiApiKey,
  tenantId,
  sessionId,
  previousSummary,
  latestUserMessage,
  latestAnswerSnippet,
  supabaseUrl,
  serviceRoleKey,
}) {
  if (!MEM.enabledWrite) return;
  if (!openaiApiKey || !supabaseUrl || !serviceRoleKey) return;

  const prev = (previousSummary || "").slice(0, MEM.maxChars);
  const uq = singleLine(latestUserMessage).slice(0, 800);
  const ans = singleLine(latestAnswerSnippet).slice(0, 800);

  const prompt = [
    "You are maintaining a short rolling summary of a user's ongoing chat session.",
    "Update the summary using the latest user message and the assistant answer.",
    "Rules:",
    `- Output must be plain text, max ${MEM.maxChars} characters.`,
    "- Keep only stable facts + current intent + any constraints.",
    "- Keep it tight; remove fluff.",
    "",
    `PREVIOUS SUMMARY: ${prev || "(none)"}`,
    `LATEST USER MESSAGE: ${uq}`,
    `LATEST ASSISTANT ANSWER (snippet): ${ans}`,
    "",
    "Return the UPDATED SUMMARY only.",
  ].join("\n");

  try {
    // Use OpenAI Responses API via fetch to avoid extra deps
    const rr = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MEM.model,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const raw = await rr.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    if (!rr.ok) throw new Error(data?.error?.message || data?.message || "Memory summary model failed.");

    let newSummary = data?.choices?.[0]?.message?.content || "";
    newSummary = singleLine(newSummary).slice(0, MEM.maxChars);
    if (!newSummary) return;

    // Upsert into conversation_sessions (YOUR TABLE PK is session_id)
    const upsertEndpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/${MEM.table}`;
    const up = await fetch(upsertEndpoint, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        session_id: sessionId,
        tenant_id: tenantId,
        summary: newSummary,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!up.ok) {
      const t = await up.text();
      throw new Error(`Supabase upsert failed: ${singleLine(t)}`);
    }
  } catch (e) {
    if (!MEM.failOpen) throw e;
    // fail-open => ignore
  }
}

/* =========================
   HANDLER
========================= */

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" }, corsHeaders());
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const {
      assistantId,
      tenantId: rawTenantId,
      input,
      previousChatId,
      sessionId: rawSessionId,
    } = body || {};

    if (!assistantId) return json(400, { error: "Missing assistantId" }, corsHeaders());
    if (!input || typeof input !== "string") return json(400, { error: "Missing input" }, corsHeaders());

    // Resolve tenantId
    const tenantId = resolveTenantId(rawTenantId, assistantId);
    if (!tenantId) {
      return json(400, { error: "Missing tenantId (not provided and assistantId not mapped)" }, corsHeaders());
    }

    // Stable sessionId from widget (required for memory to work)
    const sessionId = typeof rawSessionId === "string" && rawSessionId.trim()
      ? rawSessionId.trim()
      : null;

    // Optional allow-list to prevent cross-tenant leakage
    const allowedTenants = parseAllowedTenants(process.env.ALLOWED_TENANTS);
    if (allowedTenants && !allowedTenants.includes(tenantId)) {
      return json(403, { error: `tenantId not allowed: ${tenantId}` }, corsHeaders());
    }

    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    if (!VAPI_API_KEY) return json(500, { error: "Missing VAPI_API_KEY on server" }, corsHeaders());

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    const KB_ENABLED = String(process.env.KB_ENABLED || "true").toLowerCase() !== "false";
    const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
    const KB_MATCH_COUNT = Number(process.env.KB_MATCH_COUNT || 5);

    // 1) Load memory summary (if available)
    const previousSummary = await loadConversationSummary({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      tenantId,
      sessionId,
    });

    // 2) Build embedding input (summary + question) => fixes short follow-ups
    const embedInput = previousSummary
      ? `Conversation summary:\n${previousSummary}\n\nUser message:\n${input.trim()}`
      : input.trim();

    let kbMatches = [];
    let kbContext = "";

    if (
      KB_ENABLED &&
      SUPABASE_URL &&
      SUPABASE_SERVICE_ROLE_KEY &&
      OPENAI_API_KEY
    ) {
      // embeddings
      const queryEmbedding = await createEmbedding({
        apiKey: OPENAI_API_KEY,
        model: EMBED_MODEL,
        input: embedInput,
      });

      // vector match
      const matches = await supabaseRpcMatch({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        tenantId,
        embedding: queryEmbedding,
        matchCount: Number.isFinite(KB_MATCH_COUNT) ? KB_MATCH_COUNT : 5,
      });

      kbMatches = Array.isArray(matches) ? matches : [];
      kbContext = buildKbContext(kbMatches);
    }

    // 3) Build injected input
    const injectedInput = kbContext
      ? [
          "You are a helpful council assistant.",
          "Answer using ONLY the knowledge base excerpts below when they contain the answer.",
          "If the KB does not contain the answer, say you don’t have that information and suggest the best next step (e.g., contact council / check the website).",
          "",
          kbContext,
          "",
          `USER QUESTION: ${input.trim()}`,
        ].join("\n")
      : input.trim();

    // 4) Call Vapi chat
    const payload = {
      assistantId,
      input: injectedInput,
      ...(previousChatId ? { previousChatId } : {}),
      // Pass metadata so Vapi tool calls can also see it (safe even if unused)
      metadata: {
        tenantId,
        sessionId: sessionId || undefined,
        source: "aspire_widget",
      },
    };

    const r = await fetch("https://api.vapi.ai/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await r.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!r.ok) {
      return json(
        r.status,
        {
          error:
            data?.error ||
            data?.message ||
            (typeof data?.raw === "string" && data.raw.trim()
              ? data.raw
              : `Vapi request failed (${r.status})`),
          details: data,
        },
        corsHeaders()
      );
    }

    // Extract assistant reply text (used for memory write)
    const replyText =
      data?.output?.[0]?.content ||
      data?.output?.[0]?.text ||
      "";

    // 5) Optional: write updated rolling summary
    await updateConversationSummary({
      openaiApiKey: OPENAI_API_KEY,
      tenantId,
      sessionId,
      previousSummary,
      latestUserMessage: input.trim(),
      latestAnswerSnippet: replyText || kbContext || "",
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    });

    // Optional debug KB info (safe)
    data.kb = {
      tenantId,
      sessionId: sessionId || null,
      used: Boolean(kbContext),
      matchCount: Array.isArray(kbMatches) ? kbMatches.length : 0,
      matches: (kbMatches || []).map((m) => ({
        id: m.id,
        section: m.section,
        source: m.source,
        similarity: m.similarity,
        priority: m.priority,
      })),
      hadSummary: Boolean(previousSummary),
    };

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error("[vapi-chat] error", err);
    return json(500, { error: err?.message || "Server error" }, corsHeaders());
  }
};
