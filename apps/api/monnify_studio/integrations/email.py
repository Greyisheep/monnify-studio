"""ZeptoMail HTTP API client for notification sends (#99, #135 follow-up).

Same transactional email provider as the Carlofty project, same account (a
verified sender there is reused with a Monnify Studio display name). This is
ZeptoMail's HTTP API (api.zeptomail.com), not SMTP - a single bearer-style
Authorization header, no smtplib. Config comes from the environment:
ZEPTOMAIL_API_KEY, ZEPTOMAIL_SENDER, ZEPTOMAIL_REPLY_TO. If the key or sender
is unset, `configured` is False and callers no-op, so dev and tests run
without a live key.
"""

from __future__ import annotations

import httpx
from pydantic_settings import BaseSettings, SettingsConfigDict

from ..observability import get_logger, register_secret

log = get_logger("email")

ZEPTOMAIL_URL = "https://api.zeptomail.com/v1.1/email"
SENDER_DISPLAY_NAME = "Monnify Studio"


class EmailSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env", "../../.env"), extra="ignore")

    zeptomail_api_key: str = ""
    zeptomail_sender: str = ""
    zeptomail_reply_to: str = ""

    @property
    def configured(self) -> bool:
        return bool(self.zeptomail_api_key and self.zeptomail_sender)


class EmailNotConfigured(RuntimeError):
    """Raised when a send is attempted with no ZeptoMail configuration."""


class ZeptoMailClient:
    def __init__(self, settings: EmailSettings | None = None) -> None:
        self._s = settings or EmailSettings()
        if self._s.zeptomail_api_key:
            register_secret(self._s.zeptomail_api_key)  # never surfaces in a log

    @property
    def configured(self) -> bool:
        return self._s.configured

    def send(self, to: str, subject: str, html_body: str) -> None:
        if not self._s.configured:
            raise EmailNotConfigured("ZeptoMail is not configured")
        payload = {
            "from": {"address": self._s.zeptomail_sender, "name": SENDER_DISPLAY_NAME},
            "to": [{"email_address": {"address": to}}],
            "subject": subject,
            "htmlbody": html_body,
        }
        if self._s.zeptomail_reply_to:
            payload["reply_to"] = {"address": self._s.zeptomail_reply_to}

        with httpx.Client(timeout=15.0) as http:
            resp = http.post(
                ZEPTOMAIL_URL,
                headers={
                    "Authorization": self._s.zeptomail_api_key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
        log.info("email.sent", to=to.split("@")[0] + "@***")
