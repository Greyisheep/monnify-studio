# Monnify Studio

[![CI](https://github.com/Greyisheep/monnify-studio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Greyisheep/monnify-studio/actions/workflows/ci.yml)

**Describe a payment product in plain language. Get a visual, typed, safety-checked workflow that becomes a real product.**

> An endpoint returning `200` does not mean the integration is correct.
> Monnify Studio proves the **system around the endpoint** before real money moves.

**▶ Try it now, no setup:** **https://monnify-studio-web-cu5qickhka-bq.a.run.app**
It is seeded with a live demo business ("Mama Nkechi Foods"), so it is never empty. Ask the assistant for something impossible (*"build me a rocket to the moon"*) and watch it politely refuse.

Built for the **API Conference Lagos 2026 — Build With Monnify Developer Challenge**.

---

## The one-minute version

A market woman, a freelancer, or a developer describes what they sell. **Moni** (the assistant) composes a complete Monnify payment flow as a graph. A deterministic **analyzer** audits that graph for the bugs that only show up in production — unverified webhooks, missing idempotency, unvalidated payouts, insufficient-balance failures — and Moni is only allowed to hand over a flow that passes. The flow then becomes a real product: a shareable shop link, a proper invoice, and a plain-words dashboard. Nothing is ever marked *paid* until Monnify itself confirms the money.

The thesis, in one line: **AI proposes, the analyzer disposes. Correctness never rests on the model.**

## Choose your path (for the judges)

Each of you can inspect the part you care about in a few minutes.

### 🧑‍💼 Product / business
1. Open the [live app](https://monnify-studio-web-cu5qickhka-bq.a.run.app).
2. Pick a template, or tell Moni your business in plain words: *"I run a thrift group, twelve members save weekly, one gets the pot each month."*
3. Watch a full flow appear, then get a **dashboard** (money in/out, net profit), a **shop link** to share on WhatsApp, and a **branded invoice** a buyer can pay or forward to their accountant.
4. The point: no code, usable by an 8-year-old or an 80-year-old, and no fake-payment-screenshot fraud (paid means Monnify confirmed it).

### 🎨 Designer
- The product speaks in plain words end to end — a run reads *"Waiting: customer pays"*, never `node.suspended (D1)`.
- The generated invoice is a real document (styled to the Dockie/Carlofty references), and the dashboard is the business's "money book": inflow, outflow, net profit.
- Design system + screens: the team's [Figma](https://www.figma.com/design/yuXqT1qhA15L3v1jNdPobC/Monnify-challenge) (user-type onboarding, dashboard, canvas).

### 🧑‍💻 Engineer
- The heart is a typed, event-driven **IR** (a node graph) + a **static analyzer** with deterministic tag-reachability rules — *no LLM in the correctness path* (see the rules table below).
- Moni's compose is a **deterministic generate → verify → refine → refuse loop**: she proposes, our code runs the analyzer and Apply-Fix, and returns only a clean flow or refuses honestly. Correctness stays in code, not the model.
- **170 backend + 14 frontend tests**, gated in CI on every PR — and the suite runs **keyless**, so green also proves the no-API-key fallbacks carry the product.
- Money is exact `Decimal` to the kobo, never `float`. Start reading at [`docs/MONI_ARCHITECTURE.md`](docs/MONI_ARCHITECTURE.md) and [`apps/api/monnify_studio/ai/composer.py`](apps/api/monnify_studio/ai/composer.py).

### 📣 DevRel
- Moni is **grounded in Monnify's own docs** (the cheat sheet + live doc fetches), so she composes from documented features, not model memory — and citations are assembled from the catalog, never invented by the model.
- Ask Moni *"why?"* on any node and get a grounded answer with a real `developers.monnify.com` reference.
- Every catalog node maps to a real Monnify capability (Collections, Reserved Accounts, Disbursements, Verification/KYC, Reconciliation).

## What works today

- **Moni composes any flow** from plain language (not just templates) and refuses non-payment requests honestly. Verified live: ajo, per-tenant rent, rider payroll, savings-wallet-with-fee, ticketing — all compose analyzer-clean.
- **The safety analyzer** (deterministic, no LLM), with Apply-Fix that rewrites a flawed graph to a clean one in front of you:

  | Rule | Catches |
  |------|---------|
  | MON001 | Client callback trusted as financial truth |
  | MON002 | Webhook processed without signature verification |
  | MON003 | Missing idempotency boundary before a financial effect |
  | MON004 | Amount paid never validated against expected |
  | MON009 | Immediate split where payout must wait for fulfilment |
  | MON011 | Beneficiary account not validated before a transfer |
  | MON012 | Balance not checked before a payout (the live "insufficient balance" failure) |

- **Real products from a flow:** a self-serve **shop link** + QR (buyers pick items → an invoice is generated), a **branded invoice** document, and a generic **dashboard** ledger.
- **Verify-driven truth:** orders/invoices are *paid* only after Monnify confirms — defeating fake-alert screenshots.
- **Live Monnify sandbox** calls (auth + initialize transaction → real checkout URL), fully traced with secrets redacted.
- **Notifications** by email (SMTP); WhatsApp wired, on when its keys are set.
- **Deployed on Cloud Run**, auto-deploying from `main`, seeded so it is never empty.

## Run it locally

Needs Python 3.11+ and Node 20+. Two servers.

**It works with zero API keys** — Moni falls back to keyword routing and doc-grounding, orders run against a mock adapter, and the whole test suite passes keyless. Keys only *unlock* live features (real compose, real sandbox calls). See [API keys](#api-keys) below.

```bash
# 1. Backend (analyzer + Moni + product API) — from apps/api
cd apps/api
uv sync --all-extras
uv run pytest -q                                   # 170 tests, no keys needed
uv run uvicorn monnify_studio.api.main:app --port 8010 --host 127.0.0.1

# 2. Frontend canvas — in another terminal, from apps/web
cd apps/web
cp .env.example .env.local                         # NEXT_PUBLIC_API_URL=http://127.0.0.1:8010
npm ci && npm run dev                              # http://localhost:3000
```

Prove the thesis from the command line (no server needed):

```bash
cd apps/api
uv run python scripts/demo_analyze.py     # unsafe hero: 3 critical + 1 high; safe hero: clean
uv run python scripts/demo_remediate.py   # Apply-Fix drives the unsafe hero to zero findings
uv run python scripts/moni_eval.py        # (needs an AI key) compose 9 non-templated ideas, live
```

## API keys

All optional. Nothing is required to run the app or the tests.

| Key | Unlocks | Get it |
|-----|---------|--------|
| `CLAUDE_API_KEY` (or `OPENAI_API_KEY` / `GOOGLE_API_KEY`) | Moni composing new flows from free text (without it she routes by keyword) | [console.anthropic.com](https://console.anthropic.com) · [platform.openai.com](https://platform.openai.com) · [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE` | Real sandbox checkout + verification | [app.monnify.com](https://app.monnify.com) → sandbox → API keys |
| `SMTP_*` | Real email receipts | any SMTP provider |

Copy [`.env.example`](.env.example) to `.env` and fill in only what you want. **Sandbox only** — production execution is refused by default. Secrets never enter logs, workflows, shared links, or AI context.

## Layout

```
monnify-studio/
├── apps/
│   ├── api/   # FastAPI: IR · providers (Monnify pack) · analysis · remediation · ai (Moni) · artifacts
│   └── web/   # Next.js + React Flow canvas, Architecture Review, Moni chat, trace
├── docs/      # BUILD_PLAN · ENGINEERING_STANDARDS · MONI_ARCHITECTURE
└── scripts/   # deploy-cloud-run.sh + apps/api/scripts demos
```

The product model in plain words lives in [issue #105](https://github.com/Greyisheep/monnify-studio/issues/105). Build plan and locked decisions: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

## License

[MIT](LICENSE) — you own your code and idea.
