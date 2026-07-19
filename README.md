# Monnify Studio

**An AI-native development environment for building _reliable_ payment integrations.**

> An endpoint returning `200` does not mean the integration is correct.
> Monnify Studio helps you prove the **system around the endpoint**.

Describe a payment product in plain language -> Studio composes it into a visual,
typed workflow -> flags unsafe architecture -> runs it against the Monnify sandbox
-> simulates production failures -> and generates implementation code and tests.

Built for the **API Conference Lagos 2026 - Build With Monnify Developer Challenge**.

---

## Why

Making an HTTP request to a payment API is easy. Building a _correct_ system
around it is hard: verification, idempotency, reconciliation, and failure
recovery live in architecture, not in any single endpoint. Studio makes that
correctness **visible and checkable** before it ever touches real money.

## What works today (Epic 1 backbone)

- **Typed, event-driven IR** - a provider-agnostic node graph where webhook/wait
  nodes are async suspension points.
- **Provider packs** - Monnify's endpoints are a swappable catalog; the engine
  is provider-neutral, so other gateways are a new pack, not a rewrite.
- **Static architecture analyzer** - deterministic tag-reachability rules
  (no LLM in the correctness path) that catch real payment bugs:
  | Rule | Catches |
  |------|---------|
  | MON001 | Client callback trusted as financial truth |
  | MON002 | Webhook processed without signature verification |
  | MON003 | Missing idempotency boundary before a financial effect |
  | MON004 | Amount paid never validated against expected |
  | MON009 | Immediate split used where payout must wait for fulfilment |
  | MON011 | Beneficiary account not validated before a transfer |
- **The marketplace hero** in unsafe and safe forms, with the analyzer proving
  the difference.
- **Apply-Fix remediation** - each finding is an IR rewrite that removes it;
  `remediate_all` runs detect -> fix -> re-analyze until the graph is clean,
  inserting the safety nodes as visible boxes.
- **Studio canvas (web)** - Next.js + React Flow UI to load the hero, edit the
  graph with typed connections, read Architecture Review findings, highlight
  unsafe paths, and Apply Fix (#4, #27).
- **Live Monnify sandbox call** - authenticate and initialize a transaction,
  returning a real checkout URL, fully traced with secrets redacted.
- **Observability** - structured JSON logs plus OpenTelemetry tracing with
  context propagation and secret redaction, used by everything above.

See [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md) for the full epic -> phase -> issue
plan and the locked architecture decisions, and
[`docs/ENGINEERING_STANDARDS.md`](docs/ENGINEERING_STANDARDS.md) for how we build
(APOSD design philosophy, repo layout, git workflow, frontend §6, testing).

## Quickstart

### Backend (analyzer + remediation API)

Needs Python 3.11+ (3.12 recommended). Package lives under `apps/api`.

```bash
cd apps/api
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"   # or: uv sync if using the lockfile

# Prove the thesis - analyze the unsafe hero, then the safe one:
uv run python scripts/demo_analyze.py

# Watch Apply-Fix drive the unsafe hero to zero findings:
uv run python scripts/demo_remediate.py

# See structured, traced, redacted logs around an analysis run:
uv run python scripts/demo_observability.py

# Make one real Monnify sandbox call (needs MONNIFY_* keys in .env):
uv run python scripts/demo_sandbox.py

# Run the tests:
uv run pytest -q

# Serve the Studio API (port 8010 avoids common local clashes on 8000):
uvicorn monnify_studio.api.main:app --reload --host 127.0.0.1 --port 8010
```

Expected from the demos: the unsafe marketplace reports 3 critical + 1 high
finding; the safe marketplace reports none.

### Frontend (canvas + Architecture Review)

Needs Node 20+. Full detail lives in [`apps/web/README.md`](apps/web/README.md).

```bash
# With the API already on :8010
cd apps/web
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://127.0.0.1:8010
npm install
npm run dev                  # http://localhost:3000
npm run typecheck            # tsc --noEmit
```

If the API is down, the UI still opens using offline fixtures under
`apps/web/src/data/` and shows "Local fixtures" in the header.

## Layout

```
monnify-studio/
├── apps/
│   ├── api/                 # FastAPI + IR / providers / analysis / remediation
│   │   └── monnify_studio/
│   │       ├── ir/          # provider-agnostic Intermediate Representation
│   │       ├── providers/   # catalog: core node types + Monnify pack (D13)
│   │       ├── analysis/    # tag-reachability engine + MON rules (D3)
│   │       ├── remediation/ # Apply-Fix rewrites (#6)
│   │       ├── api/         # HTTP surface for the web app
│   │       └── fixtures/    # marketplace hero - unsafe and safe
│   └── web/                 # Next.js + React Flow Studio shell (#4, #27)
│       └── src/
│           ├── components/  # canvas, review, config, chrome
│           ├── hooks/       # session + graph behaviour
│           ├── lib/         # API client, IR <-> flow adapters
│           └── types/       # interim IR hand ports until D6 codegen
├── docs/
│   ├── BUILD_PLAN.md
│   └── ENGINEERING_STANDARDS.md
└── .env.example
```

## Security

Sandbox only: production execution is refused by default. Secrets live in
`.env` (never committed; see `.env.example`), never in workflows, logs, shared
links, or AI context.
