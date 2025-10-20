export default async (request) => {
  // Accept either POST {summary} or GET ?summary=...
  let summary = '';
  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    summary = (body?.summary || '').toString();
  } else {
    const url = new URL(request.url);
    summary = (url.searchParams.get('summary') || '').toString();
  }

  // Parse the tiny pipe-delimited summary if present
  const fields = parseSummary(summary);
  const evalResult = simpleEval({
    endedReason: fields.ended || '',
    cost: isFiniteNumber(fields.cost) ? Number(fields.cost) : 0
  });

  return Response.json({
    ok: true,
    inputSummary: summary,
    parsed: fields,
    eval: evalResult
  });
};

function parseSummary(s) {
  const out = {};
  s.split('|').map(x => x.trim()).forEach(kv => {
    const [k, ...rest] = kv.split(':');
    if (!k || !rest.length) return;
    out[k] = rest.join(':');
  });
  return out;
}
function isFiniteNumber(x) {
  return !Number.isNaN(Number(x)) && Number.isFinite(Number(x));
}
function simpleEval({ endedReason = '', cost = 0 }) {
  const normalized = endedReason.toLowerCase();
  const success =
    normalized.includes('assistant-ended-call') ||
    normalized.includes('completed') ||
    normalized.includes('voicemail');
  const score = success ? 1 : 0;
  return { score, reason: endedReason || 'unknown', cost };
}
