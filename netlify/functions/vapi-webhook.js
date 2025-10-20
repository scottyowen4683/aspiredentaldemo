export default async (request) => {
  // Parse once; keep it cheap
  const body = await request.json().catch(() => ({}));

  // Pluck only what we need (no big prompts)
  const msg = body?.message || {};
  const endedReason = msg?.endedReason || msg?.status || '';
  const call = msg?.artifact?.call || msg?.call || {};
  const callId = call?.id || request.headers.get('x-call-id') || '';
  const startedAt = msg?.startedAt || call?.createdAt || '';
  const endedAt = msg?.endedAt || '';
  const cost = (msg?.cost ?? call?.cost ?? 0);

  // Tiny summary (~200 chars)
  const summary = [
    endedReason && `ended:${endedReason}`,
    callId && `callId:${callId}`,
    startedAt && `start:${startedAt}`,
    endedAt && `end:${endedAt}`,
    (cost !== undefined) && `cost:${cost}`
  ].filter(Boolean).join(' | ');

  // Do a super-light eval locally (no LLM calls)
  const evalResult = simpleEval({ endedReason, cost });

  // OPTIONAL: If you want DB logging later, insert one row here.
  // Keep off for now to avoid extra costs.

  // Respond fast
  return Response.json({ ok: true, summary, eval: evalResult });
};

// Zero-cost heuristic (tweak anytime)
function simpleEval({ endedReason = '', cost = 0 }) {
  const normalized = endedReason.toLowerCase();
  const success =
    normalized.includes('assistant-ended-call') ||
    normalized.includes('completed') ||
    normalized.includes('voicemail');
  const score = success ? 1 : 0;
  return { score, reason: endedReason || 'unknown', cost };
}
