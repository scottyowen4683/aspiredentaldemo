// netlify/functions/vapi-webhook.js
import crypto from "crypto";

/**
 * Env (Netlify):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - VAPI_WEBHOOK_SECRET          (set later; keep DISABLE_SIGNATURE_CHECK=1 while testing)
 * - DISABLE_SIGNATURE_CHECK=1    (while testing)
 * - DEBUG_LOG=1                  (optional)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET;
const DISABLE_SIGNATURE_CHECK = process.env.DISABLE_SIGNATURE_CHECK === "1";
const DEBUG = process.env.DEBUG_LOG === "1";
const log = (...a) => { if (DEBUG) console.log(...a); };

function verifySignature(rawBody, signature) {
  if (DISABLE_SIGNATURE_CHECK) return true;
  if (!VAPI_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", VAPI_WEBHOOK_SECRET);
  hmac.update(rawBody, "utf8");
  const digest = `sha256=${hmac.digest("hex")}`;
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature || "")); }
  catch { return false; }
}

/** Soft status mapping to our dashboard statuses */
function mapStatus(s) {
  if (!s) return null;
  const m = {
    queued: "created",
    created: "created",
    ringing: "in-progress",
    inprogress: "in-progress",
    "in-progress": "in-progress",
    completed: "ended",
    ended: "ended",
    failed: "failed",
    busy: "failed",
    noanswer: "failed",
    "no-answer": "failed",
    canceled: "failed",
  };
  return m[String(s).toLowerCase()] || s;
}

/** Try many Vapi shapes to build a calls row */
function toRow(payload) {
  // Common containers
  const eventType = payload?.event || payload?.type || payload?.message?.type || "unknown";
  const data = payload?.data || payload;

  // 1) Primary: data.phoneCall or data.call
  const pc = data?.phoneCall || data?.call;

  // 2) Message events: payload.message.{callId|phoneCallId|status|timestamp}
  const msg = payload?.message;

  // Extract a call id from any known place
  const call_id =
    pc?.id ||
    data?.id ||
    msg?.callId ||
    msg?.phoneCallId ||
    msg?.conversationId || // fallback (not ideal)
    null;

  // Numbers (if present on call)
  const to_number =
    pc?.customer?.number || pc?.to?.phoneNumber || pc?.to || null;
  const from_number =
    pc?.from?.phoneNumber || pc?.from || null;

  // Times
  const createdAt = pc?.createdAt || data?.createdAt || null;
  const startedAt = pc?.startedAt || createdAt || (msg?.timestamp ? new Date(msg.timestamp).toISOString() : null);
  const endedAt = pc?.endedAt || pc?.completedAt || null;

  // Status from any source
  const rawStatus = pc?.status || data?.status || msg?.status || null;
  const status = mapStatus(rawStatus) || (eventType.includes("ended") ? "ended" : null) || "unknown";

  // Duration if we have both
  const duration_sec =
    endedAt && startedAt ?
