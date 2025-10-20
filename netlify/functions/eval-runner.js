// GET /.netlify/functions/eval-runner?callId=<uuid>
export default async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const callId = url.searchParams.get('callId');
    if (!callId) return res.status(400).json({ ok: false, error: 'Missing callId' });

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

    const OPENAI =
      process.env.OPENAI_API_KEY ||
      process.env.VITE_OPENAI_API_KEY ||
      process.env.OPENAI_API_TOKEN;

    if (!SB_URL || !SB_SERVICE) {
      return res.status(500).json({ ok: false, error: 'Missing Supabase envs' });
    }
    if (!OPENAI) {
      // still finalize without scoring so dashboard shows transcript
      const { transcript, preview } = await fetchLightTranscript(SB_URL, SB_SERVICE, callId);
      await persistResults(SB_URL, SB_SERVICE, callId, {
        score: 0,
        rubric_json: { error: 'no_openai_key' },
        transcript_preview: preview,
        full_transcript: transcript,
        needs_eval: false
      });
      return res.status(200).json({ ok: true, scored: false });
    }

    // 1) get call row to find log_url (cheap)
    const call = await sbSelectOne(SB_URL, SB_SERVICE, 'calls', callId);
    const logUrl = call?.log_url;

    const { transcript, preview } = await buildTranscriptFromLog(logUrl);

    // 2) tiny eval
    const { total, rubric } = await scoreWithRubric(transcript, OPENAI);

    // 3) store
    await persistResults(SB_URL, SB_SERVICE, callId, {
      score: total,
      rubric_json: rubric,
      transcript_preview: preview,
      full_transcript: transcript,
      needs_eval: false
    });

    return res.status(200).json({ ok: true, scored: true, score: total });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e?.message || 'unknown' });
  }
};

// ---------- helpers ----------

async function sbSelectOne(url, key, table, id) {
  const r = await fetch(`${url}/rest/v1/${table}?id=eq.${id}&select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const j = await r.json();
  return j?.[0] || null;
}

async function persistResults(url, key, callId, { score, rubric_json, transcript_preview, full_transcript, needs_eval }) {
  // upsert call
  await fetch(`${url}/rest/v1/calls`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id: callId, score, rubric_json, transcript_preview, needs_eval }])
  });

  // upsert transcript
  await fetch(`${url}/rest/v1/transcripts`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ call_id: callId, full_transcript }])
  });
}

async function buildTranscriptFromLog(logUrl) {
  try {
    if (!logUrl) return { transcript: '', preview: '' };
    const resp = await fetch(logUrl);
    if (!resp.ok) return { transcript: '', preview: '' };

    const text = await resp.text();
    // log is JSONL; extract only user/assistant text lines
    const lines = text.split('\n').slice(-600); // last 600 lines at most
    const utterances = [];
    for (const ln of lines) {
      try {
        const j = JSON.parse(ln);
        const role = j?.message?.role || j?.role;
        const content = (j?.message?.content || j?.content || '').toString().trim();
        if (!content) continue;
        if (role === 'user' || role === 'assistant' || role === 'customer') {
          // skip system prompts
          utterances.push(`${role}: ${content}`);
        }
      } catch {}
    }
    let transcript = utterances.join('\n');
    if (transcript.length > 8000) transcript = transcript.slice(-8000); // hard cap
    const preview = transcript.slice(0, 700);
    return { transcript, preview };
  } catch {
    return { transcript: '', preview: '' };
  }
}

async function fetchLightTranscript(SB_URL, SB_SERVICE, callId) {
  const call = await sbSelectOne(SB_URL, SB_SERVICE, 'calls', callId);
  const { transcript, preview } = await buildTranscriptFromLog(call?.log_url);
  return { transcript, preview };
}

async function scoreWithRubric(transcript, OPENAI_KEY) {
  // ultra-compact prompt (keep tokens low)
  const sys = `Score a service call 0-100 using five equally weighted criteria:
1 Greeting & ID
2 Intent capture & confirmation
3 Guidance/Resolution quality
4 Clarity/brevity (≤30 words per turn)
5 Proper closing & next steps
Return JSON: {"total":<int>,"breakdown":{"greeting":..,"intent":..,"resolution":..,"clarity":..,"closing":..},"notes":"one-line"}
Scores are multiples of 5. If transcript is empty, total=0.`;

  const user = transcript.slice(-5000); // cap input

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',             // cheap
      temperature: 0,
      max_tokens: 200,                  // tiny output
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ],
      response_format: { type: 'json_object' }
    })
  });

  const j = await r.json();
  let total = 0; let breakdown = {}; let notes = '';
  try {
    const parsed = JSON.parse(j.choices?.[0]?.message?.content || '{}');
    total = Math.max(0, Math.min(100, parsed.total ?? 0));
    breakdown = parsed.breakdown || {};
    notes = parsed.notes || '';
  } catch {}
  return { total, rubric: { breakdown, notes } };
}
