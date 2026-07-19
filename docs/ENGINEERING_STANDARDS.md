# Engineering Standards

The standards this project is held to. Grounded in **APOSD** - John Ousterhout's
*A Philosophy of Software Design*. The north star is one sentence:

> **The goal of software design is to minimize complexity.** Every decision here
> exists to make the system easier to understand and cheaper to change.

If a rule below ever fights that goal, the goal wins - raise it in a PR.

---

## 1. Design philosophy (APOSD)

These are the principles we actually apply in review, not decoration.

1. **Complexity is incremental - resist it every time.** There is no single
   catastrophic decision; complexity accretes from many small "this is fine"
   choices. Reviewers push back on each one.
2. **Deep modules over shallow ones.** A module should offer a *simple
   interface* over a *substantial implementation*. A class that just forwards
   calls (a pass-through) earns its keep by hiding something. Prefer few deep
   modules to many shallow ones.
3. **Information hiding.** Each module encapsulates a design decision that
   nothing else needs to know. Leaking that decision across modules (information
   *leakage*) is the defect we most want to avoid.
4. **Different layer → different abstraction.** If two adjacent layers have the
   same abstraction, one of them probably shouldn't exist.
5. **Define errors out of existence.** The best exception handling is an API
   shaped so the error can't arise. Reach for special cases last, not first.
6. **Design it twice.** For anything non-trivial, sketch two genuinely different
   approaches before committing. The second idea is usually better and the
   comparison sharpens both.
7. **Comments are part of the design, and describe what the code cannot.** Write
   the interface comment *before* the implementation. Comments capture intent,
   invariants, units, and "why" - never restate the code.
8. **Strategic, not tactical.** We are building a codebase, not just making it
   work today. Budget a little extra design on every change; refuse the "tactical
   tornado" that ships fast and leaves complexity behind.
9. **Make it obvious.** Code read far more than written. If a reviewer needs the
   author to explain it, it isn't done.

### How this codebase already reflects APOSD

Use these as the worked examples when in doubt:

- **Deep module:** `analysis/engine.py::Analysis.unguarded_targets` - one small
  method expresses "can danger be reached without passing a guard?", and *most*
  MON rules are one line on top of it. Simple interface, powerful body.
- **Deep module (frontend):** `apps/web/src/lib/flowIo.ts` - one adapter owns
  IR <-> React Flow mapping so canvas components never invent edge kinds.
- **Information hiding:** the `providers/` catalog hides every Monnify-specific
  detail behind a neutral `NodeTypeDef`. The analyzer reasons only over
  capability *tags* and never learns a provider exists (D13). Swapping providers
  touches one file.
- **Different abstraction per layer:** `ir/` (graph shape) -> `providers/`
  (what nodes mean) -> `analysis/` (correctness). No layer restates the one below.
  On the web: `types` -> `lib` -> `hooks` -> `components`.
- **Errors defined out of existence:** invalid workflows are rejected by typed
  connections at edit time, so the analyzer/executor never handle "impossible"
  graphs downstream.

---

## 2. Repository structure

**The root stays minimal.** It holds only conventional entries (dotfiles,
`README.md`, `LICENSE`) and top-level directories. No loose scripts, no stray
configs, no scratch files at the root. Everything lives in a directory that says
what it is.

Canonical monorepo layout (grows into this - don't create empty dirs early):

```
monnify-studio/
├── README.md            # what it is + quickstart, nothing more
├── .env.example         # config template (never a real .env)
├── .github/             # CI workflows, issue/PR templates
├── docs/                # BUILD_PLAN, ENGINEERING_STANDARDS, ADRs, diagrams
├── infra/               # docker-compose, deployment, migrations config
├── apps/
│   ├── api/             # FastAPI backend (its own pyproject, tests, scripts)
│   │   ├── monnify_studio/   # the package (ir / providers / analysis / ...)
│   │   ├── scripts/          # runnable dev/demo scripts
│   │   └── tests/
│   └── web/             # Next.js + React Flow frontend
└── packages/            # shared, cross-app code (e.g. generated IR TS types)
```

Rules:
- A file's location should be predictable from its purpose. If you hesitate where
  something goes, that's a signal to add/clarify a directory - say so in the PR.
- Tests live beside the app they test (`apps/api/tests`), mirroring the package.
- Temporary/scratch work never gets committed (see `.gitignore`); it goes in a
  scratch dir outside the repo.

---

## 3. Git & collaboration workflow

Issue-first, branch-per-issue, reviewed PRs.

- **Every change traces to an issue.** No issue → open one first.
- **Branch naming:** `<type>/<slug>-<issue#>`, e.g. `feat/remediation-6`,
  `docs/engineering-standards-21`, `fix/webhook-idempotency-33`.
- **`main` is protected in spirit:** no direct pushes. Land work through a PR.
- **PRs reference the issue:** put `Closes #N` in the description so merging
  closes it. Keep PRs scoped to one issue where possible.
- **Review before merge.** At least one teammate approves. Self-merge only when
  explicitly agreed (e.g. solo hackathon crunch), and say so in the PR.
- **Conventional Commits** for messages:
  `feat|fix|docs|chore|refactor|test|perf(scope): summary`. The body explains
  *why*, referencing decisions (`D#`) where relevant.

---

## 4. Traceability - full idea tracing

Anyone reading a line of code should be able to recover **why it exists** without
asking. We keep the whole chain navigable *from the code itself*:

```
code comment  →  issue/PR number  →  decision (D#)  →  rationale
```

Rules:

- **Put the issue/PR number in the code.** When a line encodes a non-obvious
  choice, cite its origin in the comment - the issue (`#6`) and the decision
  (`D10`) that motivated it. E.g.:
  ```python
  # Split settles immediately, so it's wrong for payout-after-fulfilment (#6, D10).
  ```
- **Module docstrings name the decisions - and issues - they implement**, so a
  file's provenance is visible at the top. (Our core modules already cite `D#`;
  add the originating issue alongside.)
- **Close the loop from both ends.** Commits/PRs carry `Closes #N` (issue ← code);
  code carries `#N` / `D#` (code → issue → why). With `git blame`, every line then
  reaches its PR, its discussion, and its decision.
- **The bar:** if a reviewer asks "why is this here?", the trace is missing - add
  the reference, don't just answer in the thread.

This is not comment noise. Cite the *why* and the *source of the decision*; never
restate the code (APOSD §7). One good reference beats a paragraph.

---

## 5. Python standards

- **Module layering is one-directional:** `ir` → `providers` → `analysis` /
  `fixtures`. Never import "up" the stack. This keeps `ir` provider-agnostic.
- **Type hints everywhere**; models are Pydantic. `from __future__ import
  annotations` at the top of every module.
- **Lint/format with `ruff`** (config in `apps/api/pyproject.toml`). CI fails on
  violations.
- **Docstrings** on every module and public function: state the *contract* and
  the *why*, not a paraphrase of the body (APOSD §7). Module docstrings note the
  decisions they implement.
- **Errors:** validate at the boundary (typed IR, config load) so core logic
  stays on the happy path. Raise precise exceptions; don't return sentinels that
  callers must remember to check.
- **Dependencies** are managed with `uv`; commit `uv.lock`.

## 6. Frontend standards (`apps/web`)

The Studio canvas is Next.js (App Router) + React Flow. Lane C owns this tree.
Issue provenance for the Epic 1 shell: canvas editing (#4), Architecture Review
panel (#27). Design craft is a feature, not polish (D14). Stack choice: D6.

### Layout

```
apps/web/src/
├── app/           # Next entry (page, layout, globals.css tokens)
├── components/    # Presentational UI with narrow props
├── hooks/         # Session (load/save/analyze/remediate) and graph edits
├── lib/           # API client, IR <-> React Flow adapters, findings helpers
├── types/         # IR/analysis contracts (temporary hand ports until codegen)
└── data/          # Offline hero fixtures when the API is unreachable
```

### Rules

- **TypeScript strict.** Prefer names that read as prose (`sourceNode`, not `n`).
- **IR types: single source of truth (D6).** Target state: Pydantic exports JSON
  Schema -> generated TS under `packages/` (or a generated folder the web app
  imports). Do not invent a second IR model on the frontend.
  - *Interim (until Phase 1.1 codegen lands):* hand ports may live in
    `apps/web/src/types/`. Every such file must say it is interim, cite D6, and
    name the Python module it mirrors. Prefer tightening the backend contract
    and regenerating over growing the hand port.
- **Deep modules, shallow props.** Hooks and `lib/` hide transport, validation,
  and IR mapping. Components take focused props; avoid dumping every session
  setter into child trees. Compose in `StudioApp`, do not recreate a god
  component.
- **Design tokens (D14).** Visual language lives in CSS custom properties in
  `src/app/globals.css` (`:root`). New colors/fonts go through tokens first;
  do not sprinkle one-off hexes into components. Tailwind is available but the
  Studio shell is token-driven custom CSS on purpose.
- **API boundary.** Talk to the FastAPI app only through `lib/api.ts`. Live API
  is preferred; fixture fallback in `src/data/` is intentional for offline demo.
  Default origin: `NEXT_PUBLIC_API_URL` (see `apps/web/.env.example`), typically
  `http://127.0.0.1:8010` so it does not collide with other local services on
  8000.
- **Traceability.** Module headers cite the issue(s) and decision(s) they
  implement (`#4`, `#27`, `D6`, `D14`), same bar as Python (§4).
- **Scripts.** At minimum: `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`).
  Keep the suite green before merge when CI covers web.

### Worked frontend modules (APOSD)

- **Deep module:** `lib/flowIo.ts` hides IR <-> React Flow mapping behind
  `workflowToFlow` / `flowToWorkflow`. Canvas code never hand-builds IR edge
  shapes.
- **Information hiding:** `hooks/useStudioSession.ts` owns load/save/analyze/
  remediate and source (`api` vs `fixture`). Presentational panels do not know
  how fixtures are chosen.
- **Different abstraction per layer:** `types` (contract) -> `lib` (IO/adapters)
  -> `hooks` (session/graph behaviour) -> `components` (pixels).

---

## 7. Testing & CI

- **Behaviour, not implementation.** Tests assert the contract (e.g. *which* MON
  rules fire on the unsafe hero), so refactors don't churn the suite.
- The suite must be **green before merge**; CI runs lint + type check + tests.
- New correctness logic ships with tests in the same PR.
- Fast by default: unit/deterministic tests need no network. Sandbox-touching
  tests are opt-in and clearly marked.

## 8. Security & secrets

- **Sandbox only.** Production execution is refused by default
  (`ALLOW_PRODUCTION_EXECUTION=false`); never enabled in the challenge build.
- **No secrets in version control, logs, workflows, shared links, or AI context.**
  Secrets come from `.env` (git-ignored); `.env.example` documents the shape.
- Logs redact sensitive headers/fields. Generated code reads config from the
  environment, never inlined keys.

---

## 9. Definition of Done

A change is done when:

1. It closes a specific issue and the PR says `Closes #N`.
2. It reduces or holds complexity - a reviewer finds it obvious.
3. Public interfaces are documented (the *why*, per APOSD).
4. It is **fully traceable**: the code carries its issue/PR + decision references,
   so the "why" is answerable from the source alone (§4).
5. Tests cover the new behaviour and the suite is green.
6. No secrets, no root-level clutter, no dead files left behind.
7. Decisions that shaped it are recorded (link the `D#` or add one to `docs/`).

---

## 10. Prose and docs

- **No em-dashes or en-dashes, anywhere.** Never use the em-dash (U+2014) or
  en-dash (U+2013) in prose, code, comments, docs, commit messages, or issue/PR
  text. Use commas, parentheses, colons, or plain hyphens instead. No exceptions.
- Keep docs current with the code: a change that alters behaviour updates its
  docs in the same PR.
- Write plainly. State the "why", not just the "what" (this pairs with the
  traceability rule in section 4).

---

## 11. Observability (D15)

- Structured JSON logs only (structlog), one JSON object per line. No stray
  `print` debugging left in code.
- Every request and execution gets a correlation id; every log line emitted
  inside a span carries the OpenTelemetry trace id, so logs and traces line up.
- Trace context propagates across the API, executor, and provider adapters.
- Secrets are always redacted from logs, key-based and value-based
  (`observability/redaction.py`). Register secret values with `register_secret`.
- Reach for `get_logger()` and `traced(...)` from `monnify_studio.observability`
  rather than ad hoc logging.
