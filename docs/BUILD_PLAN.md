# Monnify Studio - Build Plan

> AI-native development environment for building **reliable** Monnify payment integrations.
> Thesis: *An endpoint returning 200 does not mean the integration is correct. Studio proves the system around the endpoint.*

Target: **API Conference Lagos 2026 - Build With Monnify Developer Challenge**
Deadline: **12:00 WAT, 21 July 2026** · Team: 3 builders · Hero workflow: **Marketplace with split payments**

---

## 0. Locked decisions (shared agreement - the ADR log)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **IR is an event-driven state machine**, not a DAG | Payments are about *waiting* - webhook arrival, timers, reconciliation, manual approval. Only a state machine models async, event-triggered transitions. Getting this wrong = rebuild everything twice. |
| D2 | **One executor, two adapters** (`MockAdapter`, `MonnifyAdapter`) | A separate simulator and sandbox-runner would drift. One interpreter walks the IR; the adapter is the only thing that changes between "crash-test locally" and "run against real sandbox." Same trace format from both. |
| D3 | **Analyzer = tag-reachability over the graph**, no LLM | Nodes carry capability tags; each MON rule is a graph-reachability query. Deterministic, explainable, and correctness never depends on an LLM (Principle 2). Cheapest high-impact component. |
| D4 | **Webhooks: poll `verify-transaction` for the demo**, real endpoint as stretch | No public URL needed, and polling *is* the server-side-verification pattern we preach. Webhook failure modes are fully covered by the simulator regardless. |
| D5 | **Postgres from day one** (SQLAlchemy + Alembic) | Matches the Section 20 domain model; sharing/versioning in Epic 3 need it - avoid a mid-build rewrite. |
| D6 | **Stack:** FastAPI/Pydantic backend, Next.js + React Flow frontend | Backend language == codegen target. IR is Pydantic; JSON Schema exported → TS types generated for the frontend (single source of truth). |
| D7 | **Hero workflow = marketplace with split payments** | Richest correctness story: pay-once, platform fee, payout-after-fulfilment, refunds, dup-payment protection. Exercises the most Monnify surface. |
| D8 | **Each epic must be independently submittable** | Insurance: a snag in Epic 3 can't sink the entry. Walking skeleton first, then flesh out. |
| D9 | **Fine-grained safety *nodes*** (not edge-guards, not composite blobs); tight hero scope; no nesting in v1 | The product exists to make invisible correctness *visible*. Burying safety in edge metadata rebuilds the exact problem we fight. Visible node insertion on Apply-Fix *is* the thesis on screen. Clarity for the analyzer too (missing node = crisp reachability finding). |
| D10 | **Hero drops transaction-split.** Collection (real) → ledger-hold → payout-after-fulfilment via Transfer. Split becomes its own template. Add **MON009**. | Split settles *immediately*; a payout-after-fulfilment marketplace must not pay before the work is done. Studio flagging this is a headline differentiator, and it steers us off the fragile subaccount/split sandbox surface. |
| D11 | **Simulator carries the demo; real sandbox is best-effort proof-of-life** (Pay-with-Transfer via bank simulator) with a pre-recorded fallback | Sandbox is flaky (live reports: reserved-account `99`s, card-checkout errors, redirect-success/event-log-failed). We never bet a live demo on it. The MockAdapter is now the reliability guarantee, not a shortcut. |
| D12 | **Position Studio one layer above Monnify's MCP server**; codegen can target it | MCP server = correct API *call*. Studio = correct *system* (idempotency, verification, reconciliation, failure recovery) - correctness that lives *between* calls. Building on Monnify's own tooling is a judging plus. |
| D13 | **Provider-agnostic core; Monnify is a rich "provider pack"** | We intend to pitch this to other DevRel teams. IR/executor/analyzer engine stay provider-neutral; Monnify = node catalog + adapter + rule pack. Monnify-deep first, but no core hardcoding - new provider = new pack, not a rewrite. |
| D14 | **Design craft is a feature, not polish** | "Beautiful working tool." Cohesive design system + considered canvas/trace/review UI from commit #1, not a prototype look. |
| D15 | **Observability from day one** (structlog JSON logs + OpenTelemetry tracing, context propagation, secret redaction) | Owner priority, and on-theme: this product makes payment flows legible, so tracing executions is both good engineering and a demo asset. Trace id on every log line; secrets never logged. Tracked in #32. |
| D16 | **AI layer supports the top 3 providers behind one interface** (Anthropic, OpenAI, Google), tester-selectable via `AI_PROVIDER` (default Claude) | Provider-agnostic like D13. Every provider output is schema-validated and re-run through the analyzer, so a weaker model cannot introduce an unsafe design. Tracked in #15. |
| D17 | **The seller is the star.** Studio stays the dev-facing engine; the flagship output is a *generated*, verification-guaranteed payment product for a small Nigerian business (payment page + orders dashboard; paid only after server-side verify). Demo leads with the seller and the fake-credit-alert beat, opens the hood second. | Judge signal favors real-world Nigerian problems; the app lane in this hackathon is crowded while the infrastructure lane is empty; Gloria's design already reserves the needed slots (Run, Deploy, Preview / Code, Chat). Guardrails: artifact = one page + orders list, config-vars editing only; Deploy inert; payroll canvas-only. Issues #51-#56; full text in ADR #1. |

**Eligibility:** ✅ **Team of 3 confirmed by organizer** (Auwal, in-channel: "You can have 3"). Keep a screenshot regardless. In-person attendance requirement still being contested in-channel - watch that thread for any teammate outside Lagos.

## New analyzer rule (from D10)

**MON009 - immediate-split used where payout depends on a downstream event** *(Critical/High)*
Condition: a transaction-split / immediate-settlement node sits on a path whose payout is gated by a later event node (fulfilment confirmation, manual approval). Risk: the provider is paid before the condition is met - money leaves before the work is done.

---

## Cross-cutting (enforced in every epic, not a phase)

- **Security:** secrets encrypted at rest, never in IR / logs / shared links / AI context; sandbox-only; log redaction util from commit #1; `.env.example` + `.gitignore` before any key exists.
- **Repo quality (judged):** architecture docs, ADRs (this file), rule docs, threat model, runnable README.
- **Demo video (2-5 min):** script drafted after Epic 1, recorded after Epic 3. Narrative = **Describe → Design → Run → Break → Repair → Export**.

---

## Workstream lanes (map the 3 builders onto these)

- **Lane A - Core / IR & Analyzer** (backend, "the brain"): IR schema, node catalog, analyzer, remediation, codegen.
- **Lane B - Execution & Integrations** (backend): executor, adapters, Monnify sandbox, simulator, chaos, reconciliation, AI orchestration.
- **Lane C - Frontend & Story** (frontend): canvas, config/review/trace/chaos UI, sharing, README + demo video.

**Critical path:** Phase 1.0 (foundation) → Phase 1.1 (IR). The IR unblocks B and C. Lane A leads it; B and C scaffold in parallel behind it.

---

# EPIC 1 - Design & Prove  *(static correctness)*

**DoD / demo:** Open the app → marketplace hero graph loads in its **unsafe** form → Architecture Review flags 1 Critical + 2 High → click **Apply Fix** → graph rewrites to the safe pattern → and one **real sandbox `initialize-transaction`** returns a live checkout URL. Submittable on its own.

### Phase 1.0 - Foundation & skeleton *(critical path, unblocks all)*
- [ ] Monorepo scaffold: `apps/web` (Next.js), `apps/api` (FastAPI), `docker-compose` w/ Postgres
- [ ] FastAPI skeleton: health check, CORS, `pydantic-settings` config
- [ ] Next.js skeleton + React Flow canvas shell
- [ ] Postgres + SQLAlchemy + Alembic baseline migration
- [ ] Secrets hygiene: `.env.example`, `.gitignore`, log-redaction utility (Lane B/C pair)
- [ ] CI: lint + typecheck + test on push

### Phase 1.1 - The IR (the backbone) *(critical path - Lane A)*
- [ ] IR state-machine schema (Pydantic): `Workflow`, `State`, `Transition` (event-triggered), `Node`, `DataMapping`, `Variable`
- [ ] Capability-tag enum: `client_callback`, `authoritative_verification`, `financial_fulfilment`, `mutates_ledger`, `idempotency_boundary`, `signature_check`, `money_movement`, `reconciliation`, ...
- [ ] IR (de)serialization + schema validation
- [ ] Export JSON Schema → generate TS types for the frontend
- [ ] Node catalog/registry (Monnify / event / control-flow / safety / application) with typed input/output schemas + tags
- [ ] Author the **marketplace hero** as IR fixtures - **both** unsafe and safe versions

### Phase 1.2 - Canvas rendering + typed editing *(Lane C)*
- [ ] Render IR → React Flow (states = nodes, transitions = edges)
- [ ] Node config panel: business-meaning view + advanced raw-JSON view
- [ ] Add / remove / connect nodes
- [ ] Typed connection validation (reject `Bank[] → PaymentReference`) with inline TYPE ERROR
- [ ] Persist workflow (CRUD API + `workflow_versions` row)

### Phase 1.3 - Static analysis engine *(Lane A)*
- [ ] Tag-reachability graph-query primitives
- [ ] **MON001** client-callback-as-truth (Critical) · **MON002** missing signature verification (Critical) · **MON003** missing idempotency (High) · **MON004** amount not validated (High)
- [ ] Stretch: **MON005** blind retry after ambiguous timeout · **MON006** no reconciliation path
- [ ] Findings API: severity, message, node refs, explanation, doc link
- [ ] Architecture Review panel UI (Critical/High/Medium counts + finding cards)

### Phase 1.4 - Remediation (Apply Fix) *(Lane A + C)*
- [ ] Remediation transforms as IR rewrites (insert verify → validate-amount → idempotency before fulfilment; insert signature-check before webhook logic)
- [ ] **Apply Fix** applies transform → re-runs analyzer → shows graph diff
- [ ] Per-finding **Explain** + **Show documentation** actions

### Phase 1.5 - Sandbox proof-of-life *(Lane B)*
- [ ] Monnify sandbox auth service + secure key handling
- [ ] Real `initialize-transaction` → live checkout URL surfaced in UI
- [ ] Redacted request/response viewer

### Phase 1.x - README v1 + Epic 1 demo script

---

# EPIC 2 - Run & Break  *(execution + chaos)*

**DoD / demo:** Run the hero flow against the **real sandbox** end-to-end (poll-verify) with a live execution trace → then run local failure scenarios (duplicate webhook, invalid signature, worker crash) and watch the idempotency/signature guards hold and the crash gap get exposed → add the reconciliation pattern → re-run to PASS.

### Phase 2.1 - Executor core (the one engine) *(Lane B)*
- [ ] IR interpreter: walks states/transitions, manages execution context + variables
- [ ] `Adapter` interface; `ExecutionEvent` model + event store (Postgres)
- [ ] Execution-trace stream (SSE/WebSocket)
- [ ] Execution-trace viewer UI: redacted request/response, durations, state changes, logs *(Lane C)*

### Phase 2.2 - Monnify sandbox adapter (real run) *(Lane B)*
- [ ] `MonnifyAdapter`: initialize, verify-transaction (poll loop), subaccount/split calls for the marketplace hero
- [ ] Poll-verify wait-state handling (D4)
- [ ] Full hero happy-path **green against real sandbox**

### Phase 2.3 - Mock adapter + deterministic simulator *(Lane B)*
- [ ] `MockAdapter` with per-node fixtures
- [ ] Scenario engine: inject failures at transition points
- [ ] Scenarios: duplicate webhook · invalid signature · underpayment · overpayment · worker-crash-after-provider-success · network timeout · out-of-order
- [ ] Idempotency-guard + signature-check nodes **actually enforced** in the executor so guards visibly work

### Phase 2.4 - Chaos report + failure traces *(Lane B + C)*
- [ ] "Test my architecture" runs the scenario suite → pass/fail report with counts
- [ ] Counterexample / failure-trace viewer
- [ ] Link each failure back to its analyzer finding + suggested remediation

### Phase 2.5 - Reconciliation pattern *(Lane A + B)*
- [ ] Reconciliation state (scheduled → query → compare → repair → audit) as node + remediation transform
- [ ] Demo beat: worker-crash FAILS → Add Reconciliation Pattern → re-run PASS, no duplicate effect

### Phase 2.6 - Real webhook endpoint *(stretch, Lane B)*
- [ ] Public webhook receiver + signature verification + deploy/tunnel

---

# EPIC 3 - Ship & Explain  *(codegen + AI + share)*

**DoD / demo:** Export a **runnable** FastAPI project + pytest suite + README from the IR (and prove it runs) → describe a product in natural language and watch a valid IR appear (constrained) → share a link with secrets stripped.

### Phase 3.1 - Codegen (deterministic, from IR) *(Lane A)*
- [ ] Jinja2 templates: `client`, `models`, `checkout`, `verification`, `webhooks`, `idempotency`, `reconciliation`, `payouts`, `refunds`
- [ ] Emit pytest suite exercising idempotency + verification
- [ ] Emit README + `.env.example` + Dockerfile
- [ ] Enforce boundary: financial core from templates, AI only for comments/adapters (Principle 5)
- [ ] **Prove the generated project actually runs** (credibility clincher)

### Phase 3.2 - AI architecture assistant (constrained) *(Lane B)*
- [ ] Structured-output (Claude + Pydantic schema) **intent → IR**, validated against IR schema + auto-run analyzer on output
- [ ] 2-3 pre-tested canned prompts for demo reliability
- [ ] Missing-requirement question generation
- [ ] Per-node "why is this here?" explanation grounded in graph + findings
- [ ] Debug assistant ("why is this still pending?") reading the execution trace
- [ ] Guardrails: AI never in the financial-decision path, never sees raw secrets

### Phase 3.3 - Collaboration / sharing *(Lane C)*
- [ ] Shareable link (view / comment / duplicate) with secrets → placeholders
- [ ] Shared bundle: architecture + config + fixtures + sim results + required env vars

### Phase 3.4 - Template library *(Lane A)*
- [ ] E-commerce checkout · wallet/reserved-account · invoice collection · vendor payout · refund - as IR templates

---

## Non-build gating checklist (do today - these disqualify regardless of the build)
- [ ] All 3 in `apiconf-hackathon` on Monnify Slack; intros posted; notifications on (submission link drops there)
- [ ] Sandbox keys from app.monnify.com
- [ ] All members registered + confirmed in-person for the 25 July conference
- [ ] Social post with `#APIConfXMonnify` `#DeveloperChallenge`
- [ ] Public repo + step-by-step README + 2-5 min demo video
