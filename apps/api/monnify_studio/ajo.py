"""Ajo rotating-pool cycle: members, rounds, nudges, payout (#173, #138).

The offline ritual, encoded: the owner registers the members and the turn
order; every member pays the fixed amount each round (VERIFIED money only,
never a claim, #53); when the pot is complete, ONE member takes the whole
pot and the turn rotates.

Payouts are recorded as clearly-labeled sandbox ledger entries: live
sandbox transfers are gated behind Monnify enabling disbursement/OTP-off
(cheat-sheet Pro-Tip 3), and money_out must be honest ledger data, not a
fabricated number (see OrdersService.totals_for). The flow graph already
carries monnify.initiate_transfer, so the real call slots in when enabled.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from typing import Literal

from pydantic import BaseModel, Field

from .money import money
from .observability import get_logger

log = get_logger("ajo")


class AjoMember(BaseModel):
    name: str
    whatsapp: str = ""  # optional; nudges only go where a number exists
    # Truthful UI state (#234): having a number is not proof that Evolution
    # accepted a message. Reset at the beginning of each round.
    nudge_status: Literal["not_sent", "delivered", "failed"] = "not_sent"


class AjoPayout(BaseModel):
    round: int
    beneficiary: str
    amount: Decimal  # exact to the kobo (D21)
    ts: datetime
    kind: str = "sandbox"  # honest label until Monnify enables live transfers
    # A simulated payout (demo of the mechanic) never touches the money book;
    # only payouts backed by real verified contributions count as money_out.
    simulated: bool = False


class ContributionResult(BaseModel):
    """What one verified contribution did to the cycle (drives nudges)."""

    member: str
    joined: bool = False  # contributor was new and joined the rotation
    paid_count: int
    member_count: int
    unpaid: list[AjoMember] = Field(default_factory=list)
    payout: AjoPayout | None = None
    next_beneficiary: str = ""


class AjoGroup(BaseModel):
    artifact_id: str
    members: list[AjoMember] = Field(default_factory=list)
    round: int = 1
    beneficiary_index: int = 0
    # member name (casefolded) -> exact amount they paid this round
    paid_this_round: dict[str, Decimal] = Field(default_factory=dict)
    payouts: list[AjoPayout] = Field(default_factory=list)

    @property
    def beneficiary(self) -> str:
        if not self.members:
            return ""
        return self.members[self.beneficiary_index % len(self.members)].name

    @property
    def pot(self) -> Decimal:
        return sum(self.paid_this_round.values(), money(0))


def _key(name: str) -> str:
    return name.strip().casefold()


class AjoStore:
    """In-memory cycle state per artifact (same lifetime as orders/artifacts)."""

    def __init__(self) -> None:
        self._groups: dict[str, AjoGroup] = {}

    def group(self, artifact_id: str) -> AjoGroup | None:
        return self._groups.get(artifact_id)

    def ensure(self, artifact_id: str) -> AjoGroup:
        if artifact_id not in self._groups:
            self._groups[artifact_id] = AjoGroup(artifact_id=artifact_id)
        return self._groups[artifact_id]

    def set_members(self, artifact_id: str, members: list[AjoMember]) -> AjoGroup:
        """Replace the roster (owner editing). Cycle state survives: names
        already paid this round stay paid; the beneficiary pointer is kept
        in range."""
        group = self.ensure(artifact_id)
        existing = {_key(m.name): m for m in group.members}
        seen: set[str] = set()
        deduped: list[AjoMember] = []
        for m in members:
            k = _key(m.name)
            if not k or k in seen:
                continue
            seen.add(k)
            previous = existing.get(k)
            # The browser intentionally does not receive phone numbers. When it
            # submits the existing roster while adding someone, blank therefore
            # means "keep the stored number", not "erase it" (#193/#234).
            whatsapp = m.whatsapp.strip() or (previous.whatsapp if previous else "")
            deduped.append(
                AjoMember(
                    name=m.name.strip(),
                    whatsapp=whatsapp,
                    nudge_status=previous.nudge_status if previous else "not_sent",
                )
            )
        group.members = deduped
        group.paid_this_round = {k: v for k, v in group.paid_this_round.items() if k in seen}
        if group.members:
            group.beneficiary_index %= len(group.members)
        log.info("ajo.members.set", artifact=artifact_id, count=len(deduped))
        return group

    def record_nudge(self, artifact_id: str, member_name: str, delivered: bool) -> None:
        """Record Evolution's actual result without exposing the phone number."""
        group = self.group(artifact_id)
        if group is None:
            return
        key = _key(member_name)
        for member in group.members:
            if _key(member.name) == key:
                member.nudge_status = "delivered" if delivered else "failed"
                return

    def record_contribution(
        self,
        artifact_id: str,
        member_name: str,
        amount: object,
        *,
        simulated: bool = False,
    ) -> ContributionResult | None:
        """A VERIFIED contribution lands (#53 already established the truth).

        Unknown contributors join the rotation at the end - that is how ajo
        grows offline. When every member has paid, the beneficiary takes the
        whole pot (recorded as a labeled sandbox payout) and the turn rotates.
        """
        group = self.group(artifact_id)
        if group is None:
            return None
        name = member_name.strip() or "Member"
        k = _key(name)
        joined = False
        if all(_key(m.name) != k for m in group.members):
            group.members.append(AjoMember(name=name))
            joined = True
        group.paid_this_round[k] = group.paid_this_round.get(k, money(0)) + money(amount)

        unpaid = [m for m in group.members if _key(m.name) not in group.paid_this_round]
        payout: AjoPayout | None = None
        if not unpaid and group.members:
            payout = AjoPayout(
                round=group.round,
                beneficiary=group.beneficiary,
                amount=group.pot,
                ts=datetime.now(timezone.utc),
                simulated=simulated,
            )
            group.payouts.append(payout)
            log.info(
                "ajo.payout.recorded",
                artifact=artifact_id,
                round=group.round,
                beneficiary=payout.beneficiary,
                amount=str(payout.amount),
            )
            group.round += 1
            group.beneficiary_index = (group.beneficiary_index + 1) % len(group.members)
            group.paid_this_round = {}
            for member in group.members:
                member.nudge_status = "not_sent"

        result = ContributionResult(
            member=name,
            joined=joined,
            paid_count=len(group.paid_this_round) if payout is None else 0,
            member_count=len(group.members),
            unpaid=unpaid if payout is None else [],
            payout=payout,
            next_beneficiary=group.beneficiary,
        )
        log.info(
            "ajo.contribution.recorded",
            artifact=artifact_id,
            member=name,
            paid=result.paid_count,
            of=result.member_count,
            payout=payout is not None,
        )
        return result

    def money_out_for(self, artifact_id: str) -> Decimal:
        """Exact payout total: the honest money_out source for ledger flows.

        Simulated payouts (the demo of the mechanic) are excluded - the money
        book only ever reflects real money, so it stays 0 until real verified
        contributions fund a real payout."""
        group = self.group(artifact_id)
        if group is None:
            return money(0)
        return sum((p.amount for p in group.payouts if not p.simulated), money(0))


ajo_store = AjoStore()
