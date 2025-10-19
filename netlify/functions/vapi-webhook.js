// netlify/functions/vapi-webhook.js
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DISABLE_SIGNATURE_CHECK = process.env.DISABLE_SIGNATURE_CHECK === "1";
const DEBUG = process.env.DEBUG_LOG === "1";
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || "";
const DEFAULT_RUBRIC_ID = process.env.EVAL_DEFAULT_RUBRIC_ID || "43d9b1fe-570f-4c97-abdb-fbbb73ef3d08";

function log(...a){ if (DEBUG) console.log(...a); }

function verifySignature(raw, sig) {
  if (DISABLE_SIGNATURE_CHECK) return true;
  const hmac = crypto.createHmac("sha256", VAPI_WEBHOOK_SECRET);
  hmac.update(raw, "utf8");
  const digest = `sha256=${hmac.digest("hex")}`;
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig||"")); }
  catch { return false; }
}

function mapStatus(s){
  const m={queued:"created",ringing:"in-progress","in-progress":"in-progress",completed:"ended",ended:"ended"};
  return m[String(s||"").toLowerCase()]||"unknown";
}

async function upsertSession(row){
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions?on_conflict=id`,{
    method:"POST",
    headers:{
      apikey:SERVICE_KEY,
      Authorization:`Bearer ${SERVICE_KEY}`,
      "Content-Type":"application/json",
      Prefer:"resolution=merge-duplicates,return=minimal"
    },
    body:JSON.stringify(row)
  });
  return res.ok;
}

// ✅ update or insert into top_questions_30d table
async function updateTopQuestions(questions) {
  if (!questions || !questions.length) return;
  const values = questions.map(q => ({
    question_text: q,
    asked_at: new Date().toISOString()
  }));

  const res = await fetch(`${SUPABASE_URL}/rest/v1/top_questions_30d`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates"
    },
    body: JSON.stringify(values)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ Failed to insert top questions:", res.status, text);
  } else {
    log(`✅ Inserted ${values.length} top questions`);
  }
}

exports.handler = async (event)=>{
  if(event.httpMethod!=="POST") 
    return {statusCode:200,body:"ok"};
  const raw = event.isBase64Encoded?Buffer.from(event.body,"base64").toString():event.body;
  const sig = event.headers["x-vapi-signature"];
  if(!verifySignature(raw,sig))
    return {statusCode:401,body:"bad sig"};

  const payload = JSON.parse(raw);
  const pc = payload.data?.phoneCall || payload.data?.call || payload.message?.phoneCall;
  const call_id = pc?.id || payload.data?.id;
  if(!call_id) return {statusCode:200,body:"no call id"};

  const status = mapStatus(pc?.status);

  // ✅ extract top user questions
  let top_questions = [];
  if (Array.isArray(pc?.messages)) {
    top_questions = pc.messages
      .filter(m => m.role === "user" && typeof m.text === "string")
      .map(m => m.text)
      .slice(0, 5);
  }

  const row = {
    id: call_id,
    assistant_id: pc?.assistantId || payload.assistantId,
    started_at: pc?.createdAt || new Date().toISOString(),
    ended_at: pc?.endedAt || null,
    status,
    direction: pc?.direction || "outbound",
    from_number: pc?.from?.phoneNumber || null,
    to_number: pc?.customer?.number || null,
    last_event_type: payload.event || payload.type || "unknown",
    top_questions,
    updated_at: new Date().toISOString(),
    raw: payload
  };

  log("UPSERT session", row);
  const ok = await upsertSession(row);
  if(!ok) return {statusCode:500,body:"db fail"};

  // ✅ also insert into 30-day top questions log
  await updateTopQuestions(top_questions);

  // ✅ queue eval automatically when ended
  if(status==="ended"){
    const evalBody = {
      session_id: call_id,
      rubric_id: DEFAULT_RUBRIC_ID,
      status: "queued",
      started_at: new Date().toISOString()
    };
    await fetch(`${SUPABASE_URL}/rest/v1/eval_runs`,{
      method:"POST",
      headers:{
        apikey:SERVICE_KEY,
        Authorization:`Bearer ${SERVICE_KEY}`,
        "Content-Type":"application/json",
        Prefer:"resolution=merge-duplicates,return=minimal"
      },
      body:JSON.stringify(evalBody)
    });
    log("queued eval for", call_id);
  }

  return {statusCode:200,body:"ok"};
};
