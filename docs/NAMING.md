# Naming register (canonical)

One name per concept, grounded in the product model ([#105](https://github.com/Greyisheep/monnify-studio/issues/105)). Use these words in the UI, the code, Moni's replies, the README, and the pitch, so everyone says the same thing and we can explain each in a line.

## The dual-register rule

The Business door must be usable by an 8-year-old and an 80-year-old; the Developer door may be technical (#105). So a concept can carry **two surface words** (business / developer) over **one code symbol**. Same thing underneath, right word for who is looking. Most concepts need only one shared word; only a few split.

## Shared terms (one word for both doors)

| Concept | Name | One line | Code symbol |
|---------|------|----------|-------------|
| The thing you build | **Flow** | a bundle of Monnify calls wired in best-practice order | `Workflow` |
| A step in a flow | **Block** | one node on the whiteboard (an API call or a check) | `Node` |
| The editor | **Whiteboard** | where you see and edit a flow as blocks (both doors share it) | `canvas` / Studio |
| A ready-made flow | **Template** | a finished flow you pick and tweak | template id |
| The assistant | **Moni** | composes and explains, grounded in the docs | `ai` / Moni |
| The money book | **Dashboard** | your inflow / outflow / profit ledger | dashboard |
| The buyer page | **Shop link** | shareable storefront + QR | `shop` |
| Seller's price list | **Catalog** (UI: "Products & services") | the list of what a business sells | `catalog` |
| A bill | **Invoice** | a trackable request for payment | invoice |
| Standing account | **Dedicated account** | reserved account for recurring money in | reserved account |
| Held funds | **Wallet** | balance a business holds | wallet |
| "Tell someone" | **Notifications** | cross-cutting primitive (WhatsApp / email / SMS); not a pillar | notify |

## Split terms (business word / developer word)

| Concept | Business door | Developer door | Code symbol |
|---------|---------------|----------------|-------------|
| Try a flow safely | **Try it** | **Run** | `run` |
| Make it real | **Publish** | **Deploy** | `deploy` |
| The safety checker | **Safety check** then **Fix it** | **Analyzer** then **Apply-Fix** | `analyzer`, `apply_fix` |
| Money movements | **Money in / Money out** | **Accept payments / Payout** | pillars |

## Entry flow (business)

`Path` (the door: Business or Developer) -> **Goal** ("What do you want to do?": Sell goods/services, Send an invoice, Pay staff, Savings group, Something else) -> the setup that fits (Catalog only for the Sell goal; everything else hands to Moni) -> Dashboard.

- **Path** — code `path`, values `business` / `developer`.
- **Goal** — code `goal`; maps onto template ids (`sell-online`, `invoice`, `payroll`) plus Moni for "Something else".

## Dashboard labels

Business door softens the accountant words for the 8-to-80 bar; the developer/export view may keep the precise ones:

| Business label | Accountant label |
|----------------|------------------|
| Money in | Total inflow |
| Money out | Total outflow |
| Profit | Net profit |
| Needs attention | Actions needed |

## Rules of use

1. Friendly names are **labels**; the code symbols (`Workflow`, `Node`, `canvas`) stay as they are. No renames.
2. Moni speaks the **business** words on the Business path and the **developer** words on the Developer path.
3. New user-facing copy must use a name from this table. If a concept is missing, add it here first.
