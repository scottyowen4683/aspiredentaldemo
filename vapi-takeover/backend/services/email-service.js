// services/email-service.js - Email notification service using Brevo (Sendinblue)
// Sends email notifications for contact requests captured via chat/voice
import logger from './logger.js';

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || process.env.RECIPIENT_EMAIL;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'notifications@aspireexecutive.ai';
const SENDER_NAME = process.env.SENDER_NAME || 'Aspire AI';

/**
 * Send an email via Brevo (Sendinblue) API
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @returns {Promise<Object>}
 */
async function sendEmail({ to, subject, html }) {
  if (!BREVO_API_KEY) {
    logger.warn('BREVO_API_KEY not configured, skipping email');
    return { skipped: true, reason: 'no_api_key' };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          email: SENDER_EMAIL,
          name: SENDER_NAME
        },
        to: [{ email: to }],
        subject,
        htmlContent: html
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Brevo API error: ${response.status}`);
    }

    logger.info('Email sent successfully via Brevo', { to, subject, messageId: data.messageId });
    return { success: true, messageId: data.messageId };

  } catch (error) {
    logger.error('Failed to send email:', error);
    throw error;
  }
}

/**
 * Send notification email for a captured contact request
 * @param {Object} request - The contact request data
 * @param {string} request.name - Contact name
 * @param {string} request.email - Contact email
 * @param {string} request.phone - Contact phone
 * @param {string} request.address - Related address
 * @param {string} request.request_type - Type of request
 * @param {string} request.request_details - Full details
 * @param {string} request.urgency - Urgency level
 * @param {Object} metadata - Additional info
 * @param {string} metadata.assistantName - Name of the assistant
 * @param {string} metadata.conversationId - Conversation ID
 * @param {string} metadata.channel - chat or voice
 */
export async function sendContactRequestNotification(request, metadata = {}) {
  const recipientEmail = NOTIFICATION_EMAIL;

  if (!recipientEmail) {
    logger.warn('NOTIFICATION_EMAIL not configured, skipping notification');
    return { skipped: true, reason: 'no_notification_email' };
  }

  const urgencyColors = {
    high: '#dc2626',
    medium: '#f59e0b',
    low: '#22c55e'
  };

  const requestTypeLabels = {
    complaint: 'Complaint',
    enquiry: 'Enquiry',
    feedback: 'Feedback',
    service_request: 'Service Request',
    contact_request: 'Contact Request',
    other: 'Other'
  };

  const urgencyColor = urgencyColors[request.urgency] || urgencyColors.medium;
  const requestLabel = requestTypeLabels[request.request_type] || request.request_type;

  // Generate a reference ID (same format as moretonbaypilot)
  const referenceId = `REQ-${Date.now().toString(36).toUpperCase()}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #8B5CF6, #6366F1); padding: 20px; border-radius: 8px 8px 0 0; }
        .header h1 { color: white; margin: 0; font-size: 20px; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
        .field { margin-bottom: 12px; }
        .label { font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; }
        .value { color: #111827; margin-top: 4px; }
        .urgency { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; color: white; }
        .details-box { background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin-top: 16px; }
        .footer { padding: 16px 20px; background: #f3f4f6; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; border-top: none; }
        .reference { font-family: monospace; font-size: 14px; font-weight: 600; color: #8B5CF6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New ${requestLabel} - ${escapeHtml(metadata.assistantName || 'Aspire AI')}</h1>
        </div>
        <div class="content">
          <div class="field">
            <div class="label">Reference</div>
            <div class="value reference">${referenceId}</div>
          </div>

          <div class="field">
            <div class="label">Urgency</div>
            <div class="value">
              <span class="urgency" style="background-color: ${urgencyColor}">
                ${(request.urgency || 'medium').toUpperCase()}
              </span>
            </div>
          </div>

          ${request.name ? `
          <div class="field">
            <div class="label">Name</div>
            <div class="value">${escapeHtml(request.name)}</div>
          </div>
          ` : ''}

          ${request.phone ? `
          <div class="field">
            <div class="label">Phone</div>
            <div class="value"><a href="tel:${request.phone}">${escapeHtml(request.phone)}</a></div>
          </div>
          ` : ''}

          ${request.email ? `
          <div class="field">
            <div class="label">Email</div>
            <div class="value"><a href="mailto:${request.email}">${escapeHtml(request.email)}</a></div>
          </div>
          ` : ''}

          ${request.address ? `
          <div class="field">
            <div class="label">Address</div>
            <div class="value">${escapeHtml(request.address)}</div>
          </div>
          ` : ''}

          <div class="details-box">
            <div class="label">Request Details</div>
            <div class="value" style="white-space: pre-wrap; margin-top: 8px;">${escapeHtml(request.request_details)}</div>
          </div>
        </div>
        <div class="footer">
          <p style="margin: 0;">
            Captured via ${metadata.channel || 'chat'}
            ${metadata.conversationId ? ` | Conversation: ${metadata.conversationId.substring(0, 8)}...` : ''}
          </p>
          <p style="margin: 8px 0 0 0;">
            Powered by <a href="https://aspireexecutive.ai" style="color: #8B5CF6;">Aspire AI</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const result = await sendEmail({
    to: recipientEmail,
    subject: `[${(request.urgency || 'MEDIUM').toUpperCase()}] New ${requestLabel}: ${request.request_details.substring(0, 50)}...`,
    html
  });

  // Return the reference ID so it can be used in the chat response
  return {
    ...result,
    referenceId
  };
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default {
  sendEmail,
  sendContactRequestNotification
};
