// netlify/functions/ai-chat.js
//
// Direct OpenAI chat implementation (VAPI-free)
// Multi-tenant KB retrieval + conversation history management
//
// Key features:
// ✅ Direct OpenAI chat completions (no VAPI dependency)
// ✅ Configurable assistant prompts per tenant (from JSON config)
// ✅ KB search with embeddings via Supabase
// ✅ Conversation history management in Supabase
// ✅ Session continuity with proper message history
// ✅ Optional rolling summary for long conversations
//
// Required ENV:
// - OPENAI_API_KEY
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Optional ENV:
// - KB_ENABLED=true|false (default true)
// - EMBED_MODEL=text-embedding-3-small (default)
// - KB_MATCH_COUNT=5 (default, can be overridden in config)
// - CONVERSATION_HISTORY_LIMIT=10 (default 10 messages)
// - ENABLE_MEMORY_READ=true|false (default true)
// - ENABLE_MEMORY_WRITE=true|false (default true)
// - MEMORY_MAX_CHARS=1200 (default)
// - MEMORY_SUMMARY_MODEL=gpt-4o-mini (default)
//
// Tables expected:
// - public.chat_conversations (for message history)
// - public.conversation_sessions (for optional summary)

const fs = require("fs");
const path = require("path");

/* =========================
   BASIC HELPERS
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

function makeSessionId() {
  const rand = Math.random().toString(16).slice(2);
  return `sess_${Date.now()}_${rand}`;
}

/* =========================
   CONFIG LOADER
========================= */

function loadAssistantConfig(tenantId) {
  const configPath = path.join(__dirname, "config", "assistants.json");
  const raw = fs.readFileSync(configPath, "utf8");
  const configs = JSON.parse(raw);

  // Try to find config for this tenant, fall back to default
  const config = configs[tenantId] || configs.default || null;
  if (!config) {
    throw new Error(`No configuration found for tenant: ${tenantId}`);
  }

  return config;
}

function loadAssistantMap() {
  const p = path.join(__dirname, "tenants", "assistant-map.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function resolveTenantId(rawTenantId, assistantId) {
  // 1) explicit tenantId wins
  const direct = normaliseTenantId(rawTenantId);
  if (direct) return direct;

  // 2) assistantId -> tenant map
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
   KB HELPERS
========================= */

function buildKbContext(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return "";

  const lines = [];
  lines.push("KNOWLEDGE BASE EXCERPTS (use these as the source of truth)");
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

async function createEmbedding({ apiKey, model, input }) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
    }),
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

  // Attempt array first
  const bodyArray = {
    p_tenant_id: tenantId,
    p_query_embedding: embedding,
    p_match_count: matchCount,
  };

  let r = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyArray),
  });

  let raw = await r.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (r.ok) return data;

  // Retry vector literal string
  const bodyString = {
    p_tenant_id: tenantId,
    p_query_embedding: `[${embedding.join(",")}]`,
    p_match_count: matchCount,
  };

  r = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyString),
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
   CONVERSATION HISTORY
========================= */

async function getConversationHistory({
  supabaseUrl,
  serviceRoleKey,
  tenantId,
  sessionId,
  limit = 10,
}) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const url =
    `${base}/rest/v1/chat_conversations` +
    `?tenant_id=eq.${encodeURIComponent(tenantId)}` +
    `&session_id=eq.${encodeURIComponent(sessionId)}` +
    `&select=role,content,created_at` +
    `&order=created_at.asc` +
    `&limit=${limit}`;

  const r = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });

  const raw = await r.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : [];
  } catch {
    data = [];
  }
  if (!r.ok) return [];
  return Array.isArray(data) ? data : [];
}

async function saveMessage({
  supabaseUrl,
  serviceRoleKey,
  tenantId,
  sessionId,
  role,
  content,
}) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const url = `${base}/rest/v1/chat_conversations`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      session_id: sessionId,
      role,
      content,
      created_at: new Date().toISOString(),
    }),
  });

  if (!r.ok) {
    const raw = await r.text().catch(() => "");
    console.warn("[chat_conversations] insert failed:", raw);
  }
}

/* =========================
   MEMORY SUMMARY (OPTIONAL)
========================= */

async function getConversationSummary({ supabaseUrl, serviceRoleKey, tenantId, sessionId }) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const url =
    `${base}/rest/v1/conversation_sessions` +
    `?tenant_id=eq.${encodeURIComponent(tenantId)}` +
    `&session_id=eq.${encodeURIComponent(sessionId)}` +
    `&select=summary,updated_at` +
    `&limit=1`;

  const r = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
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
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0]?.summary ? String(data[0].summary) : null;
}

async function upsertConversationSummary({ supabaseUrl, serviceRoleKey, tenantId, sessionId, summary }) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const url = `${base}/rest/v1/conversation_sessions`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([
      {
        tenant_id: tenantId,
        session_id: sessionId,
        summary,
        updated_at: new Date().toISOString(),
      },
    ]),
  });

  if (!r.ok) {
    const raw = await r.text().catch(() => "");
    console.warn("[conversation_sessions] upsert failed:", raw);
  }
}

async function updateRollingSummary({ openaiKey, model, maxChars, previousSummary, userInput, assistantOutput }) {
  const prompt = [
    "You are maintaining a short rolling summary of a user's ongoing chat session.",
    `Return plain text only. Max ${maxChars} characters.`,
    "Keep only stable facts and current intent. Be concise.",
    "",
    `PREVIOUS SUMMARY: ${previousSummary || "(none)"}`,
    `LATEST USER MESSAGE: ${singleLine(userInput).slice(0, 800)}`,
    `LATEST ASSISTANT OUTPUT: ${singleLine(assistantOutput).slice(0, 800)}`,
    "",
    "UPDATED SUMMARY:",
  ].join("\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  const raw = await r.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!r.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      (typeof raw === "string" && raw.trim() ? raw : "Summary update failed");
    throw new Error(msg);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text) return null;
  return singleLine(text).slice(0, maxChars);
}

/* =========================
   CONFIG (ENV)
========================= */

const CFG = {
  KB_ENABLED: String(process.env.KB_ENABLED || "true").toLowerCase() !== "false",
  EMBED_MODEL: process.env.EMBED_MODEL || "text-embedding-3-small",
  CONVERSATION_HISTORY_LIMIT: Number(process.env.CONVERSATION_HISTORY_LIMIT || 10),

  ENABLE_MEMORY_READ: String(process.env.ENABLE_MEMORY_READ || "true").toLowerCase() === "true",
  ENABLE_MEMORY_WRITE: String(process.env.ENABLE_MEMORY_WRITE || "true").toLowerCase() === "true",
  MEMORY_MAX_CHARS: Number(process.env.MEMORY_MAX_CHARS || 1200),
  MEMORY_SUMMARY_MODEL: process.env.MEMORY_SUMMARY_MODEL || "gpt-4o-mini",
};

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
      sessionId: clientSessionId,
    } = body || {};

    if (!assistantId) return json(400, { error: "Missing assistantId" }, corsHeaders());
    if (!input || typeof input !== "string") return json(400, { error: "Missing input" }, corsHeaders());

    const tenantId = resolveTenantId(rawTenantId, assistantId);
    if (!tenantId) {
      return json(400, { error: "Missing tenantId (not provided and assistantId not mapped)" }, corsHeaders());
    }

    // Load assistant configuration
    const assistantConfig = loadAssistantConfig(tenantId);

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!SUPABASE_URL) return json(500, { error: "Missing SUPABASE_URL on server" }, corsHeaders());
    if (!SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY on server" }, corsHeaders());
    if (!OPENAI_API_KEY) return json(500, { error: "Missing OPENAI_API_KEY on server" }, corsHeaders());

    // Session id: use client session id if provided, else generate one
    const sessionId = (typeof clientSessionId === "string" && clientSessionId.trim())
      ? clientSessionId.trim()
      : makeSessionId();

    // Load conversation history
    const conversationHistory = await getConversationHistory({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      tenantId,
      sessionId,
      limit: CFG.CONVERSATION_HISTORY_LIMIT,
    });

    // Optional: load rolling summary
    let conversationSummary = null;
    if (CFG.ENABLE_MEMORY_READ) {
      conversationSummary = await getConversationSummary({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        tenantId,
        sessionId,
      });
    }

    /* =========================
       KB retrieval
    ========================= */

    let kbMatches = [];
    let kbContext = "";

    const kbEnabled = assistantConfig.kbEnabled !== false && CFG.KB_ENABLED;
    const kbMatchCount = assistantConfig.kbMatchCount || 5;

    if (kbEnabled) {
      const queryEmbedding = await createEmbedding({
        apiKey: OPENAI_API_KEY,
        model: CFG.EMBED_MODEL,
        input: input.trim(),
      });

      const matches = await supabaseRpcMatch({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        tenantId,
        embedding: queryEmbedding,
        matchCount: Number.isFinite(kbMatchCount) ? kbMatchCount : 5,
      });

      kbMatches = Array.isArray(matches) ? matches : [];
      kbContext = buildKbContext(kbMatches);
    }

    /* =========================
       Build OpenAI messages
    ========================= */

    const messages = [];

    // System message with KB context if available
    let systemContent = assistantConfig.systemPrompt || "You are a helpful AI assistant.";

    if (kbContext) {
      systemContent += "\n\n" + kbContext;
    }

    if (conversationSummary && CFG.ENABLE_MEMORY_READ) {
      systemContent += `\n\nConversation summary:\n${conversationSummary}`;
    }

    messages.push({
      role: "system",
      content: systemContent,
    });

    // Add conversation history
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add current user message
    messages.push({
      role: "user",
      content: input.trim(),
    });

    /* =========================
       Call OpenAI
    ========================= */

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: assistantConfig.model || "gpt-4o-mini",
        messages,
        temperature: assistantConfig.temperature || 0.3,
        max_tokens: assistantConfig.maxTokens || 500,
      }),
    });

    const raw = await openaiResp.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!openaiResp.ok) {
      return json(
        openaiResp.status,
        {
          error:
            data?.error?.message ||
            data?.message ||
            (typeof data?.raw === "string" && data.raw.trim()
              ? data.raw
              : `OpenAI request failed (${openaiResp.status})`),
          details: data,
          sessionId,
        },
        corsHeaders()
      );
    }

    const assistantMessage = data?.choices?.[0]?.message?.content || "I apologize, but I couldn't generate a response. Please try again.";

    // Save messages to conversation history
    await saveMessage({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      tenantId,
      sessionId,
      role: "user",
      content: input.trim(),
    });

    await saveMessage({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      tenantId,
      sessionId,
      role: "assistant",
      content: assistantMessage,
    });

    // Optional: update rolling summary
    if (CFG.ENABLE_MEMORY_WRITE) {
      try {
        const prev = conversationSummary || null;
        const updated = await updateRollingSummary({
          openaiKey: OPENAI_API_KEY,
          model: CFG.MEMORY_SUMMARY_MODEL,
          maxChars: CFG.MEMORY_MAX_CHARS,
          previousSummary: prev,
          userInput: input,
          assistantOutput: assistantMessage,
        });

        if (updated) {
          await upsertConversationSummary({
            supabaseUrl: SUPABASE_URL,
            serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
            tenantId,
            sessionId,
            summary: updated,
          });
        }
      } catch (e) {
        console.warn("[memory] update failed:", e?.message || e);
      }
    }

    // Return response in VAPI-compatible format for easy migration
    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        id: sessionId,
        output: [
          {
            content: assistantMessage,
            text: assistantMessage,
          },
        ],
        sessionId,
        kb: {
          tenantId,
          used: Boolean(kbContext),
          matchCount: Array.isArray(kbMatches) ? kbMatches.length : 0,
          memorySummaryUsed: Boolean(conversationSummary),
          matches: (kbMatches || []).map((m) => ({
            id: m.id,
            section: m.section,
            source: m.source,
            similarity: m.similarity,
            priority: m.priority,
          })),
        },
      }),
    };
  } catch (err) {
    console.error("[ai-chat] error", err);
    return json(500, { error: err?.message || "Server error" }, corsHeaders());
  }
};
