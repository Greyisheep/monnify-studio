# Monnify Studio

**An AI-native development environment for building _reliable_ payment integrations.**

> An endpoint returning `200` does not mean the integration is correct.
> Monnify Studio helps you prove the **system around the endpoint**.

Describe a payment product in plain language → Studio composes it into a visual,
typed workflow → flags unsafe architecture → runs it against the Monnify sandbox
→ simulates production failures → and generates implementation code and tests.

Built for the **API Conference Lagos 2026 — Build With Monnify Developer Challenge**.

---

## Why

Making an HTTP request to a payment API is easy. Building a _correct_ system
around it is hard — verification, idempotency, reconciliation, and failure
recovery live in architecture, not in any single endpoint. Studio makes that
correctness **visible and checkable** before it ever touches real money.

## What works today (Epic 1 backbone)

- **Typed, event-driven IR** — a provider-agnostic node graph where webhook/wait
  nodes are async suspension points.
- **Provider packs** — Monnify's endpoints are a swappable catalog; the engine
  is provider-neutral, so other gateways are a new pack, not a rewrite.
- **Static architecture analyzer** — deterministic tag-reachability rules
  (no LLM in the correctness path) that catch real payment bugs:
  | Rule | Catches |
  |------|---------|
  | MON001 | Client callback trusted as financial truth |
  | MON002 | Webhook processed without signature verification |
  | MON003 | Missing idempotency boundary before a financial effect |
  | MON004 | Amount paid never validated against expected |
  | MON009 | Immediate split used where payout must wait for fulfilment |
- **The marketplace hero** in unsafe and safe forms, with the analyzer proving
  the difference.

See [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) for the full epic → phase → issue
plan and the locked architecture decisions.

## Quickstart

```bash
cd apps/api
uv venv && uv pip install pydantic pytest

# Prove the thesis — analyze the unsafe hero, then the safe one:
uv run python scripts/demo_analyze.py

# Run the tests:
uv run pytest -q
```

Expected: the unsafe marketplace reports 3 critical + 1 high finding; the safe
marketplace reports none.

## Layout

```
apps/api/monnify_studio/
├── ir/          # provider-agnostic Intermediate Representation (the backbone)
├── providers/   # catalog: core node types + the Monnify pack (D13)
├── analysis/    # tag-reachability engine + MON rules (D3)
└── fixtures/    # the marketplace hero — unsafe & safe
docs/BUILD_PLAN.md
```

## Security

Sandbox only — production execution is refused by default. Secrets live in
`.env` (never committed; see `.env.example`), never in workflows, logs, shared
links, or AI context.
