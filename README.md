# Monnify Studio

[![CI](https://github.com/Greyisheep/monnify-studio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Greyisheep/monnify-studio/actions/workflows/ci.yml)

**Describe a payment product in plain language. Get a visual, typed, safety-checked workflow that becomes a real Monnify product.**

> An endpoint returning `200` does not mean the integration is correct.
> Monnify Studio proves the **system around the endpoint** before real money moves.

Built for the **API Conference Lagos 2026 - Build With Monnify Developer Challenge**.

---

## Two ways to run it

**1. Try the live app - nothing to install:**

### ▶ https://monnify-studio-web-cu5qickhka-bq.a.run.app

It is seeded with a live demo business ("Mama Nkechi Foods"), so it is never empty. Ask the assistant for something impossible (*"build me a rocket to the moon"*) and watch it politely refuse.

**2. Run the whole thing yourself - one command:**

```bash
docker compose up
```

That builds and starts both services and opens the studio at **http://localhost:3000**. No database, no other setup - everything runs in memory. It works with **zero API keys** (the assistant routes by keyword, orders run on a mock adapter). To unlock the live features, drop keys into a `.env` file first:

```bash
cp .env.example .env      # fill in only what you want, then:
docker compose up
```

<details>
<summary>Prefer no Docker? Run the two servers directly.</summary>

Needs Python 3.11+ and Node 20+.

```bash
# Terminal 1 - backend (analyzer + Moni + product API)
cd apps/api
uv sync --all-extras
uv run pytest -q                                   # 240+ tests, no keys needed
uv run uvicorn monnify_studio.api.main:app --port 8010 --host 127.0.0.1

# Terminal 2 - frontend canvas
cd apps/web
cp .env.example .env.local                         # NEXT_PUBLIC_API_URL=http://127.0.0.1:8010
npm ci && npm run dev                              # http://localhost:3000
```
</details>

---

## What it is, in one minute

A market woman, a freelancer, or a developer describes what they sell. **Moni** (the assistant) composes a complete Monnify payment flow as a graph. A deterministic **analyzer** audits that graph for the bugs that only show up in production - unverified webhooks, missing idempotency, unvalidated payouts, insufficient-balance failures - and Moni is only allowed to hand over a flow that passes. The flow then becomes a real product: a shareable shop link, a proper invoice, and a plain-words dashboard. Nothing is ever marked *paid* until Monnify itself confirms the money.

The thesis, in one line: **AI proposes, the analyzer disposes. Correctness never rests on the model.**

## The two demos

**Developer:** open the app → *"I'm a developer"* → in Chat, type *"Take a card payment, and when the payment webhook arrives, verify the transaction with Monnify and then send the customer a WhatsApp confirmation."* → **Run**. It hits the **real** Monnify sandbox, shows the honest `PENDING` status (not a fake success), completes the flow, and fires a **real WhatsApp + email** confirmation.

**Business owner:** open the app → *"I'm a business owner"* → pick a template (Ajo, or Sell online) → get a **dashboard** (money in/out), a **shop link** + QR to share on WhatsApp, and a **branded invoice**. A buyer opens the link, picks items, and pays - and it is only marked *paid* once Monnify confirms it, which defeats fake-transfer-screenshot fraud.

## Look closer (pick your lane)

### 🧑‍💻 Engineer
- The heart is a typed, event-driven **IR** (a node graph) + a **static analyzer** with deterministic tag-reachability rules - *no LLM in the correctness path* (see the rules table below).
- Moni's compose is a **deterministic generate → verify → refine → refuse loop**: she proposes, our code runs the analyzer and Apply-Fix, and returns only a clean flow or refuses honestly.
- **240 backend + 56 frontend tests**, gated in CI on every PR - and the suite runs **keyless**, so green also proves the no-API-key fallbacks carry the product.
- Money is exact `Decimal` to the kobo, never `float`. Start at [`docs/MONI_ARCHITECTURE.md`](docs/MONI_ARCHITECTURE.md) and [`apps/api/monnify_studio/ai/composer.py`](apps/api/monnify_studio/ai/composer.py).

### 🧑‍💼 Product / business
- No code. Usable by an 8-year-old or an 80-year-old: a run reads *"Waiting: customer pays"*, never `node.suspended`.
- Real outputs from a flow: a **dashboard** (inflow, outflow, net profit), a **shop link** to share, and a **branded invoice** a buyer can pay or forward.
- No fake-payment-screenshot fraud - *paid* means Monnify confirmed it.

### 🎨 Designer
- The generated invoice is a real document; the dashboard is the business's "money book".
- Design system + screens: the team's [Figma](https://www.figma.com/design/yuXqT1qhA15L3v1jNdPobC/Monnify-challenge) (onboarding, dashboard, canvas).

### 📣 DevRel
- Moni is **grounded in Monnify's own docs**, so she composes from documented features, not model memory - citations come from the catalog, never invented.
- Ask Moni *"why?"* on any node and get a grounded answer with a real `developers.monnify.com` reference.
- Every catalog node maps to a real Monnify capability (Collections, Reserved Accounts, Disbursements, Verification/KYC, Reconciliation).

## The safety analyzer

Deterministic, no LLM. Apply-Fix rewrites a flawed graph to a clean one in front of you:

| Rule | Catches |
|------|---------|
| MON001 | Client callback trusted as financial truth |
| MON002 | Webhook processed without signature verification |
| MON003 | Missing idempotency boundary before a financial effect |
| MON004 | Amount paid never validated against expected |
| MON009 | Immediate split where payout must wait for fulfilment |
| MON011 | Beneficiary account not validated before a transfer |
| MON012 | Balance not checked before a payout (the live "insufficient balance" failure) |

## Configuration (all optional)

Nothing is required to run the app or the tests. Copy [`.env.example`](.env.example) to `.env` and fill in only what you want; `docker compose up` picks it up automatically.

| Key | Unlocks | Get it |
|-----|---------|--------|
| `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` / `GOOGLE_API_KEY`) | Moni composing new flows from free text | [console.anthropic.com](https://console.anthropic.com) · [platform.openai.com](https://platform.openai.com) · [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE` | Real sandbox checkout, verification, disbursement | [app.monnify.com](https://app.monnify.com) → sandbox → API keys |
| `ZEPTOMAIL_*` | Real email receipts | [zeptomail.zoho.com](https://zeptomail.zoho.com) |
| `EVOLUTION_*` + `STUDIO_NOTIFY_NUMBER` | Real WhatsApp nudges | a self-hosted [Evolution API](https://github.com/EvolutionAPI/evolution-api) instance |

**Sandbox only** - production execution is refused by default. Secrets never enter logs, workflows, shared links, or AI context.

## Prove the thesis from the command line

No server needed:

```bash
cd apps/api
uv run python scripts/demo_analyze.py     # unsafe hero: 3 critical + 1 high; safe hero: clean
uv run python scripts/demo_remediate.py   # Apply-Fix drives the unsafe hero to zero findings
uv run python scripts/moni_eval.py        # (needs an AI key) compose 9 non-templated ideas, live
```

## Layout

```
monnify-studio/
├── docker-compose.yml   # the one command: `docker compose up`
├── apps/
│   ├── api/   # FastAPI: IR · providers (Monnify pack) · analysis · remediation · ai (Moni) · artifacts
│   └── web/   # Next.js + React Flow canvas, Architecture Review, Moni chat, trace
├── docs/      # BUILD_PLAN · ENGINEERING_STANDARDS · MONI_ARCHITECTURE
└── scripts/   # deploy-cloud-run.sh + apps/api/scripts demos
```

The product model in plain words lives in [issue #105](https://github.com/Greyisheep/monnify-studio/issues/105). Build plan and locked decisions: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md).

## License

[MIT](LICENSE) - you own your code and idea.
