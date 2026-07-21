# Monnify Studio — Bringing Down the Gates

> The canonical narrative for the pitch deck and demo. Deck by @DesignedbyMazi.
> This is the story; the slides dress it. Keep the story fixed, iterate the visuals.

---

## The one line

**Monnify Studio brings down the last gate between a person and a working payment product.**

---

## The problem: a gate got rebuilt

Moniepoint is a customer company. It brought hope by bringing down the **physical** gate to payments — a POS in every market stall put money movement in the hands of people the banks left behind.

Monnify is the digital version of that same promise: any payment flow, programmable. But like almost every developer tool, it quietly **rebuilt the gate** in a new place. To use it you must be a developer: read the docs, hold the API keys, write the integration, wire the webhooks, and then live with the doubt — *did I get it right?*

So the people who most need it are locked out again:
- the woman running an **ajo** has no developer,
- the **freelance developer** shipping a client's integration can't be sure it's correct,
- the **new developer** meeting Monnify for the first time hits a wall of docs.

**We finish what Moniepoint started.** Not competition — continuity. Monnify Studio brings that last gate down.

---

## What we remove: two gates

1. **The build gate** — *"you must be a developer to accept money."*
   Describe your product in plain words; Monnify Studio composes a typed, visual flow and turns it into a real, shareable product.

2. **The correctness gate** — *"a 200 doesn't mean the integration is correct."*
   A static analyzer proves the flow before a single naira moves — catching money-moved-before-fulfilment, missing webhook verification, unverified amounts, missing idempotency — and offers a one-click fix. Correctness never rests on the model; it's checked.

---

## The three who walk through

The heart of the pitch is three people, and the exact moment their gate falls on screen.

### 1. The women doing ajo
**Gate:** financial software needs a developer.
**Walkthrough:** "We're six women, ₦5,000 each every week, one person takes the whole pot each turn." → a real rotating-contribution product: a share link, verified pay-ins (provider truth, never a claim), WhatsApp nudges to whoever hasn't paid, and an automatic rotating payout.
**The aha:** the first pay-in verifies and the pot moves — real money, no code.

### 2. The developer offering their services
**Gate:** *"I built it — but is my integration actually correct?"*
**Walkthrough:** drag Monnify blocks, edit the request body, drop in a code block of their own logic and run it, execute against the **real Monnify sandbox**, watch the analyzer catch a real bug and fix it — then copy production-ready Python.
**The aha:** the analyzer flags `MONxxx`, Apply-Fix rewrites the graph to clean, the run goes green against real Monnify — and they copy code they can trust.

### 3. The new developer experimenting with Monnify
**Gate:** the docs wall.
**Walkthrough:** one sentence — "take a card payment and pay out to a vendor after it's confirmed." → Moni composes a correct graph grounded in the real Monnify docs and cheat sheet, they press Run, and see a **real sandbox response**, learning the API by doing instead of reading.
**The aha:** a sentence becomes a correct, running integration in seconds.

---

## Why it's different: the thesis

Most tools stop at "it returned 200." We start there. **A 200 doesn't mean the integration is correct** — it means the request was well-formed. Monnify Studio is the only one that *proves* the flow is correct (statically, before money moves) and *shows the provider's truth* (via verify + webhooks, never a client's claim). Freedom to build, without giving up correctness.

---

## How the Monnify APIs power it

Every capability is real Monnify sandbox, not a mock:
- **Collections** — initialize transaction (live checkout) + query (authoritative PAID/PENDING).
- **Disbursements** — single transfers, real money moved.
- **Reserved accounts** — per-member funding for ajo (modeled + code-generated).
- **Webhooks** — signature-verified receiver that re-derives truth from the provider, no polling.
- **Codegen** — deterministic, copyable Python emitted straight from the graph against the real API shape.

---

## The demo arc (5 minutes)

1. **The gate** (30s) — Moniepoint brought down the physical gate; the API rebuilt it. We bring it down.
2. **Ajo woman** (90s) — plain words → real contribution product → verified pay-in → rotating payout.
3. **Developer** (120s) — build, edit, run against real Monnify, analyzer catches a bug → Apply-Fix → copy real Python. *(The correctness gate falling.)*
4. **New dev** (45s) — one sentence → correct graph → real sandbox response.
5. **The close** (15s) — same hope Moniepoint gave through the POS, now one gate deeper.

---

## Design north star

Every screen should make a gate **visibly fall**. If a backend capability that removes a gate isn't visible in the UI, the story doesn't land — which is why the analyzer moment (#203) and the real-Monnify run (#202) are the deck's hero shots, tracked in [#204](https://github.com/Greyisheep/monnify-studio/issues/204).
