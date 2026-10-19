from azure.communication.email import EmailClient
import os
from logger import logger,extras

ACS_CONNECTION_STRING = os.getenv("ACS_CONNECTION_STRING")
SENDER_EMAIL = os.getenv("SENDER_EMAIL")   

def send_approval_email(user_email: str):
    """Send an email to notify a user that their access request is approved."""

    client = EmailClient.from_connection_string(ACS_CONNECTION_STRING)
    if not client:
        logger.error(f"[send_approve_mail] Error in ACS_CONNECTION_STRING, for sending automated mail for successful approval ", extra= extras)

    message = {
        "senderAddress": SENDER_EMAIL,
        "recipients": {"to": [{"address": user_email}]},
        "content": {
            "subject": "Your Access Request for KAI Chatbot Has Been Approved",
            "plainText": (
                f"Hello,\n\n"
                f"Your access request for KAI Chatbot has been approved successfully.\n"
                f"You now have access to the assigned LLM models.\n\n"
                f"Best regards,\n"
                f"Kumaran AI Team"
            )
        }
    }

    try:
        client.begin_send(message).result()
        logger.info(f"[send_approve_mail] Approval mail successfully sent to the mail ID", extra= extras)
        return True
    except Exception as e:
        logger.error(f"Failed to send approval email to {user_email}: {e}")
        return False
