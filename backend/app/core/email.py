import logging
import smtplib
from email.message import EmailMessage
from pathlib import Path

from app.core.config import get_settings
from app.core.security import utcnow

log = logging.getLogger("veylotrace.email")

# Used by the "memory" backend (tests).
OUTBOX: list[dict] = []


def send_email(to: str, subject: str, body: str) -> None:
    """Deliver an email. Backends: smtp, file (local dev, writes to OUTBOX_DIR) or memory (tests).

    Bodies contain one-time links, so they are never written to application logs.
    """
    s = get_settings()
    if s.email_backend == "memory":
        OUTBOX.append({"to": to, "subject": subject, "body": body})
        return
    if s.email_backend == "smtp":
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = s.email_from, to, subject
        msg.set_content(body)
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
        return
    out = Path(s.outbox_dir)
    out.mkdir(parents=True, exist_ok=True)
    stamp = utcnow().strftime("%Y%m%dT%H%M%S%f")
    safe = "".join(c if c.isalnum() else "_" for c in to)
    (out / f"{stamp}_{safe}.txt").write_text(f"To: {to}\nSubject: {subject}\n\n{body}\n")
    log.info("Email for %s written to the local outbox (%s).", to, s.outbox_dir)
