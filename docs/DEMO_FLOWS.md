# Demo Flows — the two journeys we ship

> The story is **Bringing Down the Gates** (see `docs/PITCH.md`): Moniepoint
> brought down the physical gate to payments; the API rebuilt it as a developer
> gate; Monnify Studio brings that last one down.
>
> Live app: **https://monnify-studio-web-cu5qickhka-bq.a.run.app** — starts on a
> clean slate (no seeded data), so a tester only ever sees what they create.
> Status legend: ✅ works · ⚠️ partial · ❌ not built.

---

## Flow 1 — Developer (the "is my integration correct?" gate)

**Journey:** land → **I'm a developer** → type what to build → Moni generates a
correct, analyzed flow → **Run** hits the real Monnify sandbox → the run asks
*"where should the confirmation go?"* and delivers a **real WhatsApp + email** to
the tester → edit an endpoint's **request body** → Run reflects the edit → **copy
the read-only Python** and go.

| Step | Status | Notes |
|---|---|---|
| Land → developer door | ✅ | |
| Type → Moni generates a correct flow | ✅ | ~30s (multi-round LLM + analyzer). Provider failover (openai → google → anthropic). |
| **Code** is the default panel | ✅ | Read-only, syntax-highlighted Python (One Dark). The old debug-dump landing is gone (#212). |
| Press **Run** → hits real Monnify sandbox | ✅ | Default is **Sandbox** (demo key) with a one-click mode toggle. Honest `PENDING` until a human pays. |
| Webhook-driven flow **completes** (not "failed") | ✅ | Verify falls back to the run's real payment_reference, so a card→webhook→verify→notify flow finishes. |
| **Notification on run** — real WhatsApp + email | ✅ | A notify block opens a pre-run prompt for the tester's own number/email, then delivers via Evolution (WhatsApp) + ZeptoMail (email). Enter nothing → no send. |
| Edit an endpoint **request body** → Run reflects it | ✅ | Edits drive the live call, not just codegen. Editable via ConfigPanel. |
| Add a **Code Block**, run with defaults | ✅ | Snippet executes for real, jailed (AST allowlist + subprocess). Discoverability still improvable (#153). |
| **Copy** the code; editor is **read-only** | ✅ | |
| **Drag-drop** a dashboard / invoice block | ⚠️ | Node glyphs shipped; full drag-drop product blocks still open (#232). |

**What makes Flow 1 land:** the analyzer catching a real MON finding → **Apply-Fix**
→ clean → Run against real Monnify → a confirmation lands on your phone → **copy
trustworthy code**.

---

## Flow 2 — Business (the "you must be a developer" gate)

**Journey:** land → **I'm a business owner** → pick a template (**Ajo** or **Shop**)
→ **dashboard** → a detailed onboarding tour → **share a link** to a customer →
the customer self-serves an invoice / is reminded to pay (WhatsApp) → money moves,
dashboard updates. A tech-savvy owner can open the **whiteboard** and edit/test
flows like a developer.

| Step | Status | Notes |
|---|---|---|
| Land → business → template picker | ✅ | Matches Figma (solid bg, illustrations). |
| Pick **Ajo** / **Shop** → set up → **dashboard** | ✅ | Real totals / invoices / activity / goal-aware share. |
| **Detailed onboarding tour** on the dashboard | ✅ | Seven-step walkthrough with spotlights (#103). |
| Share a **link** to a customer | ✅ | Goal-aware share (shop vs ajo) + WhatsApp share. |
| Buyer self-serves the **pay-link storefront** | ✅ | One shop link + QR; buyer picks items → invoice → paid only when Monnify confirms. |
| Customer **reminded to pay** (ajo → WhatsApp) | ✅ | Calls Evolution per unpaid member; delivery/failure recorded truthfully (#234). |
| Reserved account per ajo member | ⚠️ | Live v2 call with BVN/NIN; honest fallback when Monnify returns 503/`99` (#235). |
| Money moves → dashboard updates | ✅ | Real collection + disbursement against sandbox. |
| Whiteboard + business whiteboard tour | ✅ | Reachable via the rail; three-step plain-words tour (#233). |
| "Something else" (no template) | ✅ | Describing a product to Moni generates a real dashboard artifact (#222). |
| Onboarding **matches the design** everywhere | ⚠️ | Core screens fixed; broader polish ongoing. |

---

## Cross-cutting (both flows)

| Item | Status | Notes |
|---|---|---|
| Real Monnify sandbox: collect + verify + disburse | ✅ | Proven live. OTP off, real source wallet. |
| Webhook receiver (signature-verified, re-verifies) | ✅ | Live + configured (#178). |
| Moni AI resilient (provider failover) | ✅ | openai default, falls through to google/anthropic. |
| **Real WhatsApp works on prod** | ✅ | Evolution reached from Cloud Run via a cloudflared tunnel from the Carlofty box (see the prod-ops runbook). Keep the tunnel up during a live demo. |
| Real email (ZeptoMail) | ✅ | Public API, no tunnel. |
| Clean start (no seeded data) | ✅ | Boot seed off by default; testers start empty. |
| Persistence (survive restart) | ❌ | In-memory (#81). Cold-start risk; a recorded video sidesteps it. |

---

## Run it

**Judges — nothing to install:** https://monnify-studio-web-cu5qickhka-bq.a.run.app

**Locally — one command:**

```bash
docker compose up      # http://localhost:3000, no DB, keyless-capable
```

Drop keys into a `.env` (copy `.env.example`) to unlock real compose + the live
Monnify sandbox + notifications.
