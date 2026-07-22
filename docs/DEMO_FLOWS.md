# Demo Flows — the two journeys we ship

> The canonical target for the demo, set by Claret. Everything we build serves
> one of these two flows. The story is **Bringing Down the Gates** (see
> `docs/PITCH.md`): Moniepoint brought down the physical gate to payments; the
> API rebuilt it as a developer gate; Monnify Studio brings that last one down.
>
> **To the team (@Eazyisreal @GloriaKaduru @DesignedbyMazi):** pick up ANY task
> below. The only bar is that the end-to-end flow works. Grab a checkbox, open a
> branch, ship it. Status legend: ✅ done · ⚠️ partial · ❌ not built.

---

## Flow 1 — Developer (the "is my integration correct?" gate)

**Journey:** land → **I'm a developer** → type what to build → Moni generates a
correct, analyzed flow → **Run** hits the real Monnify sandbox → see the result
(and a notification) → add a **Code Block** to change logic → Run again (defaults
in the body) → edit an endpoint's **request body** → Run reflects the edit → happy
→ **copy the Python** and go. Bonus: drag-drop a **dashboard** or **invoice**.

| Step | Status | Notes / tracking |
|---|---|---|
| Land → developer door | ✅ | dev-card icon was missing — minor, fold into design polish |
| Type → Moni generates a correct flow | ⚠️ | Works, but **compose takes ~35s** (multi-round LLM). Feels stuck. → **cap rounds / stream progress** |
| Press **Run** → hits real Monnify sandbox | ✅ | Default is now **Sandbox** (seeded demo key) with a one-click mode toggle (#227). |
| See a **notification** after the run | ❌ | Executor has **no `app.notify*` branch** → notify blocks are no-ops on Run. Real WhatsApp is proven (Evolution tunnel), just not wired into the run. → **notification-on-run** |
| Add a **Code Block**, run with defaults | ⚠️ | Snippet executes for real, jailed (#147). But Code Block is **buried in the palette** → **discoverability** (#153). |
| Edit an endpoint **request body** → Run reflects it | ✅ | Edits now drive the live call, not just codegen (#226). Editable fields via ConfigPanel (#192). |
| **Copy** the code; editor is **read-only** | ✅ | Read-only syntax-highlighted Python (One Dark), Python-only, JSON coming soon (#211/#224/#228). |
| **Drag-drop** a dashboard / invoice block | ❌ | New feature. → **drag-drop product blocks** |
| Accurate **developer/whiteboard tour** | ⚠️ | Tour exists; needs an accuracy pass → design + #155 |

**What makes Flow 1 land:** the analyzer catching a real MON finding → **Apply-Fix**
→ clean → Run against real Monnify → **copy trustworthy code**. Analyzer UI is
mounted (#203). Keep that moment tight.

---

## Flow 2 — Business (the "you must be a developer" gate)

**Journey:** land → **I'm a business owner** → pick a template (**Ajo** or **Shop**
— our most sophisticated) → see it → set it up → land on the **dashboard** → a
**detailed onboarding tour** → use the full scope → **send a customer a link** →
the customer is **reminded to pay** (ajo → WhatsApp) → money moves, dashboard
updates. **And** if the owner is tech-savvy and opens the **whiteboard**, a
**whiteboard tour** lets them edit and test flows like a developer.

| Step | Status | Notes / tracking |
|---|---|---|
| Land → business → template picker | ✅ | Picker now matches Figma (solid bg, illustrations). |
| Pick **Ajo** / **Shop** → set up → **dashboard** | ✅ | Real totals / invoices / activity / goal-aware share. |
| **Detailed onboarding tour** on the dashboard | ✅ | Seven-step Figma walkthrough with dashboard spotlights, independent dismissal, and browser-driven coverage (#103). |
| Share a **link** to a customer | ✅ | Goal-aware share (shop vs ajo contribute) + WhatsApp share. |
| Customer **reminded to pay** (ajo → WhatsApp) | ✅ | Verified pay-ins and the labeled demo simulation call Evolution for each unpaid member. Delivery/failure is recorded truthfully; hidden member numbers survive roster edits (#234). |
| Reserved account per ajo member (funding) | ⚠️ | Live adapter now calls Monnify v2 with BVN/NIN and surfaces provider failures honestly. Hermetic contract coverage is green; a live sandbox smoke remains because this endpoint can return 503/`99` (#235). |
| Money moves → dashboard updates | ✅ | Real collection + disbursement against sandbox. |
| Tech-savvy owner opens the **whiteboard** | ✅ | Reachable via the rail (Workflow). |
| **Whiteboard tour** for business owners | ✅ | Separate three-step, plain-words tour on first Workflow visit, with its own dismissal state (#233). |
| Business onboarding **matches the design** | ⚠️ | Header/template-picker/product-thumb fixed; broader onboarding is **poor vs design** → **onboarding design pass** |

**"Something else" (no template):** describing a product to Moni now generates a
real dashboard artifact (#222) — the new-dev / bring-your-own-idea path.

---

## Cross-cutting (both flows)

| Item | Status | Notes |
|---|---|---|
| Real Monnify sandbox: collect + verify + disburse | ✅ | Proven live. OTP off, ₦5bn wallet. |
| Webhook receiver (signature-verified, re-verifies) | ✅ | Live + configured (#178). Redirect-back still open. |
| Moni AI resilient (provider failover) | ✅ | openai default, falls through to google/anthropic (#15). |
| Real WhatsApp (Evolution) | ✅ proven | Local-run + tunnel: `ssh -f -N -L 8080:127.0.0.1:8080 carlofty-prod`, instance `carlofty-otc`. Not reachable from Cloud Run prod. |
| Persistence (survive restart) | ❌ | In-memory (#81). Live-demo cold-start risk; recorded video sidesteps it. |
| Preview default state (tacky debug dump) | ⚠️ | #212 |
| Tooltips / effects polish, accurate tours | ⚠️ | Ongoing |
| Submission: README, 5-min video, repo public, key rotation | ❌ | The hard gate (#56). |

---

## How to run the demo locally (with real WhatsApp)

```bash
# 1. real nudges: tunnel to Carlofty Evolution (keeps localhost:8080 -> Evolution)
ssh -f -N -L 8080:127.0.0.1:8080 carlofty-prod
# 2. run the app (API + web) with the root .env (already has MONNIFY_* + EVOLUTION_*)
# 3. Run mode defaults to Monnify sandbox; ajo pay-ins fire real WhatsApp to the member number
```

Prod (judges): https://monnify-studio-web-cu5qickhka-bq.a.run.app — everything
except real WhatsApp works there (Evolution is local-only).

---

## Open gaps → issues (take any one)

- **notification-on-run** — executor fires `app.notify*` (and real WhatsApp) during a Run
- **drag-drop product blocks** — add a dashboard / invoice block on the canvas (Flow 1 bonus)
- **reserved-account live smoke** — run `create_reserved_account` against sandbox with test KYC; retain the honest fallback when Monnify returns 503/`99` (#235)
- **Flow 2 visual acceptance** — final design-owner pass over dashboard/Ajo surfaces (#194/#193)
- **compose speed** — cap LLM rounds / stream progress so it doesn't feel stuck
- **preview default state** (#212), **Code Block discoverability** (#153), **redirect-back** (#178)
- **persistence** (#81), **submission** (#56)
