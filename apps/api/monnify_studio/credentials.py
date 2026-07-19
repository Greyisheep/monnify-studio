"""Per-workflow Monnify credentials: their secrets, their money (#68, D19).

Without this, every real call uses the platform's own sandbox keys, so a user's
payment link collects into OUR account. Here a workflow carries its own keys, so
her links collect to HER account. If a workflow has none, we fall back to the
platform env keys (so the demo hero still works out of the box).

Security invariants:
  * Secret values are write-only: never returned by any endpoint, only
    `configured: true/false`.
  * Every stored secret is registered with the log redactor (D15).
  * The base URL is NOT user-settable: it stays env-pinned to sandbox, so a
    user can never point Studio at production (the assert_sandbox guard holds).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from .config import Settings, get_settings
from .observability import get_logger, register_secret

log = get_logger("credentials")


class MonnifyCredentials(BaseModel):
    """A workflow's own sandbox keys (write path only)."""

    api_key: str = Field(min_length=1)
    secret_key: str = Field(min_length=1)
    contract_code: str = Field(min_length=1)


class CredentialStatus(BaseModel):
    workflow_id: str
    configured: bool
    source: str  # "workflow" | "platform" | "none"


class CredentialStore:
    """In-memory per-workflow credentials. Swap for Postgres with D5."""

    def __init__(self) -> None:
        self._by_workflow: dict[str, MonnifyCredentials] = {}

    def put(self, workflow_id: str, creds: MonnifyCredentials) -> None:
        register_secret(creds.api_key)
        register_secret(creds.secret_key)
        self._by_workflow[workflow_id] = creds
        log.info("credentials.set", workflow=workflow_id)  # values are redacted

    def has(self, workflow_id: str) -> bool:
        return workflow_id in self._by_workflow

    def delete(self, workflow_id: str) -> bool:
        existed = self._by_workflow.pop(workflow_id, None) is not None
        if existed:
            log.info("credentials.deleted", workflow=workflow_id)
        return existed

    def status(self, workflow_id: str) -> CredentialStatus:
        if self.has(workflow_id):
            return CredentialStatus(workflow_id=workflow_id, configured=True, source="workflow")
        platform = get_settings()
        if platform.monnify_api_key and platform.monnify_secret_key:
            return CredentialStatus(workflow_id=workflow_id, configured=True, source="platform")
        return CredentialStatus(workflow_id=workflow_id, configured=False, source="none")

    def settings_for(self, workflow_id: str | None) -> Settings:
        """Resolve the Settings a real call should use for this workflow.

        Workflow keys win; otherwise the platform env keys. Base URL and the
        sandbox guard always come from the platform, never the user."""
        platform = get_settings()
        creds = self._by_workflow.get(workflow_id) if workflow_id else None
        if creds is None:
            return platform
        return platform.model_copy(
            update={
                "monnify_api_key": creds.api_key,
                "monnify_secret_key": creds.secret_key,
                "monnify_contract_code": creds.contract_code,
            }
        )


credential_store = CredentialStore()
