// netlify/functions/vapi-chat.js
//
// Multi-tenant KB retrieval + Vapi chat + OUR OWN SESSION CONTINUITY
//
// Key change:
// - Vapi does NOT provide a stable session id for chat.
// - We generate/accept our own sessionId and persist the returned Vapi chat id
//   (data.id) against (tenantId, sessionId) in Supabase.
// - On later requests we look up that stored vapi_chat_id and send as previousChatId.
//
// Requires Supabase table:
// public.chat_session_links (tenant_id, session_id, vapi_chat_id, updated_at)
//
// Optional KB injection remains the same.

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

  const bodyArray = {
    p_tenant_id: tenantId,
    p_query_embedding: embedding,
    p_match_count: matchCount,
  };

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  // Attempt 1: array
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

  // Attempt 2: vector literal string
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

/* =========================
   SESSION LINK STORAGE (Supabase PostgREST)
========================= */

async function loadLinkedVapiChatId({ supabaseUrl, serviceRoleKey, tenantId, sessionId }) {
  const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/chat_session_links` +
    `?tenant_id=eq.${encodeURIComponent(tenantId)}` +
    `&session_id=eq.${encodeURIComponent(sessionId)}` +
    `&select=vapi_chat_id`;

  const r = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });

  const raw = await r.text();
  let data;
  try { data = raw ? JSON.parse(raw) : []; } catch { data = []; }

  if (!r.ok) return null;
  const row = Array.isArray(data) ? data[0] : null;
  const id = row?.vapi_chat_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

async function upsertLinkedVapiChatId({ supabaseUrl, serviceRoleKey, tenantId, sessionId, vapiChatId }) {
  const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/chat_session_links`;

  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{
      tenant_id: tenantId,
      session_id: sessionId,
      vapi_chat_id: vapiChatId,
      updated_at: new Date().toISOString(),
    }]),
  });

  // We don’t care about body; just that it worked
  return r.ok;
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
      sessionId: rawSessionId,     // ✅ our stable session key
      previousChatId: rawPrevChatId // optional override
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
    if (!VAPI_API_KEY) return json(500, { error: "Missing VAPI_API_KEY on server" }, corsHeaders());

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    const KB_ENABLED = String(process.env.KB_ENABLED || "true").toLowerCase() !== "false";
    const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
    const KB_MATCH_COUNT = Number(process.env.KB_MATCH_COUNT || 5);

    // ✅ sessionId: if client didn’t send one, generate a simple fallback.
    // (Client SHOULD send one; this just prevents hard failure.)
    const sessionId =
      (typeof rawSessionId === "string" && rawSessionId.trim() ? rawSessionId.trim() : null) ||
      `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // ✅ Resolve previousChatId in priority order:
    // 1) explicitly provided by client (rawPrevChatId)
    // 2) load stored vapi_chat_id from Supabase via (tenantId, sessionId)
    let previousChatId =
      (typeof rawPrevChatId === "string" && rawPrevChatId.trim() ? rawPrevChatId.trim() : null);

    if (!previousChatId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      previousChatId = await loadLinkedVapiChatId({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        tenantId,
        sessionId,
      });
    }

    // ==== KB retrieval (optional) ====
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
          "If the KB does not contain the answer, say you don’t have that information and suggest the best next step.",
          "",
          kbContext,
          "",
          `USER QUESTION: ${input.trim()}`,
        ].join("\n")
      : input.trim();

    const payload = {
      assistantId,
      input: injectedInput,
      ...(previousChatId ? { previousChatId } : {}),
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
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

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
          sessionId, // return anyway for debugging
        },
        corsHeaders()
      );
    }

    // ✅ store Vapi chat id for next turn
    const returnedVapiChatId = typeof data?.id === "string" && data.id.trim() ? data.id.trim() : null;
    if (returnedVapiChatId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      await upsertLinkedVapiChatId({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        tenantId,
        sessionId,
        vapiChatId: returnedVapiChatId,
      });
    }

    // Helpful debug (safe)
    data.sessionId = sessionId; // ✅ ALWAYS return our stable session id
    data.kb = {
      tenantId,
      used: Boolean(kbContext),
      matchCount: Array.isArray(kbMatches) ? kbMatches.length : 0,
      previousChatIdSent: previousChatId || null,
      vapiChatIdReturned: returnedVapiChatId || null,
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
