import os
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException

class EmailDeliveryError(Exception):
    pass

def send_contact_notification(name, email, phone, message):
    configuration = sib_api_v3_sdk.Configuration()
    configuration.api_key['api-key'] = os.environ.get("BREVO_API_KEY")

    api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
        sib_api_v3_sdk.ApiClient(configuration)
    )

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
        api_instance.send_transac_email(email_obj)
    except ApiException as e:
        raise EmailDeliveryError(f"Brevo API error: {e}")
