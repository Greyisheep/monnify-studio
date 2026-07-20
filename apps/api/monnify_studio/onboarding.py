"""Studio onboarding profile: who you are + what you sell (#103, #105).

Backend is the source of truth. The browser holds only an HttpOnly session
cookie so we know which profile to load; path and products live here.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from .money import money
from .observability import get_logger, new_id

log = get_logger("onboarding")

StudioPath = Literal["business", "developer"]
OnboardingStep = Literal["user_type", "products", "dashboard", "template", "done"]


class ShopProduct(BaseModel):
    id: str = Field(default_factory=lambda: new_id("item"))
    name: str = ""
    # Exact money (D21) — never a float in the model; wire may send int/str/float.
    price_ngn: Decimal | None = Field(default=None, ge=0)
    image_url: str | None = None

    @field_validator("price_ngn", mode="before")
    @classmethod
    def _exact_price(cls, value: object) -> Decimal | None:
        if value is None or value == "":
            return None
        return money(value)


class StudioProfile(BaseModel):
    session_id: str
    path: Optional[StudioPath] = None
    step: OnboardingStep = "user_type"
    products: list[ShopProduct] = Field(default_factory=list)


class StudioProfileUpdate(BaseModel):
    path: Optional[StudioPath] = None
    step: Optional[OnboardingStep] = None
    products: list[ShopProduct] | None = None


class ProfileStore:
    """In-memory profiles keyed by session cookie. Swap for Postgres with D5."""

    def __init__(self) -> None:
        self._by_session: dict[str, StudioProfile] = {}

    def get_or_create(self, session_id: str) -> StudioProfile:
        existing = self._by_session.get(session_id)
        if existing is not None:
            return existing.model_copy(deep=True)
        profile = StudioProfile(session_id=session_id)
        self._by_session[session_id] = profile
        log.info("onboarding.profile.created", session=session_id)
        return profile.model_copy(deep=True)

    def update(self, session_id: str, patch: StudioProfileUpdate) -> StudioProfile:
        current = self.get_or_create(session_id)
        data = current.model_dump()
        # exclude_unset so path: null from the client can clear the door choice
        dumped = patch.model_dump(exclude_unset=True)
        if "path" in dumped:
            data["path"] = dumped["path"]
        if "step" in dumped:
            data["step"] = dumped["step"]
        if "products" in dumped and dumped["products"] is not None:
            data["products"] = dumped["products"]
        updated = StudioProfile.model_validate(data)
        self._by_session[session_id] = updated
        log.info(
            "onboarding.profile.updated",
            session=session_id,
            path=updated.path,
            step=updated.step,
            products=len(updated.products),
        )
        return updated.model_copy(deep=True)

    def clear(self) -> None:
        self._by_session.clear()


profile_store = ProfileStore()
SESSION_COOKIE = "monnify_studio_session"
