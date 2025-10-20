// Minimal VAPI webhook -> Supabase writer (Netlify Functions style)
// - Stores: start/end, costs, URLs, transcript preview
// - Marks needs_eval=true and pings eval-runner when call ends

export const handler = async (event) => {
  try {
    // Allow quick browser health check
    if (event.httpMethod === "GET") {
      return json(200, { ok: true, hint: "POST Vapi call events here" });
    }
    if (event.httpMethod !== "POST") {
      return text(405, "Method Not Allowed");
    }

    const body = safeJson(event.body);

    // ---- ENV fallbacks (NO RENAMES NEEDED) ----
    const SB_URL =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASEPROJECTURL ||
      process.env.SUPABASE_URL_PUBLIC;

    const SB_SERVICE =
      process.env.SUPABASE_SERVICE_ROLE ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE ||
      process.env.SERVICE_ROLE_KEY ||
      process.env.VITE_SUPABASE_SERVICE_ROLE ||
      process.env.VITE_SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SB_URL || !SB_SERVICE) {
      return json(500, { ok: false, error: "Missing Supabase envs" });
    }

    const { message = {} } = body || {};
    const { type, status, endedReason, artifact, call, startedAt, endedAt, costs } =
      normalizeVapi(message);

    // Upsert minimal record early
    let needsEval = false;
    if (call?.id) {
      const preview = derivePreview(artifact);
      const payload = {
        id: call.id,
        started_at: call.startedAt || startedAt || new Date().toISOString(),
        ended_at: call.endedAt || endedAt || null,
        assistant: call.assistantName || artifact?.assistant?.name || null,
        customer_number: call.customerNumber || artifact?.customer?.number || null,
        status: status || type || null,
        ended_reason: endedReason || null,
        aht_seconds: call.ahtSeconds || null,
        cost_total: costs?.total ?? null,
        recording_url:
          artifact?.recordingUrl || artifact?.recording?.mono?.combinedUrl || null,
        log_url: artifact?.logUrl || null,
        transcript_preview: preview,
        needs_eval: (needsEval =
          type === "end-of-call-report" || status === "ended" || !!endedAt),
      };

      await supabaseUpsert(SB_URL, SB_SERVICE, "calls", payload);
    }

    // Fire-and-forget: trigger eval-runner after end-of-call
    if (needsEval && call?.id) {
      try {
        const origin =
          process.env.URL ||
          process.env.DEPLOY_URL ||
          `https://${event.headers.host}`;
        const evalUrl = `${origin}/.netlify/functions/eval-runner`;
        fetch(evalUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ callId: call.id }),
        }).catch(() => {});
      } catch {
        // non-blocking
      }
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(200, { ok: false, error: e?.message || "unknown" });
  }
};

// ---------- helpers ----------

function text(statusCode, body, headers = {}) {
  return { statusCode, headers, body };
}
function json(statusCode, obj, headers = {}) {
  return {
    statusCode,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(obj),
  };
}
function safeJson(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function normalizeVapi(message) {
  const type = message?.type;
  const status = message?.status;
  const endedReason = message?.endedReason;

  const art = message?.artifact || {};
  const callObj = art?.call || message?.call || {};

  // Costs (best-effort)
  const costs = {
    total:
      art?.cost ??
      message?.cost ??
      art?.costs?.total ??
      message?.costs?.total ??
      null,
  };

  // Timestamps
  const startedAt = art?.startedAt || message?.startedAt || callObj?.startedAt;
  const endedAt = art?.endedAt || message?.endedAt || callObj?.endedAt;

  // Shape a consistent 'call'
  const call = {
    id: callObj?.id || message?.call?.id,
    startedAt,
    endedAt,
    ahtSeconds: art?.durationSeconds || message?.durationSeconds || null,
    assistantName: art?.assistant?.name || message?.assistant?.name || null,
    customerNumber: art?.customer?.number || message?.customer?.number || null,
  };

  return {
    type,
    status,
    endedReason,
    artifact: massageArtifact(art),
    call,
    startedAt,
    endedAt,
    costs,
  };
}

function massageArtifact(a = {}) {
  return {
    assistant: a.assistant || {},
    customer: a.customer || {},
    recordingUrl: a.recordingUrl || a?.recording?.mono?.combinedUrl || null,
    logUrl: a.logUrl || null,
    transcript: a.transcript || "",
  };
}

// cheap, bounded preview (no model calls; <= 700 chars)
function derivePreview(artifact) {
  const t = (artifact?.transcript || "").trim();
  if (t) return t.slice(0, 700);
  return "";
}

async function supabaseUpsert(url, serviceKey, table, row) {
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([row]),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Supabase upsert failed: ${text}`);
  }
}
