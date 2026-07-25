# Brigade — documentation

Restaurant operations platform built for VibeAthon 6.0 (25–27 July 2026).

**These docs are the spec, not a write-up.** They were written before the code and the code is
implemented against them. If code and docs disagree, that's a bug in one of them — fix it, don't
leave it.

## Reading order

| # | Doc | Read it when |
|---|---|---|
| 1 | [01-overview.md](01-overview.md) | You want to know what Brigade is and why it isn't a Toast clone |
| 2 | [02-architecture.md](02-architecture.md) | You need the stack, the topology, or why a choice was made |
| 3 | [03-data-model.md](03-data-model.md) | You're touching the schema, RLS, or migrations |
| 4 | [04-design-system.md](04-design-system.md) | You're writing any UI |
| 5 | [05-runway-engine.md](05-runway-engine.md) | You're touching availability, forecasting, or steering |
| 6 | [06-roadmap.md](06-roadmap.md) | You need the schedule, the cut line, or the risk register |
| 7 | [07-submission.md](07-submission.md) | You're checking rubric coverage or building the deck |
| 8 | [08-runbook.md](08-runbook.md) | You're setting up, deploying, or running the demo |

Per-feature docs live in [features/](features/) — one file per feature, all on the same template,
each carrying a `Status: planned | built | cut` field. **Status fields must match reality**; a docs
tree that claims more than the deployed app is worse than no docs.

## The one-paragraph version

A printed menu is a promise the kitchen may not be able to keep. Brigade makes the menu a live
function of the pantry: every dish has a recipe against tracked stock, so availability is *computed*,
never toggled. On top of that it computes **runway** — how many minutes until each dish runs out at
tonight's actual sell rate — and uses that one number to warn the kitchen before it 86s, to tell the
guest "6 left," and to steer demand toward dishes the kitchen can actually deliver profitably.

## Glossary

Restaurant vernacular used throughout. It appears in the **ops UI** because it's what kitchen staff
genuinely recognise; guest-facing copy uses plain language instead.

| Term | Meaning |
|---|---|
| **86** | To mark a dish unavailable. "We're 86 the branzino." Used as verb and adjective. |
| **runway** | Brigade's own term: minutes until a dish 86s at current sell rate. The core metric. |
| **the pass** | The counter where the kitchen hands finished plates to the floor. |
| **expo** | Expediter — the person at the pass coordinating plates out to tables. |
| **docket / chit** | A kitchen ticket. One order as the kitchen sees it. |
| **station** | A section of the kitchen (grill, sauté, larder, pastry). Tickets are split by station. |
| **brigade de cuisine** | Escoffier's kitchen hierarchy. The product's namesake and its permission model. |
| **chef de partie** | Station cook. Maps to the `chef` role. |
| **chef de rang** | Front-of-house server. Maps to the `server` role. |
| **cover** | One guest served. "We did 120 covers" = 120 diners. |
| **par level** | Target stock level for an ingredient. |
| **BOM** | Bill of materials — the ingredient list and quantities that make one portion of a dish. |
| **daypart** | A named service window (lunch, dinner). Velocity is computed per daypart. |
| **fire** | To start cooking an item. `placed → fired` is the kitchen accepting the ticket. |
