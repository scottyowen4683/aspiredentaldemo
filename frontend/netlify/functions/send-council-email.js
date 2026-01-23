// netlify/functions/send-council-email.js
//
// Sends council request emails via Brevo API
//
// IMPORTANT SECURITY:
// - All emails during PILOT go to RECIPIENT_EMAIL (scott@aspireexecutive.com.au)
// - Never sends to actual council addresses during testing
// - Recipient is forced server-side (payload "to" field is ignored)
//
// Required ENV:
// - BREVO_API_KEY
// - SENDER_EMAIL (from email)
// - RECIPIENT_EMAIL (scott@aspireexecutive.com.au for pilot)
//
// Optional ENV:
// - COUNCIL_INBOX_EMAIL (overrides RECIPIENT_EMAIL if set, but still goes to pilot email)

/* =========================
   HELPERS
========================= */

function json(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
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

/* =========================
   EMAIL SENDER (BREVO API)
========================= */

async function sendBrevoEmail({ apiKey, senderEmail, recipientEmail, subject, htmlContent, senderName }) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: senderName || "Aspire AI Services",
      },
      to: [{ email: recipientEmail }],
      subject,
      htmlContent,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || `Brevo API error: ${response.status}`);
  }

  return data;
}

/* =========================
   HANDLER
========================= */

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" }, corsHeaders());
  }

  try {
    const BREVO_API_KEY = process.env.BREVO_API_KEY;
    const SENDER_EMAIL = process.env.SENDER_EMAIL;
    const RECIPIENT_EMAIL = process.env.COUNCIL_INBOX_EMAIL || process.env.RECIPIENT_EMAIL;

    if (!BREVO_API_KEY) {
      return json(500, { error: "Missing BREVO_API_KEY environment variable" }, corsHeaders());
    }
    if (!SENDER_EMAIL) {
      return json(500, { error: "Missing SENDER_EMAIL environment variable" }, corsHeaders());
    }
    if (!RECIPIENT_EMAIL) {
      return json(500, { error: "Missing RECIPIENT_EMAIL environment variable" }, corsHeaders());
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const {
      tenantId,
      requestType,
      residentName,
      residentPhone,
      residentEmail,
      address,
      preferredContactMethod,
      urgency,
      details,
      extraMetadata,
    } = body;

    // Validation
    if (!requestType || !residentName) {
      return json(400, { error: "Missing required fields: requestType, residentName" }, corsHeaders());
    }

    // Build email HTML
    const subject = `New Council Request – ${requestType}`;

    const htmlContent = `
      <h2>New Council Request – ${requestType}</h2>
      <p><strong>Tenant:</strong> ${tenantId || "Unknown"}</p>
      <p><strong>Name:</strong> ${residentName}</p>
      <p><strong>Phone:</strong> ${residentPhone || "N/A"}</p>
      <p><strong>Email:</strong> ${residentEmail || "N/A"}</p>
      <p><strong>Address:</strong> ${address || "N/A"}</p>
      <p><strong>Preferred contact:</strong> ${preferredContactMethod || "N/A"}</p>
      <p><strong>Urgency:</strong> ${urgency || "Normal"}</p>
      <p><strong>Details:</strong><br>${details || "No details provided"}</p>
      ${extraMetadata ? `<h3>Extra Metadata</h3><pre>${JSON.stringify(extraMetadata, null, 2)}</pre>` : ""}
      <hr>
      <p style="font-size:12px;color:#666;">
        Sent via Aspire AI Services – Pilot Environment<br>
        All emails during pilot are routed to: ${RECIPIENT_EMAIL}
      </p>
    `;

    // Send email via Brevo
    const result = await sendBrevoEmail({
      apiKey: BREVO_API_KEY,
      senderEmail: SENDER_EMAIL,
      recipientEmail: RECIPIENT_EMAIL,  // FORCED - always goes to pilot email
      subject,
      htmlContent,
      senderName: "Aspire AI Services",
    });

    return json(200, {
      success: true,
      messageId: result.messageId,
      recipientEmail: RECIPIENT_EMAIL,  // Show where it went
      message: "Email sent successfully (pilot mode - sent to configured recipient)",
    }, corsHeaders());

  } catch (err) {
    console.error("[send-council-email] error:", err);
    return json(500, {
      error: err?.message || "Failed to send email",
      success: false,
    }, corsHeaders());
  }
};
