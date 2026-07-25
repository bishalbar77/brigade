# Brigade

**A printed menu is a promise the kitchen may not be able to keep.**

Brigade makes the menu a live function of the pantry, works out how long each dish has
left at tonight's actual sell rate, and warns the kitchen *before* it runs out.

🔗 **Live:** https://brigade-flame.vercel.app

---

## Submission

| | |
|---|---|
| **Team name** | *Brigade* — solo entry |
| **Problem statement** | VibeAthon 6.0 — Smart Restaurant Management System |
| **Levels attempted** | Platinum (User Stories 1–5) + Bonus |
| **Hosted application** | https://brigade-flame.vercel.app |

### Tech stack

| Layer | Choice |
|---|---|
| Frontend + API | **Next.js 15** (App Router) + TypeScript |
| Database | **Supabase Postgres** |
| Auth | Supabase Auth — email + password with OTP, Google OAuth |
| Authorization | **Postgres Row Level Security** (not UI conditionals) |
| Realtime | Supabase Realtime + polling fallback |
| Styling | Tailwind v4 + CSS custom properties |
| Charts | Hand-rolled SVG (no chart library) |
| Deployment | Vercel + Supabase Cloud |
| Testing | Vitest — 69 unit tests on the intelligence layer |

> **On the suggested stack.** The problem statement suggests *Node.js with Express*.
> Brigade uses **Next.js route handlers**, which run on Node — so the app deploys as a
> single unit with one build and one set of env vars. There is no separate Express
> service. The stack list is headed "Suggested"; this is stated plainly rather than
> hoped past.

### AI usage

**There is no LLM in the product.** The intelligence layer is deterministic statistics:

- EWMA demand forecasting, segmented by weekday × daypart
- Reorder points from consumption rate × supplier lead time, capped by shelf life
- Kasavana–Smith menu engineering (medians, not means)
- Item-item cosine similarity for recommendations
- Waste variance from an append-only stock ledger

Five of the six Platinum examples in the problem statement are statistical problems,
and the PS lists AI as **optional**. Computation was chosen over generation because the
numbers are auditable, the results reproduce exactly, and a live demo cannot fail on an
API rate limit.

AI *was* used to build it: **Claude Code** wrote and reviewed code throughout, which is
the premise of a vibe-coding hackathon. It also ran an adversarial audit of the live
deployment across five independent lenses (security, correctness, accessibility, auth,
rubric honesty), which found 44 confirmed defects — including three of my own false
claims. Those are listed in [`docs/07-submission.md`](docs/07-submission.md) rather than
quietly fixed.

The `insights` table stores `title`/`body` per row, so a natural-language narration
layer could be added without touching any of the maths. That seam is deliberate.

---

## Why this isn't a Toast clone

The problem statement forbids cloning an existing restaurant app, so the first job was
finding out what already exists.

**Toast and Square already ship recipe-level ingredient depletion with automatic 86.**
When a tracked ingredient hits zero, the POS marks dependent items unavailable on the
terminal and the kitchen screen. So "link recipes to stock and grey out what runs out"
is **table stakes, not innovation** — building only that *is* the forbidden clone.

Two gaps remain in what's actually shipped:

1. **Availability is staff-facing.** Toast computes the number and shows a `0` on the
   POS button. The guest at the table still has to ask, and the server still walks to
   the kitchen. The number never reaches the person choosing what to order.
2. **Everything is reactive.** Existing systems report an item is out *after* stock
   hits zero. Nothing tells the kitchen at 18:00 "you'll 86 the sea bass at 19:25, you
   have 4 portions left" — and nothing uses that prediction to steer demand while there
   is still time to act.

### The mechanism: runway

Every dish carries a **runway** — minutes until it 86s at tonight's real sell rate.

```
portions(dish)  = min over ingredients of floor(stock / qty_per_portion)
velocity        = EWMA of units/hour for this weekday × daypart
runway(dish)    = portions / velocity × 60
```

One number, four surfaces:

| Surface | What runway does there |
|---|---|
| **Guest menu** | "4 left · 86s ~19:25". Near-86 dishes sink in the rail and get badged |
| **Kitchen** | The 86 board is a **countdown**, not an obituary — and names the binding ingredient |
| **Manager** | Reorder quantities and prep lists fall out of the same velocity model |
| **Revenue** | Demand steering favours high-margin dishes with long runway |

**Toast computes availability. Brigade computes time remaining, and acts on it.**

---

## User stories

| Level | Story | Where it lives |
|---|---|---|
| **Bronze** | US1 · modern, intuitive UI | Two deliberate densities on one token system — guest phone vs KDS wall screen |
| **Silver** | US2 · auth | `/auth/*` — email+password+OTP, Google OAuth, 7 roles in RLS |
| **Silver** | US3 · digital workflows | `/menu` `/cart` `/order/[id]` `/bill/[id]` `/reserve` |
| **Gold** | US4 · management dashboard | `/ops/kds` `/ops/floor` `/ops/inventory` `/ops/menu` `/ops/analytics` |
| **Platinum** | US5 · intelligent operations | `/ops/runway` + the forecasting, reorder and steering engine |
| **Bonus** | — | Predictive 86, demand steering, waste variance, multi-tenant from migration 001 |

Per-feature detail, including what is **read-only** and what is **cut**, is in
[`docs/features/`](docs/features/). Honest status is the point: a docs tree that claims
more than the deployed app is worse than no docs.

---

## The engineering worth looking at

**`place_order()` — the last-portion race.** Two guests both see "1 left" and tap at
the same instant. A read-then-write in application code lets both succeed and drives
stock negative. The function locks the affected ingredient rows `FOR UPDATE ORDER BY
id` — the ordering matters, or two concurrent orders with overlapping ingredients
deadlock — re-checks availability *inside* the transaction, and raises a typed
`INSUFFICIENT_STOCK` that the cart turns into a recovery rather than an apology.
Demand is aggregated **per ingredient across the whole order**, because two different
dishes sharing the last three lemons would each pass an independent check and
collectively oversell.

Verified on live data: forced to exactly 1 portion, two concurrent calls → one 200, one
`INSUFFICIENT_STOCK`, stock landed at 0 and never negative.

**Availability is a view, never a column.** There is no `is_available` anywhere. A
stored flag must be kept in sync by every code path that touches stock, and one missed
path means the menu lies to a guest. A view cannot drift.

**Stock is an append-only ledger.** `ingredients.stock_qty` is a projection of
`stock_movements`. That's what makes waste variance computable and gives an audit trail
for free. `npm run verify:data` reconciles the two and fails if they disagree.

**Authorization is in the database.** 43 RLS policies. The claim is testable: sign in as
a guest and hit the REST API directly — `ingredients` returns `[]`, another guest's
orders return `[]`, and cost never appears in any guest payload.

---

## Running it

```bash
npm install
cp .env.example .env.local        # fill from the Supabase dashboard
npm run sql:bundle                # → supabase/apply_all.sql, paste in the SQL editor
npm run seed                      # 6 weeks of plausible history
npm run dev
```

```bash
npm test              # 69 unit tests, no database needed
npm run verify:data   # 11 checks against the live database
```

Full setup, deploy and troubleshooting: [`docs/08-runbook.md`](docs/08-runbook.md) and
[`DEPLOY.md`](DEPLOY.md).

### Demo logins

Password for all: `brigade-demo-2026`

| Email | Role | Lands on |
|---|---|---|
| `owner@brigade.test` | chef de cuisine | `/ops/analytics` |
| `manager@brigade.test` | sous chef | `/ops/inventory` |
| `grill@brigade.test` | chef de partie | `/ops/kds?station=grill` |
| `expo@brigade.test` | the pass | `/ops/kds` |
| `server@brigade.test` | chef de rang | `/ops/floor` |
| `host@brigade.test` | maître d' | `/ops/reservations` |
| `priya@brigade.test` | guest | `/menu` |

---

## Documentation

| Doc | What's in it |
|---|---|
| [`SOLUTION.md`](SOLUTION.md) | Every PS challenge → the mechanism that addresses it |
| [`docs/01-overview.md`](docs/01-overview.md) | Research, thesis, personas |
| [`docs/02-architecture.md`](docs/02-architecture.md) | Stack and 7 decision records |
| [`docs/03-data-model.md`](docs/03-data-model.md) | Schema, RLS, `place_order()` |
| [`docs/04-design-system.md`](docs/04-design-system.md) | Tokens with measured contrast ratios |
| [`docs/05-runway-engine.md`](docs/05-runway-engine.md) | All the maths |
| [`docs/07-submission.md`](docs/07-submission.md) | Compliance matrix + known defects |
| [`wireframes/index.html`](wireframes/index.html) | 15 greybox screens, built before the UI |

---

## What this doesn't do

Stated up front rather than discovered under questioning:

- **Demand steering is a heuristic, not a validated uplift model.** Not A/B tested.
  Claiming a revenue figure would be fabrication; claiming a mechanism is fair.
- **Payment is simulated.** A sandbox PSP proves nothing a mock doesn't.
- **Sub-recipes (nested BOMs) are out of scope.** Toast supports them; three days
  didn't.
- **Six weeks of seeded history** demonstrates the algorithms, not real customer
  behaviour.
- **Recipe editing, staff management and split billing are cut**, with the reasoning in
  each feature doc.

---

*Sources for the research claims: [Toast platform docs](https://doc.toasttab.com/doc/platformguide/adminMenuItemInventoryOverview.html) ·
[Sculpture Hospitality 2025](https://www.sculpturehospitality.com/blog/restaurant-industry-statistics-2025) ·
[Apicbase](https://get.apicbase.com/restaurant-inventory-statistics/)*
