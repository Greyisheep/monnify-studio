# Contributing to Monnify Studio

Thanks for being here. Monnify Studio turns a plain-language description of a payment
product into a typed, safety-checked flow that becomes a real product: a shop link, an
invoice, a dashboard. The thesis that shapes every pull request is one line:

> **AI proposes, the analyzer disposes. Correctness never rests on the model.**

Keep that in mind and most review comments answer themselves.

---

## Start here (five minutes, no API keys)

The whole suite passes keyless on purpose. That is the proof that the no-key fallbacks
really carry the product, so you never need a credential to make your first change.

The fastest way to a running studio is one command:

```bash
docker compose up      # both services, http://localhost:3000
```

To work on the code you will want the two servers directly, so you get reloads and can
run the tests:

```bash
# Terminal 1: backend (analyzer, Moni, product API)
cd apps/api
uv sync --all-extras
uv run pytest -q          # 268 tests, no keys needed
uv run uvicorn monnify_studio.api.main:app --port 8010 --host 127.0.0.1
```

```bash
# Terminal 2: the canvas
cd apps/web
cp .env.example .env.local     # NEXT_PUBLIC_API_URL=http://127.0.0.1:8010
npm ci && npm run dev          # http://localhost:3000
```

You can also prove the thesis without a server at all:

```bash
cd apps/api && uv run python scripts/demo_analyze.py
```

The unsafe hero flow returns three critical findings and one high. The safe one returns
nothing. No model is involved in either answer.

**Stuck?** Common first-run snags: `uv` not installed (`curl -LsSf https://astral.sh/uv/install.sh | sh`),
port 8010 already taken (pass a different `--port` and update `.env.local` to match), or
Node older than 20. If something else bites you, open an issue. A confusing first run is
a bug in our docs, not a failure on your part.

---

## Four ways in

You do not have to write Python to move this project forward.

| Track | What it looks like | Filter |
|-------|--------------------|--------|
| **Code** | New analyzer rules, catalog nodes, canvas behaviour, provider packs | [`good first issue` + `lane:core`](https://github.com/Greyisheep/monnify-studio/labels/good%20first%20issue) |
| **Docs** | Quickstarts, rule explainers, worked examples, fixing what misled you | [`documentation`](https://github.com/Greyisheep/monnify-studio/labels/documentation) |
| **Design** | Empty states, error states, plain-words copy, the flows a first-timer walks | [`lane:design`](https://github.com/Greyisheep/monnify-studio/labels/lane%3Adesign) |
| **Testing** | Regression guards, template sweeps, edge cases around money and verification | [`good first issue`](https://github.com/Greyisheep/monnify-studio/labels/good%20first%20issue) |

Issues tagged **`good first issue`** are scoped so that one sitting is enough, and each
one names the files to touch. Comment on the issue to claim it; if nobody replies within
a day, take it anyway. We would rather have your PR than a tidy queue.

Have an idea we have not thought of? Open an issue and describe the problem before the
solution. Everything in this repo starts as an issue, including ours.

---

## The house rules

Six things a reviewer will always check. The long version lives in
[`docs/ENGINEERING_STANDARDS.md`](docs/ENGINEERING_STANDARDS.md).

**1. Money is exact.** Every amount is a `Decimal` to the kobo, never a `float`. Compare
with `covers()`, never a raw `>=`. `apps/api/monnify_studio/money.py` is the only place
that decides what an amount means.

**2. No model in the correctness path.** Moni can propose, explain, and refine. She
cannot decide whether a flow is safe, and she can never fabricate a `Money` value. If
your change lets a model output reach a financial decision without deterministic code in
between, it will be sent back.

**3. Nothing is paid until Monnify says so.** Client callbacks, redirects, and screenshots
are claims. Only a server-side verify against Monnify is truth. This is the fraud the
product exists to defeat, so it is not negotiable anywhere in the codebase.

**4. Code carries its own "why".** When a line encodes a non-obvious choice, cite the
issue and the decision that motivated it, right there in the comment:

```python
# Split settles immediately, so it's wrong for payout-after-fulfilment (#6, D10).
```

If a reviewer has to ask why something exists, the trace is missing. Add the reference
rather than answering in the thread.

**5. Plain words, in both registers.** A business user reads "Waiting: customer pays",
a developer reads `node.suspended`. Both registers describe one model, and
[`docs/NAMING.md`](docs/NAMING.md) says which word goes where. Check it before inventing
a new term.

**6. No em-dashes or en-dashes.** Not in prose, code, comments, docs, commit messages,
issues, or UI copy. Commas, parentheses, colons, and plain hyphens all work fine.

And one boundary that is absolute: **sandbox only**. Production execution is refused by
default (`ALLOW_PRODUCTION_EXECUTION=false`). Secrets live in `.env`, which is
git-ignored, and never enter logs, workflows, shared links, or AI context. If you find a
security issue, email ibeawuchiclaret@gmail.com instead of opening a public issue.

---

## How a change lands

1. **An issue exists.** No issue means open one first, even for a typo. It is how the
   "why" survives us.
2. **Branch from `dev`**, named `<type>/<slug>-<issue#>`, for example
   `fix/invoice-redirect-172` or `docs/analyzer-rules-241`.
3. **Conventional Commits**: `feat|fix|docs|chore|refactor|test|perf(scope): summary`.
   The body explains why, referencing decisions (`D#`) where relevant.
4. **Open the PR against `dev`**, not `main`. GitHub will preselect `main`, so change the
   base branch. Put `Closes #N` in the description.
5. **CI must be green.** Every PR runs `ruff` plus `pytest` on the API and typecheck plus
   `vitest` plus lint on the web app. Run them locally first and you will save a round trip:

   ```bash
   cd apps/api && uv run ruff check monnify_studio tests && uv run pytest -q
   ```

   ```bash
   cd apps/web && npm run typecheck && npm run test && npm run lint
   ```

6. **A maintainer reviews.** We aim to respond within a few days. If we go quiet longer
   than that, nudge the PR; it means we dropped it, not that you did something wrong.

New correctness logic ships with tests in the same PR. Behaviour, not implementation:
assert *which* MON rules fire on a flow, so a refactor does not churn the suite.

---

## What "done" looks like

A change is done when it closes a specific issue, holds or reduces complexity, documents
the why on any public interface, carries its issue and decision references, ships with
tests that pass, leaves no secrets or stray files behind, and records any decision that
shaped it.

That is a high bar for a first PR, and we do not expect you to clear it alone. Open the
PR when it works, and we will walk the rest with you in review.

---

## Where we talk

- **Issues** are the main channel. Design debates included; we would rather argue in the
  open where the next person can read it.
- **Community updates** go out in week 1 and week 3 of each month, to everyone on the
  developer list.
- **A one hour community call** happens in week 4: what shipped, what is next, and what
  you want built. Scheduling polls come with the updates.

Want on that list? Reply to any update, or open an issue and say hello.

---

## License

By contributing you agree that your work is licensed under the [MIT License](LICENSE)
that covers this repository. You own your code and your idea.
