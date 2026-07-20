"""SMTP email client for notification sends (#99 follow-up).

Provider-agnostic on purpose: any SMTP relay works (Gmail with an App Password
is the zero-new-signup path since the account already exists; SendGrid/Mailgun/
etc. work identically). Config comes from the environment: SMTP_HOST, SMTP_PORT,
SMTP_USER, SMTP_PASSWORD, SMTP_FROM. If unset, `configured` is False and callers
no-op, so dev and tests run without a live mail server.
"""

from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from pydantic_settings import BaseSettings, SettingsConfigDict

from ..observability import get_logger, register_secret

log = get_logger("email")


class EmailSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    @property
    def configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)


class EmailNotConfigured(RuntimeError):
    """Raised when a send is attempted with no SMTP configuration."""


class SMTPEmailClient:
    def __init__(self, settings: EmailSettings | None = None) -> None:
        self._s = settings or EmailSettings()
        if self._s.smtp_password:
            register_secret(self._s.smtp_password)  # never surfaces in a log

    @property
    def configured(self) -> bool:
        return self._s.configured

    def send(self, to: str, subject: str, html_body: str) -> None:
        if not self._s.configured:
            raise EmailNotConfigured("SMTP is not configured")
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self._s.smtp_from or self._s.smtp_user
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(self._s.smtp_host, self._s.smtp_port, timeout=15) as server:
            server.starttls()
            server.login(self._s.smtp_user, self._s.smtp_password)
            server.sendmail(msg["From"], [to], msg.as_string())
        log.info("email.sent", to=to.split("@")[0] + "@***")
