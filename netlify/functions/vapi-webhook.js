// Minimal VAPI webhook -> Supabase writer + auto-eval trigger
// Stores: started/ended, costs, log/recording URLs,
// small transcript preview (cheap), and marks needs_eval=true
// so eval-runner can score later.

export default async (req, res) => {
  try {
    const body = await readJson(req);

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
      return res.status(500).json({ ok: false, error: "Missing Supabase envs" });
    }

    const { message = {} } = body || {};
    const {
      type,
      status,
      endedReason,
      analysis,
      artifact,
      call,
      startedAt,
      endedAt,
      costs,
    } = normalizeVapi(message);

    // Upsert minimal record early
    if (call?.id) {
      // compute cheap preview (no LLM): try artifact.transcript or stitch brief text
      const preview = derivePreview(artifact);

      const payload = {
        id: call.id,
        started_at: call.startedAt || startedAt || new Date().toISOString(),
        ended_at: call.endedAt || endedAt || null,
        assistant:
          call.assistantName || artifact?.assistant?.name || null,
        customer_number:
          call.customerNumber || artifact?.customer?.number || null,
        status: status || type || null,
        ended_reason: endedReason || null,
        aht_seconds: call.ahtSeconds || null,
        cost_total: costs?.total ?? null,
        recording_url:
          artifact?.recordingUrl ||
          artifact?.recording?.mono?.combinedUrl ||
          null,
        log_url: artifact?.logUrl || null,
        transcript_preview: preview,
        // mark for later scoring only when the call ends
        needs_eval: type === "end-of-call-report" || status === "ended",
      };

      await supabaseUpsert(SB_URL, SB_SERVICE, "calls", payload);

      // ---- Auto-trigger eval-runner if needed ----
      if (payload?.needs_eval && call?.id) {
        const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
        const evalUrl = `${base}/.netlify/functions/eval-runner`;

        fetch(evalUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ callId: call.id }),
        }).catch((e) => console.error("eval trigger failed", e));
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("webhook error", e);
    return res
      .status(200)
      .json({ ok: false, error: e?.message || "unknown" });
  }
};

// ---------- helpers ----------

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
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

  // Costs (total at top-level if present)
  const costBlock =
    art?.costBreakdown ||
    message?.costBreakdown ||
    message?.costs?.find?.(() => false) ||
    {};
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
  // bubble common fields (works with the payload you pasted)
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
  // If no transcript provided, make a tiny “system summary” from last few messages if present
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
