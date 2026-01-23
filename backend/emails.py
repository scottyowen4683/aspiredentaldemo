import os
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException


class EmailDeliveryError(Exception):
    pass


def _get_brevo_api_instance():
    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key["api-key"] = os.environ.get("BREVO_API_KEY")
    return sib_api_v3_sdk.TransactionalEmailsApi(
        sib_api_v3_sdk.ApiClient(configuration)
    )


def send_contact_notification(name: str, email: str, phone: str, message: str):
    api_instance = _get_brevo_api_instance()

    sender_email = os.environ.get("SENDER_EMAIL")
    recipient_email = os.environ.get("RECIPIENT_EMAIL")

    email_obj = sib_api_v3_sdk.SendSmtpEmail(
        sender={"email": sender_email, "name": "Aspire Executive Solutions"},
        to=[{"email": recipient_email}],
        subject="New Contact Form Submission",
        html_content=f"""
            <h2>New Contact Form Submission</h2>
            <p><strong>Name:</strong> {name}</p>
            <p><strong>Email:</strong> {email}</p>
            <p><strong>Phone:</strong> {phone}</p>
            <p><strong>Message:</strong> {message}</p>
        """,
    )

    try:
        return api_instance.send_transac_email(email_obj)
    except ApiException as e:
        raise EmailDeliveryError(f"Brevo API error: {e}")


def send_council_request_email(payload: dict):
    """
    Sends a structured council request email via Brevo.

    IMPORTANT SECURITY / RELIABILITY:
    - Do NOT trust the LLM/tool payload to decide the recipient inbox.
    - Recipient is forced server-side using COUNCIL_INBOX_EMAIL (preferred),
      otherwise RECIPIENT_EMAIL.
    """
    api_instance = _get_brevo_api_instance()

    sender_email = os.environ.get("SENDER_EMAIL")

    # FORCE recipient to a known inbox (do not trust payload["to"])
    recipient_email = (
        os.environ.get("COUNCIL_INBOX_EMAIL")
        or os.environ.get("RECIPIENT_EMAIL")
    )

    if not sender_email:
        raise EmailDeliveryError("Missing SENDER_EMAIL environment variable.")
    if not recipient_email:
        raise EmailDeliveryError("Missing COUNCIL_INBOX_EMAIL / RECIPIENT_EMAIL environment variable.")
    if not os.environ.get("BREVO_API_KEY"):
        raise EmailDeliveryError("Missing BREVO_API_KEY environment variable.")

    subject = payload.get("subject") or "New Council Request"

    html_content = f"""
        <h2>New Council Request – {payload.get('request_type', '')}</h2>
        <p><strong>Name:</strong> {payload.get('resident_name', '')}</p>
        <p><strong>Phone:</strong> {payload.get('resident_phone', '')}</p>
        <p><strong>Email:</strong> {payload.get('resident_email', 'N/A')}</p>
        <p><strong>Address:</strong> {payload.get('address', '')}</p>
        <p><strong>Preferred contact:</strong> {payload.get('preferred_contact_method', 'N/A')}</p>
        <p><strong>Urgency:</strong> {payload.get('urgency', 'Normal')}</p>
        <p><strong>Details:</strong><br>{payload.get('details', '')}</p>
        <h3>Extra metadata</h3>
        <pre>{payload.get('extra_metadata') or ''}</pre>
        <hr>
        <p style="font-size:12px;color:#666;">
          Tool payload 'to' (ignored for delivery): {payload.get('to', '')}
        </p>
    """

    email_obj = sib_api_v3_sdk.SendSmtpEmail(
        sender={"email": sender_email, "name": "Aspire AI Services"},
        to=[{"email": recipient_email}],
        subject=subject,
        html_content=html_content,
    )

    try:
        # Returns a CreateSmtpEmail object (messageId, etc.)
        return api_instance.send_transac_email(email_obj)
    except ApiException as e:
        raise EmailDeliveryError(f"Brevo API error: {e}")
