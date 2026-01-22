// frontend/netlify/functions/kb-search.js

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

function loadAssistantMap() {
  const p = path.join(__dirname, "tenants", "assistant-map.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function singleLine(str) {
  return String(str || "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function vapiRespond(toolCallId, resultString, errorString) {
  const body = {
    results: [
      errorString
        ? { toolCallId, error: singleLine(errorString) }
        : { toolCallId, result: singleLine(resultString) },
    ],
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-aspire-webhook-secret",
    },
    body: JSON.stringify(body),
  };
}

function httpJson(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-aspire-webhook-secret",
    },
    body: JSON.stringify(bodyObj),
  };
}

/** Deterministic “lookup” intent detection (no LLM). */
function detectLookupType(q) {
  const s = q.toLowerCase();

  const binSignals = [
    "bin day",
    "bin collection",
    "collection day",
    "when is my bin",
    "when is bin",
    "general waste",
    "recycling",
    "green waste",
    "green bin",
    "wheelie",
  ];
  if (binSignals.some((x) => s.includes(x))) return "bins";

  return null;
}

/** Extract suburb-ish token from user query. */
function extractSuburb(q) {
  const raw = String(q || "").trim();
  if (!raw) return "";

  if (/^[A-Za-z][A-Za-z\s'-]{1,40}$/.test(raw) && raw.split(/\s+/).length <= 3) {
    return raw; // e.g. "Griffin", "North Lakes"
  }

  const m = raw.match(/\bin\s+([A-Za-z][A-Za-z\s'-]{1,40})\b/i);
  if (m && m[1]) return m[1].trim();

  const m2 = raw.match(/(?:bin day|collection day|bin collection)\s+([A-Za-z][A-Za-z\s'-]{1,40})/i);
  if (m2 && m2[1]) return m2[1].trim();

  return "";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-aspire-webhook-secret",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return httpJson(405, { error: "Method Not Allowed" });
  }

  // Security gate
  const requiredSecret = process.env.ASPIRE_WEBHOOK_SECRET;
  if (requiredSecret) {
    const provided =
      event.headers["x-aspire-webhook-secret"] ||
      event.headers["X-Aspire-Webhook-Secret"] ||
      event.headers["x-aspire-webhook-secret".toLowerCase()];

    if (!provided || provided !== requiredSecret) {
      const safeToolCallId = "unknown";
      return vapiRespond(safeToolCallId, "", "Unauthorized: missing or invalid webhook secret");
    }
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  const toolCallId = body?.toolCallId || body?.id || body?.tool_call_id || "unknown";

  try {
    const query = body.query || body.input || "";
    const qs = event.queryStringParameters || {};
    const tenantFromUrl = qs.tenant ? String(qs.tenant) : "";

    const assistantId = body.assistantId ? String(body.assistantId) : "";
    let tenant_id = tenantFromUrl;

    if (!tenant_id) {
      if (!assistantId) {
        return vapiRespond(toolCallId, "", "Missing tenant (use ?tenant=...) and missing assistantId");
      }
      const map = loadAssistantMap();
      tenant_id = map[assistantId];
      if (!tenant_id) {
        return vapiRespond(toolCallId, "", `assistantId is not mapped to a tenant: ${assistantId}`);
      }
    }

    if (!query || typeof query !== "string") {
      return vapiRespond(toolCallId, "", "Missing query");
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";

    if (!SUPABASE_URL) return vapiRespond(toolCallId, "", "Missing SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) return vapiRespond(toolCallId, "", "Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!OPENAI_API_KEY) return vapiRespond(toolCallId, "", "Missing OPENAI_API_KEY");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const topK = Number(body.topK || 6);

    // -----------------------------
    // 1) METADATA-FIRST LOOKUP (bins)
    // -----------------------------
    const lookupType = detectLookupType(query);
    if (lookupType === "bins") {
      const suburb = extractSuburb(query);

      // If user hasn't provided suburb, tell assistant to ask for it (don’t fall back to vague RAG).
      if (!suburb) {
        const result = `tenant=${tenant_id} | mode=bins_lookup | needs=suburb | message=Ask the user which suburb their address is in (e.g. Griffin, North Lakes).`;
        return vapiRespond(toolCallId, result, "");
      }

      // Query derived rows (created by your new indexing script)
      const { data: lookupData, error: lookupErr } = await supabase.rpc("lookup_knowledge_chunks", {
        tenant_filter: tenant_id,
        section_filter: "waste_bins",
        meta_type: "bin_collection",
        meta_key: "suburb",
        meta_value: suburb,
        match_count: Math.min(topK, 5),
      });

      if (lookupErr) {
        // If RPC missing or error, fall through to vector (but don’t hard fail)
      } else if (Array.isArray(lookupData) && lookupData.length) {
        const evidence = lookupData
          .slice(0, topK)
          .map((r, idx) => {
            const url = r.url ? ` {url:${r.url}}` : "";
            const snippet = singleLine(r.content).slice(0, 420);
            return `${idx + 1}. [${r.source}] (waste_bins)${url} ${snippet}`;
          })
          .join(" | ");

        const result = `tenant=${tenant_id} | mode=bins_lookup | suburb=${suburb} | matches=${lookupData.length} | ${evidence}`;
        return vapiRespond(toolCallId, result, "");
      }

      // If we didn’t find a derived row, return a clean instruction rather than vague “no info”.
      // (This usually means indexing hasn’t run yet, or suburb name doesn’t match exactly.)
      const result = `tenant=${tenant_id} | mode=bins_lookup | suburb=${suburb} | matches=0 | message=No derived suburb row found. This usually means the KB indexing hasn’t generated derived bin-day rows yet, or the suburb spelling differs.`;
      return vapiRespond(toolCallId, result, "");
    }

    // -----------------------------
    // 2) VECTOR FALLBACK (general)
    // -----------------------------
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const emb = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: query,
    });

    const query_embedding = emb.data[0].embedding;

    const { data, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding,
      match_count: topK,
      tenant_filter: tenant_id,
    });

    if (error) {
      return vapiRespond(toolCallId, "", `Supabase RPC failed: ${singleLine(JSON.stringify(error))}`);
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      return vapiRespond(toolCallId, "", `No KB matches found for tenant '${tenant_id}'`);
    }

    const evidence = rows
      .slice(0, topK)
      .map((r, idx) => {
        const sec = r.section ? ` (${r.section})` : "";
        const src = r.source ? ` [${r.source}]` : "";
        const snippet = singleLine(r.content).slice(0, 420);
        return `${idx + 1}.${src}${sec} ${snippet}`;
      })
      .join(" | ");

    const result = `tenant=${tenant_id} | mode=rag | matches=${rows.length} | ${evidence}`;
    return vapiRespond(toolCallId, result, "");
  } catch (err) {
    return vapiRespond(toolCallId, "", err?.message || "Server error");
  }
};
