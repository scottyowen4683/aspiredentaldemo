// netlify/functions/vapi-chat.js
//
// Fixes conversation continuity by using Vapi sessionId properly.
// - If no sessionId is provided, creates one via POST https://api.vapi.ai/session (requires assistantId)
// - Then chats via POST https://api.vapi.ai/chat using ONLY { sessionId, input } (no assistantId allowed)
//
// Still supports KB retrieval + injection via Supabase + OpenAI embeddings.
//
// Request body expected from widget:
// {
//   assistantId: "...",         // required to create session if sessionId missing
//   tenantId: "moreton",        // required for KB filtering
//   input: "user message",      // required
//   sessionId: "session_xxx"    // optional; persisted in localStorage by widget
// }
//
// Response includes:
// {
//   ...vapiChatResponse,
//   sessionId: "session_xxx",
//   kb: { ...debug }
// }

const fs = require("fs");
const path = require("path");

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
  const direct = normaliseTenantId(rawTenantId);
  if (direct) return direct;

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
    const err = new Error(msg);
    err.status = r.status;
    err.details = data;
    throw err;
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

  // Attempt 1: send array
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

  // Attempt 2: send vector literal string
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
    const err = new Error(msg);
    err.status = r.status;
    err.details = data;
    throw err;
  }

  return data;
}

async function vapiCreateSession({ apiKey, assistantId }) {
  const r = await fetch("https://api.vapi.ai/session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assistantId }),
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
      data?.error ||
      data?.message ||
      (typeof data?.raw === "string" && data.raw.trim()
        ? data.raw
        : `Vapi session create failed (${r.status})`);
    const err = new Error(msg);
    err.status = r.status;
    err.details = data;
    throw err;
  }

  if (!data?.id) throw new Error("Vapi session create returned no session id.");
  return data.id;
}

async function vapiChat({ apiKey, sessionId, input }) {
  // IMPORTANT: when using sessionId, DO NOT send assistantId. Vapi will 400. :contentReference[oaicite:1]{index=1}
  const r = await fetch("https://api.vapi.ai/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, input }),
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
      data?.error ||
      data?.message ||
      (typeof data?.raw === "string" && data.raw.trim()
        ? data.raw
        : `Vapi chat failed (${r.status})`);
    const err = new Error(msg);
    err.status = r.status;
    err.details = data;
    throw err;
  }

  return data;
}

exports.handler = async (event) => {
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
      sessionId: incomingSessionId,
    } = body || {};

    if (!assistantId || typeof assistantId !== "string") {
      return json(400, { error: "Missing assistantId" }, corsHeaders());
    }

    if (!input || typeof input !== "string") {
      return json(400, { error: "Missing input" }, corsHeaders());
    }

    const tenantId = resolveTenantId(rawTenantId, assistantId);
    if (!tenantId) {
      return json(
        400,
        { error: "Missing tenantId (not provided and assistantId not mapped)" },
        corsHeaders()
      );
    }

    const allowedTenants = parseAllowedTenants(process.env.ALLOWED_TENANTS);
    if (allowedTenants && !allowedTenants.includes(tenantId)) {
      return json(403, { error: `tenantId not allowed: ${tenantId}` }, corsHeaders());
    }

    const VAPI_API_KEY = process.env.VAPI_API_KEY;
    if (!VAPI_API_KEY) {
      return json(500, { error: "Missing VAPI_API_KEY on server" }, corsHeaders());
    }

    // Resolve / create Vapi session
    let sessionId = (incomingSessionId && String(incomingSessionId).trim()) || null;
    if (!sessionId) {
      sessionId = await vapiCreateSession({ apiKey: VAPI_API_KEY, assistantId });
    }

    // KB retrieval env
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    const KB_ENABLED = String(process.env.KB_ENABLED || "true").toLowerCase() !== "false";
    const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
    const KB_MATCH_COUNT = Number(process.env.KB_MATCH_COUNT || 5);

    let kbMatches = [];
    let kbContext = "";

    if (KB_ENABLED && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && OPENAI_API_KEY) {
      const queryEmbedding = await createEmbedding({
        apiKey: OPENAI_API_KEY,
        model: EMBED_MODEL,
        input: input.trim(),
      });

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

    // Chat with Vapi using sessionId-only payload
    let chatData;
    try {
      chatData = await vapiChat({ apiKey: VAPI_API_KEY, sessionId, input: injectedInput });
    } catch (e) {
      // If session expired (sessions expire ~24h) we recreate once and retry :contentReference[oaicite:2]{index=2}
      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("session") || msg.toLowerCase().includes("expired")) {
        sessionId = await vapiCreateSession({ apiKey: VAPI_API_KEY, assistantId });
        chatData = await vapiChat({ apiKey: VAPI_API_KEY, sessionId, input: injectedInput });
      } else {
        throw e;
      }
    }

    // Attach sessionId so the widget can persist it
    chatData.sessionId = sessionId;

    // Optional debug
    chatData.kb = {
      tenantId,
      used: Boolean(kbContext),
      matchCount: Array.isArray(kbMatches) ? kbMatches.length : 0,
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
      body: JSON.stringify(chatData),
    };
  } catch (err) {
    console.error("[vapi-chat] error", err);
    return json(500, { error: err?.message || "Server error" }, corsHeaders());
  }
};
