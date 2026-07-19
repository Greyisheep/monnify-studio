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
- **Information hiding:** the `providers/` catalog hides every Monnify-specific
  detail behind a neutral `NodeTypeDef`. The analyzer reasons only over
  capability *tags* and never learns a provider exists (D13). Swapping providers
  touches one file.
- **Different abstraction per layer:** `ir/` (graph shape) → `providers/`
  (what nodes mean) → `analysis/` (correctness). No layer restates the one below.
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

## 6. Frontend standards (when `apps/web` lands)

- TypeScript strict; IR types are **generated** from the backend JSON Schema -
  never hand-duplicated (single source of truth).
- A cohesive design system (tokens, not ad-hoc styles) - design craft is a
  feature here, not polish (D14).
- Components are deep: a clean prop interface over real behaviour; no prop-drilling
  soup.

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
