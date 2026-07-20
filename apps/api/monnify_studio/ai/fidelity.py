"""Intent fidelity: a safe flow must also be the flow the user asked for (#113).

The analyzer proves safety; this proves coverage. Deterministic on both sides:
conservative keyword detection of what the message clearly requested (per pillar,
#105), against what the composed graph actually does (flow_features, tag-driven).
No model call is involved in the CHECK - the model only acts on its feedback.

Conservative on purpose: a missed gap costs one imperfect flow; a false positive
would burn a compose round on a phantom complaint. Patterns therefore match only
unambiguous phrasings ("pay my staff", not "pay me" - which is the accept side).
"""

from __future__ import annotations

import re

from ..artifacts import flow_features
from ..ir.models import Workflow

# Money going OUT to third parties. "pay me"/"get paid" are deliberately absent:
# those are the accept side.
_PAYOUT = re.compile(
    r"\b(salar(?:y|ies)|payroll|wages|payouts?|disburs\w+|refunds?)\b"
    r"|\bpay\s+(?:my\s+|our\s+|the\s+|each\s+)?"
    r"(staff|team|riders?|drivers?|workers?|employees?|vendors?|suppliers?|"
    r"members?|venue|winners?|beneficiar\w+)\b",
    re.IGNORECASE,
)

# Telling someone something happened.
_NOTIFY = re.compile(
    r"\b(receipts?|notif\w+|whatsapp|sms|alerts?|remind\w*|emails?)\b"
    r"|\btext\s+(?:me|them|buyers?|customers?|him|her)\b"
    r"|\bemail\s+(?:me|them|buyers?|customers?)\b",
    re.IGNORECASE,
)

# Money coming IN.
_ACCEPT = re.compile(
    r"\b(sell\w*|invoices?|collect\w*|contribut\w+|donat\w+|tickets?|"
    r"subscriptions?|rent)\b"
    r"|\bget\s+paid\b|\bpay\s+me\b|\baccept\s+payments?\b|\bcharge\s+(?:my\s+)?customers?\b",
    re.IGNORECASE,
)


def intent_gaps(message: str, workflow: Workflow) -> list[str]:
    """Plain-language gaps between what was asked and what the flow does.

    Empty list = no CLEAR mismatch (which is not a proof of fidelity, just the
    absence of an obvious hole we can state deterministically).
    """
    f = flow_features(workflow)
    gaps: list[str] = []
    if _PAYOUT.search(message) and not f.has_payout:
        gaps.append(
            "the user asked for money to be paid out to people, but the flow has "
            "no transfer/payout step"
        )
    if _NOTIFY.search(message) and not f.has_notify:
        gaps.append(
            "the user asked for a notification or receipt, but the flow has no "
            "notify step"
        )
    if _ACCEPT.search(message) and not (f.collects or f.has_invoices):
        gaps.append(
            "the user asked to collect or accept money, but the flow has no "
            "payment-collection step"
        )
    return gaps
