"""Runtime configuration and the sandbox-only guard (#7).

Secrets come from the environment (or a `.env` file), never from code. Production
execution is refused unless explicitly enabled, which we never do in the
challenge build (security standard).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Search the current dir and up to two parents so it works whether run from
    # the repo root or from apps/api.
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    monnify_api_key: str = ""
    monnify_secret_key: str = ""
    monnify_contract_code: str = ""
    monnify_base_url: str = "https://sandbox.monnify.com"
    # Disbursement source wallet account number (#9). Monnify won't let us list
    # wallets on this sandbox, so the source account is supplied out of band.
    monnify_wallet_account: str = ""

    allow_production_execution: bool = False
    studio_env: str = "development"

    @property
    def is_sandbox(self) -> bool:
        return "sandbox" in self.monnify_base_url

    def assert_sandbox(self) -> None:
        if not self.is_sandbox and not self.allow_production_execution:
            raise RuntimeError(
                "Refusing a non-sandbox Monnify base URL. Set ALLOW_PRODUCTION_EXECUTION=true "
                "only if you truly intend to hit production (never in the challenge build)."
            )

    def assert_monnify_credentials(self) -> None:
        missing = [
            name
            for name, value in {
                "MONNIFY_API_KEY": self.monnify_api_key,
                "MONNIFY_SECRET_KEY": self.monnify_secret_key,
                "MONNIFY_CONTRACT_CODE": self.monnify_contract_code,
            }.items()
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing Monnify sandbox credentials: {', '.join(missing)}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
