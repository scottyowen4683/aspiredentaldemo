// netlify/functions/vapi-chat.js
//
// Multi-tenant KB retrieval + Vapi chat + YOUR OWN SESSION CONTINUITY
//
// Key fixes:
// ✅ Accepts client-provided sessionId (generated/persisted by your widget)
// ✅ If sessionId missing, generates one and returns it
// ✅ Persists mapping: (tenantId, sessionId) -> vapi_chat_id in Supabase
// ✅ On later turns, automatically sends previousChatId to Vapi (so Vapi remembers)
// ✅ OPTIONAL memory summary read/write using your conversation_sessions table (ENV controlled)
// ✅ Optional debug fields returned so you can verify what's happening in Network/Console
//
// Required ENV:
// - VAPI_API_KEY
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - OPENAI_API_KEY
//
// Optional ENV:
// - KB_ENABLED=true|false (default true)
// - EMBED_MODEL=text-embedding-3-small (default)
// - KB_MATCH_COUNT=5 (default)
// - ALLOWED_TENANTS=moreton,goldcoast (optional)
// - ENABLE_MEMORY_READ=true|false (default false here)
// - ENABLE_MEMORY_WRITE=true|false (default false)
// - MEMORY_MAX_CHARS=1200 (default 1200)
// - MEMORY_SUMMARY_MODEL=gpt-4o-mini (default)
// - MEMORY_CONTEXT_PREFIX="Conversation summary:" (default)
//
// Tables expected:
// - public.chat_session_links (for vapi chat id mapping)
// - public.conversation_sessions (your existing summary table)

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

function parseAllowedTenants(envVal) {
  if (!envVal || typeof envVal !== "string") return null;
  const list = envVal
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : null;
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

function makeSessionId() {
  const rand = Math.random().toString(16).slice(2);
  return `sess_${Date.now()}_${rand}`;
}

/* =========================
   KB HELPERS
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
   SUPABASE TABLE HELPERS (REST)
========================= */

// GET single row: chat_session_links (tenant_id + session_id)
async function getChatLink({ supabaseUrl, serviceRoleKey, tenantId, sessionId }) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const url =
    `${base}/rest/v1/chat_session_links` +
    `?tenant_id=eq.${encodeURIComponent(tenantId)}` +
    `&session_id=eq.${encodeURIComponent(sessionId)}` +
    `&select=vapi_chat_id,updated_at` +
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
  return data[0] || null;
}

// UPSERT: chat_session_links
async function upsertChatLink({ supabaseUrl, serviceRoleKey, tenantId, sessionId, vapiChatId }) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const url = `${base}/rest/v1/chat_session_links`;

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
        vapi_chat_id: vapiChatId,
        updated_at: new Date().toISOString(),
      },
    ]),
  });

  if (!r.ok) {
    // don't hard fail — you still want answers even if persistence hiccups
    const raw = await r.text().catch(() => "");
    console.warn("[chat_session_links] upsert failed:", raw);
  }
}

// conversation_sessions: read summary
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

// conversation_sessions: upsert summary
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

// optional: update rolling summary with OpenAI chat
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
  KB_MATCH_COUNT: Number(process.env.KB_MATCH_COUNT || 5),

  ENABLE_MEMORY_READ: String(process.env.ENABLE_MEMORY_READ || "false").toLowerCase() === "true",
  ENABLE_MEMORY_WRITE: String(process.env.ENABLE_MEMORY_WRITE || "false").toLowerCase() === "true",
  MEMORY_MAX_CHARS: Number(process.env.MEMORY_MAX_CHARS || 1200),
  MEMORY_SUMMARY_MODEL: process.env.MEMORY_SUMMARY_MODEL || "gpt-4o-mini",
  MEMORY_CONTEXT_PREFIX: process.env.MEMORY_CONTEXT_PREFIX || "Conversation summary:",
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
      // client session id (from your widget localStorage)
      sessionId: clientSessionId,
      // allow manual override, but we will usually ignore and use our stored mapping
      previousChatId: bodyPreviousChatId,
    } = body || {};

    if (!assistantId) return json(400, { error: "Missing assistantId" }, corsHeaders());
    if (!input || typeof input !== "string") return json(400, { error: "Missing input" }, corsHeaders());

    const tenantId = resolveTenantId(rawTenantId, assistantId);
    if (!tenantId) {
      return json(400, { error: "Missing tenantId (not provided and assistantId not mapped)" }, corsHeaders());
    }

    const allowedTenants = parseAllowedTenants(process.env.ALLOWED_TENANTS);
    if (allowedTenants && !allowedTenants.includes(tenantId)) {
      return json(403, { error: `tenantId not allowed: ${tenantId}` }, corsHeaders());
    }

    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!VAPI_API_KEY) return json(500, { error: "Missing VAPI_API_KEY on server" }, corsHeaders());
    if (!SUPABASE_URL) return json(500, { error: "Missing SUPABASE_URL on server" }, corsHeaders());
    if (!SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY on server" }, corsHeaders());
    if (!OPENAI_API_KEY) return json(500, { error: "Missing OPENAI_API_KEY on server" }, corsHeaders());

    // Session id: use client session id if provided, else generate one
    const sessionId = (typeof clientSessionId === "string" && clientSessionId.trim())
      ? clientSessionId.trim()
      : makeSessionId();

    // Look up our stored Vapi chat id for this session
    const linkRow = await getChatLink({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      tenantId,
      sessionId,
    });

    const storedVapiChatId = linkRow?.vapi_chat_id ? String(linkRow.vapi_chat_id) : null;

    // Choose the previousChatId we will send to Vapi:
    // - manual override from caller wins ONLY if present
    // - else stored mapping wins
    const previousChatIdToSend =
      (typeof bodyPreviousChatId === "string" && bodyPreviousChatId.trim())
        ? bodyPreviousChatId.trim()
        : (storedVapiChatId || null);

    // Optional: load rolling summary (your own memory table) and inject into prompt
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

    if (CFG.KB_ENABLED) {
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
        matchCount: Number.isFinite(CFG.KB_MATCH_COUNT) ? CFG.KB_MATCH_COUNT : 5,
      });

      kbMatches = Array.isArray(matches) ? matches : [];
      kbContext = buildKbContext(kbMatches);
    }

    /* =========================
       Build Vapi injected input
    ========================= */

    const injectedInput = kbContext
      ? [
          "You are a helpful council assistant.",
          "Answer using ONLY the knowledge base excerpts below when they contain the answer.",
          "If the KB does not contain the answer, say you don’t have that information and suggest the best next step.",
          "",
          conversationSummary
            ? `${CFG.MEMORY_CONTEXT_PREFIX}\n${conversationSummary}\n`
            : "",
          kbContext,
          "",
          `USER QUESTION: ${input.trim()}`,
        ].join("\n")
      : input.trim();

    /* =========================
       Call Vapi
    ========================= */

    const payload = {
      assistantId,
      input: injectedInput,
      ...(previousChatIdToSend ? { previousChatId: previousChatIdToSend } : {}),
    };

    const vapiResp = await fetch("https://api.vapi.ai/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await vapiResp.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!vapiResp.ok) {
      return json(
        vapiResp.status,
        {
          error:
            data?.error ||
            data?.message ||
            (typeof data?.raw === "string" && data.raw.trim()
              ? data.raw
              : `Vapi request failed (${vapiResp.status})`),
          details: data,
          sessionId,
        },
        corsHeaders()
      );
    }

    // Vapi returns an id for the chat thread
    const vapiChatIdReturned = data?.id ? String(data.id) : null;

    // Store mapping (sessionId -> vapiChatIdReturned) so next request can continue
    if (vapiChatIdReturned) {
      await upsertChatLink({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        tenantId,
        sessionId,
        vapiChatId: vapiChatIdReturned,
      });
    }

    // Optional: update rolling summary (your conversation_sessions table)
    if (CFG.ENABLE_MEMORY_WRITE) {
      try {
        const prev = conversationSummary || null;
        const replyText =
          data?.output?.[0]?.content ||
          data?.output?.[0]?.text ||
          "";

        const updated = await updateRollingSummary({
          openaiKey: OPENAI_API_KEY,
          model: CFG.MEMORY_SUMMARY_MODEL,
          maxChars: CFG.MEMORY_MAX_CHARS,
          previousSummary: prev,
          userInput: input,
          assistantOutput: replyText,
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

    // Attach debug block (safe, helps you verify continuity)
    data.sessionId = sessionId;
    data.kb = {
      tenantId,
      used: Boolean(kbContext),
      matchCount: Array.isArray(kbMatches) ? kbMatches.length : 0,
      previousChatIdSent: previousChatIdToSend,
      vapiChatIdReturned,
      storedVapiChatIdBeforeCall: storedVapiChatId,
      memorySummaryUsed: Boolean(conversationSummary),
      matches: (kbMatches || []).map((m) => ({
        id: m.id,
        section: m.section,
        source: m.source,
        similarity: m.similarity,
        priority: m.priority,
      })),
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
