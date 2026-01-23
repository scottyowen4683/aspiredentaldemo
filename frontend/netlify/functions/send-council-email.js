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
   REFERENCE NUMBER GENERATOR
========================= */

function generateReferenceNumber(tenantId) {
  // Generate format: TENANT-YYYYMMDD-XXXX
  // Example: MOR-20260123-A4F2

  const tenantPrefix = (tenantId || "UNK").substring(0, 3).toUpperCase();
  const date = new Date();
  const dateStr = date.getFullYear().toString() +
                  (date.getMonth() + 1).toString().padStart(2, '0') +
                  date.getDate().toString().padStart(2, '0');

  // Random 4-character alphanumeric
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars
  let randomPart = '';
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${tenantPrefix}-${dateStr}-${randomPart}`;
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

    // Generate unique reference number
    const referenceNumber = generateReferenceNumber(tenantId);

    // Build email HTML
    const subject = `[${referenceNumber}] New Council Request – ${requestType}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #2563eb;">
          <h2 style="margin: 0; color: #1e40af;">New Council Request – ${requestType}</h2>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">
            Reference: <strong style="color: #2563eb; font-size: 16px;">${referenceNumber}</strong>
          </p>
        </div>

        <div style="padding: 20px; background: white;">
          <h3 style="margin-top: 0; color: #333;">Request Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; font-weight: bold; width: 150px;">Reference Number:</td>
              <td style="padding: 8px; color: #2563eb; font-weight: bold;">${referenceNumber}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; font-weight: bold;">Tenant:</td>
              <td style="padding: 8px;">${tenantId || "Unknown"}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; font-weight: bold;">Name:</td>
              <td style="padding: 8px;">${residentName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; font-weight: bold;">Phone:</td>
              <td style="padding: 8px;">${residentPhone || "N/A"}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; font-weight: bold;">Email:</td>
              <td style="padding: 8px;">${residentEmail || "N/A"}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; font-weight: bold;">Address:</td>
              <td style="padding: 8px;">${address || "N/A"}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; font-weight: bold;">Preferred Contact:</td>
              <td style="padding: 8px;">${preferredContactMethod || "N/A"}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; font-weight: bold;">Urgency:</td>
              <td style="padding: 8px;">${urgency || "Normal"}</td>
            </tr>
          </table>

          <h3 style="margin-top: 20px; color: #333;">Issue Description</h3>
          <div style="background: #f9f9f9; padding: 15px; border-radius: 5px;">
            ${details || "No details provided"}
          </div>

          ${extraMetadata ? `<h3 style="margin-top: 20px;">Extra Metadata</h3><pre style="background: #f9f9f9; padding: 15px; border-radius: 5px; overflow-x: auto;">${JSON.stringify(extraMetadata, null, 2)}</pre>` : ""}
        </div>

        <div style="background: #f5f5f5; padding: 15px; font-size: 12px; color: #666; border-top: 1px solid #ddd;">
          <p style="margin: 0;">
            <strong>Sent via Aspire AI Services – Pilot Environment</strong><br>
            All emails during pilot are routed to: ${RECIPIENT_EMAIL}<br>
            Generated: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}
          </p>
        </div>
      </div>
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
      referenceNumber,  // Include reference for AI to tell user
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
