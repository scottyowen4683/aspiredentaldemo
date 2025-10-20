// vapi-webhook.js  (Web API handler)
// VERSION: 2025-10-20 14:10  (use this line to confirm in logs)

export default async (request, context) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { message = {} } = body || {};

    // ---- ENV fallbacks (NO RENAMES) ----
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
      process.env.VITE_SUPABASE_SERVICE_KEY;

    if (!SB_URL || !SB_SERVICE) {
      return json({ ok: false, error: "Missing Supabase envs" }, 500);
    }

    const { type, status, endedReason, artifact, call, startedAt, endedAt, costs } =
      normalizeVapi(message);

    let payload = null;

    if (call?.id) {
      const preview = derivePreview(artifact);
      payload = {
        id: call.id,
        started_at: call.startedAt || startedAt || new Date().toISOString(),
        ended_at: call.endedAt || endedAt || null,
        assistant: call.assistantName || artifact?.assistant?.name || null,
        customer_number: call.customerNumber || artifact?.customer?.number || null,
        status: status || type || null,
        ended_reason: endedReason || null,
        aht_seconds: call.ahtSeconds || null,
        cost_total: costs?.total ?? null,
        recording_url: artifact?.recordingUrl || artifact?.recording?.mono?.combinedUrl || null,
        log_url: artifact?.logUrl || null,
        transcript_preview: preview,
        needs_eval: type === "end-of-call-report" || status === "ended",
      };

      await supabaseUpsert(SB_URL, SB_SERVICE, "calls", payload);
    }

    // Fire-and-forget eval trigger only when a call just ended
    if (payload?.needs_eval && call?.id) {
      const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
      const evalUrl = `${base}/.netlify/functions/eval-runner`;
      fetch(evalUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callId: call.id }),
      }).catch((e) => console.error("eval trigger failed", e));
    }

    console.log("vapi-webhook OK for", call?.id);
    return json({ ok: true });
  } catch (e) {
    console.error("vapi-webhook error", e);
    // Always 200 so VAPI doesn’t retry with backoff loops
    return json({ ok: false, error: e?.message || "unknown" }, 200);
  }
};

// ---------- helpers ----------
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeVapi(message) {
  const type = message?.type;
  const status = message?.status;
  const endedReason = message?.endedReason;

  const art = message?.artifact || {};
  const callObj = art?.call || message?.call || {};

  const costs = {
    total:
      art?.cost ??
      message?.cost ??
      art?.costs?.total ??
      message?.costs?.total ??
      null,
  };

  const startedAt = art?.startedAt || message?.startedAt || callObj?.startedAt;
  const endedAt = art?.endedAt || message?.endedAt || callObj?.endedAt;

  const call = {
    id: callObj?.id || message?.call?.id,
    startedAt,
    endedAt,
    ahtSeconds: art?.durationSeconds || message?.durationSeconds,
    assistantName: art?.assistant?.name || message?.assistant?.name,
    customerNumber: art?.customer?.number || message?.customer?.number,
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

// <= 700 chars, no LLM
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
