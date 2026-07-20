"""Evolution API client for WhatsApp sends (#99).

Same self-hosted WhatsApp gateway as the Carlofty project. Config comes from
the environment (never the repo): EVOLUTION_API_URL, EVOLUTION_API_KEY,
EVOLUTION_INSTANCE. If those are unset the client reports `configured = False`
and callers no-op, so dev and tests run without a live gateway.
"""

from __future__ import annotations

import httpx
from pydantic_settings import BaseSettings, SettingsConfigDict

from ..observability import get_logger, register_secret

log = get_logger("whatsapp")


class WhatsAppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    evolution_api_url: str = ""
    evolution_api_key: str = ""
    evolution_instance: str = ""

    @property
    def configured(self) -> bool:
        return bool(self.evolution_api_url and self.evolution_api_key and self.evolution_instance)


def normalize_ng(number: str) -> str:
    """Best-effort Nigerian MSISDN for WhatsApp: 234XXXXXXXXXX, no + or spaces."""
    digits = "".join(ch for ch in number if ch.isdigit())
    if digits.startswith("234"):
        return digits
    if digits.startswith("0"):
        return "234" + digits[1:]
    if len(digits) == 10:  # 8012345678 without the leading 0
        return "234" + digits
    return digits


class WhatsAppNotConfigured(RuntimeError):
    """Raised when a send is attempted with no Evolution API configuration."""


class EvolutionClient:
    def __init__(self, settings: WhatsAppSettings | None = None) -> None:
        self._s = settings or WhatsAppSettings()
        if self._s.evolution_api_key:
            register_secret(self._s.evolution_api_key)  # never surfaces in a log

    @property
    def configured(self) -> bool:
        return self._s.configured

    def send_text(self, number: str, text: str) -> dict:
        """Send a plain WhatsApp message via Evolution API v2 (sendText)."""
        if not self._s.configured:
            raise WhatsAppNotConfigured("Evolution API is not configured")
        to = normalize_ng(number)
        url = f"{self._s.evolution_api_url.rstrip('/')}/message/sendText/{self._s.evolution_instance}"
        with httpx.Client(timeout=15.0) as http:
            resp = http.post(
                url,
                headers={"apikey": self._s.evolution_api_key, "Content-Type": "application/json"},
                json={"number": to, "text": text},
            )
            resp.raise_for_status()
            log.info("whatsapp.sent", to=to[:6] + "***")
            return resp.json() if resp.content else {}
