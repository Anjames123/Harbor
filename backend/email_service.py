import logging
import smtplib
from email.message import EmailMessage

from backend.config import get_settings

logger = logging.getLogger("secure-auth.email")


def send_action_email(
    *,
    recipient: str,
    subject: str,
    action_path: str,
    token: str,
) -> None:
    settings = get_settings()
    link = f"{settings.frontend_url.rstrip('/')}{action_path}?token={token}"

    if not settings.smtp_host:
        logger.info(
            "Email delivery is not configured; action link generated for %s at %s",
            recipient,
            link,
        )
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(
        f"Use this secure link to continue: {link}\n\n"
        "This link expires automatically and can only be used once."
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_username and settings.smtp_password:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)