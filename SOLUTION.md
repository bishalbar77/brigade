# Brigade — problem statements & how we solve them

**VibeAthon 6.0** · Smart Restaurant Management System · 25–27 July 2026

Standalone document. Maps every problem in the official problem statement to a concrete mechanism in
Brigade. Written to be read on its own — no other doc required.

---

## The brief, and the constraint that shaped everything

> "Build and deploy a full-stack SaaS platform that improves restaurant operations… **Rather than
> replicating existing food delivery platforms**, participants are expected to identify operational
> problems, research possible solutions, and build an innovative product."
>
> — and later: **"Do not build a clone of an existing restaurant application."**

So the first job wasn't designing. It was finding out what already exists.

### What we found, and why it changed the product

**Toast and Square already ship recipe-level ingredient depletion with automatic 86.** From Toast's own
platform documentation: when a tracked ingredient reaches zero, the POS marks dependent menu items
unavailable on the POS terminal *and* on kitchen display systems, preventing servers from selling what
the kitchen cannot make. Quantities decrement automatically as orders are sent. Shared sub-recipes
propagate cost and depletion across every dish that uses them.

This matters enormously. It means the obvious build — *"connect recipes to stock, grey out dishes that
run out"* — **is table stakes, not innovation.** It is exactly the clone the problem statement forbids.

Two gaps remain in what's actually shipped:

| Gap | Detail |
|---|---|
| **1. Availability is staff-facing only** | Toast computes the number and shows a `0` on the POS button and the KDS. The guest at the table still has to ask, and the server still walks to the kitchen to check. The number never reaches the person deciding what to order. |
| **2. Everything is reactive** | Existing systems report an item is out *after* stock hits zero. Nothing tells the kitchen at 18:00 "you'll 86 the tandoori prawns at 20:40, you have 4 left" — and nothing uses that prediction to steer demand away while there's still time to act. |

### What that reactivity costs

| Finding | Source |
|---|---|
| Restaurants waste **4–10%** of all food inventory purchased | Sculpture Hospitality, 2025 |
| Food costs run **28–32%** of total revenue | Sculpture Hospitality, 2025 |
| **52%** of operators rank food cost as their top profitability challenge — passing labour for the first time since 2019 | Sculpture Hospitality, 2025 |
| Bars lose **10–20%** of inventory monthly to overpouring, spoilage, theft | Apicbase |
| **75%** of inventory shrinkage is attributed to staff behaviour | Sculpture Hospitality, 2025 |
| Operators who automated inventory cut waste losses **~29% in six months** | Apicbase |

Reactive stock management is expensive. Prediction is where the margin is.

---

## Our answer: Brigade

**Named** after *brigade de cuisine* — Escoffier's station system, the original solution to "how does a
kitchen coordinate under pressure." The name does structural work: the brigade **is** a hierarchy of
stations, which is exactly how our kitchen display partitions tickets and exactly how our permission
model is shaped.

**Thesis:** *A printed menu is a promise the kitchen may not be able to keep.* Brigade makes the menu a
live function of the pantry, forecasts when each dish will run out, and reshapes what guests see so the
kitchen only receives orders it can actually fill — profitably.

### One mechanism: runway

Every dish carries a **runway** — minutes until it 86s at tonight's actual sell rate.

```
portions(dish)  = min over ingredients of  floor(stock / qty_per_portion)
velocity        = EWMA of units/hour for this weekday × daypart
runway(dish)    = portions / velocity × 60
predicted 86 at = now + runway
```

One number, four surfaces:

| Surface | What runway does |
|---|---|
| **Guest menu** | Shows "6 left." Near-86 dishes sink in the browse rail and gain a scarcity badge |
| **Kitchen** | The 86 board becomes a **countdown**, not an obituary: "tandoori prawns 86s ~20:40 · 4 portions" |
| **Manager** | Reorder quantities and prep lists fall out of the same velocity model |
| **Revenue** | Demand steering favours high-margin dishes with long runway — the constraint becomes a lever |

**The one-sentence differentiation:** Toast computes availability. Brigade computes *time remaining* and
acts on it.

---

## The seven challenges, solved

### 1. "Customers waiting to know whether dishes are available"

**What actually causes it.** The information exists — it's in the POS — but it's trapped on staff
screens. The guest's only interface to it is asking a human, who often has to go and check.

**How Brigade solves it.** Availability is **computed, never stored**, as a SQL view over the recipe
bill-of-materials against live stock, and it is published directly to the guest's phone with a live
subscription. Four states: plenty (no badge), low ("12 left"), critical ("4 left · ~40 min"), and 86
(struck through and labelled).

**Mechanism.** `dish_availability` view · Supabase Realtime on `restaurant:{id}:availability` ·
`/menu`

**Why it's not a stored flag:** a flag must be kept in sync by every code path that touches stock, and
one missed path means the menu lies to the guest. A view cannot drift.

---

### 2. "Limited visibility into menu items and restaurant services"

**What actually causes it.** Menus are printed artefacts. They can't carry allergens, ingredients, prep
time, or anything that changes.

**How Brigade solves it.** Each dish carries description, image, allergen tags, ingredient names, prep
time, and station. Guests filter by allergen as a **hard exclusion** — never a ranking penalty, because
ranking down an allergen is a safety bug. Ingredient *names* are shown for transparency; quantities are
not, because quantities are the recipe.

**Mechanism.** `dishes.allergens[]` / `tags[]` · `recipe_items` (names only in guest payloads) ·
`/menu`, `/menu/[dishId]`

---

### 3. "Long waiting times for tables and orders"

**What actually causes it.** Wait quotes are guesses. A host says "twenty minutes" because that's what
they always say, and the guest stands at the door because leaving means losing their place.

**How Brigade solves it.** Wait quotes come from **this restaurant's actual seated→closed durations**,
bucketed by party size, combined with how many parties are ahead needing the same table class:

```
quoted = median_turn(party_bucket) × ceil(ahead / tables_fitting) + current_dwell_remaining
```

Guests join the queue, get a **range** (never false precision), and can leave — they're notified when
their table is nearly ready. On the order side, per-item status means the guest can see food progressing
rather than wondering.

**Mechanism.** `queue_entries` · `reservations` · turn-time model over historical `orders` ·
`/reserve`, `/queue/[id]`, `/ops/reservations`

**Honest limit:** with fewer than ~10 historical turns for a party-size bucket, we fall back to a
configured default and **say so** rather than presenting a guess as data.

---

### 4. "Delayed communication between customers, staff, and kitchen"

**What actually causes it.** Three parties reading three different sources of truth — a paper docket, a
POS terminal, and a guest's memory of what they ordered.

**How Brigade solves it.** **One order object, three subscribers.** The guest, the server, and the
kitchen all watch the same rows change. There is no message-passing layer to fall out of sync, because
there are no messages — there's shared state.

Status is tracked **per item**, not per order: `placed → fired → cooking → plated → served`. An
order-level status cannot express "starter away, main still on the grill," which is the entire job of the
pass.

**Mechanism.** `order_items.status` · realtime channels `restaurant:{id}:kds` and `order:{id}` ·
`/ops/kds`, `/order/[id]`

---

### 5. "Manual order, billing, and inventory management"

**What actually causes it.** These are three ledgers maintained by hand and reconciled by hope.

**How Brigade solves it.** They become one chain of consequences. Placing an order depletes ingredient
stock inside the same database transaction; the bill is derived from what was actually served.

**The hard part — and the piece we're most pleased with.** Two guests both see "1 left" and tap order at
the same instant. Checking availability in application code and then inserting is a **race**: both
succeed, stock goes negative, and one guest gets an apology. `place_order()` is a Postgres function that:

1. gathers every ingredient the requested items imply,
2. locks those rows `FOR UPDATE ORDER BY id`,
3. re-checks availability **inside** the transaction,
4. raises a typed `INSUFFICIENT_STOCK` error, rolling back entirely, or
5. inserts the items and appends stock movements.

`ORDER BY id` isn't cosmetic — two concurrent orders with overlapping ingredients deadlock if they
acquire locks in different sequences.

Stock itself is an **append-only ledger** (`stock_movements`), with `stock_qty` as a projection of it.
Every change carries a reason (`purchase | depletion | waste | correction | count`) and an actor. There is
no "just edit the number" affordance, because that's how inventory systems become fiction.

**Mechanism.** `place_order()` · `stock_movements` ledger · `adjust_stock()` · `/cart`,
`/ops/inventory`, `/bill/[orderId]`

---

### 6. "Inefficient staff coordination"

**What actually causes it.** Everyone can see everything, so nobody knows what's theirs.

**How Brigade solves it.** The brigade hierarchy *is* the permission model — roles aren't invented, they
are the org chart a kitchen already runs:

| Role | Brigade term | Sees |
|---|---|---|
| `owner` | chef de cuisine | everything, including costs and margins |
| `manager` | sous chef | ops, inventory, analytics |
| `chef` | chef de partie | **their station's tickets only**, plus the 86 board |
| `expo` | the pass | all stations; owns plated → served |
| `server` | chef de rang | floor map, own tables, billing |
| `host` | maître d' | reservations and queue |
| `guest` | — | own orders, own bill, the menu |

Tickets are partitioned by station, so a grill cook sees grill work. Authorization is enforced in
**Postgres row-level security**, not UI conditionals — hiding a button is presentation; the database
refusing the row is security.

**Mechanism.** `app_role` enum · RLS policies on every table · station-filtered `/ops/kds`

---

### 7. "Lack of operational insights and business analytics"

**What actually causes it.** The data needed to answer "what lost money?" is spread across a POS, a
supplier invoice folder, and a spreadsheet that's three weeks stale.

**How Brigade solves it.** Four analyses, all deterministic:

| Analysis | Method | Answers |
|---|---|---|
| **Menu engineering matrix** | Kasavana–Smith: popularity × margin, quadranted on **medians** | Which dishes to protect, reprice, promote, or cut |
| **Demand forecast** | EWMA velocity by weekday × daypart | What to prep tomorrow |
| **Reorder prediction** | consumption rate × supplier lead time × 1.2, capped by shelf life | What to order, how much, by when |
| **Waste variance** | theoretical depletion (recipes × sold) vs actual ledger movement | Where stock is leaving without being sold |

Margin uses ingredient cost **as at the time of sale**, so a supplier raising a price today does not
retroactively change last month's reported profit.

**Mechanism.** `dish_velocity` · `insights` · `/ops/analytics`, `/ops/runway`

**Framing rule:** waste variance is surfaced as *"investigate this,"* never *"someone stole this."*
Over-portioning, poor prep yields, and theft are indistinguishable in this data, and the system does not
know which it is.

---

## User stories → what ships

| Level | Story | What we build |
|---|---|---|
| **Bronze** | US1 · modern, intuitive UI | Two deliberate densities on one token system: guest (phone, at-table, dim room) and ops (wall screen read at 2m, hot kitchen, no mouse). Accessibility floor: 375px, visible focus, reduced-motion, status never encoded in colour alone |
| **Silver** | US2 · authentication | Email+password (confirmation deliberately NOT required — patch 008), Google OAuth, 7 roles enforced in Postgres RLS. Staff are invite-only — a signup that could choose its own role is privilege escalation |
| **Silver** | US3 · digital workflows | Live menu, atomic order placement, per-item order tracking, reservations + walk-in queue with data-driven quotes, billing, notifications |
| **Gold** | US4 · management dashboard | KDS docket wall, floor/table map, inventory + BOM editor, sales analytics |
| **Platinum** | US5 · intelligent operations | Runway forecasting, reorder prediction, demand steering, recommendations, menu-engineering insights, threshold notifications |
| **Bonus** | — | Predictive 86, demand steering, waste variance from an append-only ledger, multi-tenant from the first migration |

### On AI: a deliberate choice

The problem statement lists **AI as optional** ("AI (Optional): Gemini API or equivalent"). Five of the
six Platinum examples — personalized recommendations, inventory prediction, demand forecasting, smart
notifications, operational insights — are **statistics, not language tasks**.

So Brigade's intelligence layer is deterministic: EWMA forecasting, reorder-point arithmetic,
Kasavana–Smith classification, and item-item cosine similarity for recommendations. No language model in
the product.

Three reasons: the numbers are **auditable**, the results are **reproducible**, and a live demo **cannot
fail on an API rate limit**.

AI *was* used to build the project — Claude Code wrote and reviewed code throughout, which is the premise
of a vibe-coding hackathon. And the seam is kept clean: every `insights` row already stores a `title` and
`body`, so a natural-language narration layer could be added without touching any of the underlying
maths.

---

## Recommendations without a language model

The recommender is worth calling out because the availability filter is what makes it different from
every "customers also bought" widget:

```
build co-occurrence matrix M[dish_a][dish_b] from order history
similarity = cosine(M[a], M[b])
candidates = top-N by summed similarity to the guest's history / current cart
    filter: portions > 0          ← never recommend what the kitchen can't make
    filter: no allergen overlap   ← hard exclusion, not a penalty
    cold start → margin × popularity
```

**A recommender that suggests an 86'd dish is worse than no recommender.** Grounding recommendations in
live availability is only possible because availability is computed rather than stored.

---

## Demand steering — turning the constraint into a lever

Knowing a dish will 86 at 20:40 is only half useful. The other half is reducing demand for it *now*.

```
steer_score = 0.30·norm(margin) + 0.25·norm(runway) − 0.30·scarcity_penalty + 0.15·affinity
```

This orders the guest browse rail. Dishes about to run out sink and gain a scarcity badge; high-margin
dishes the kitchen can comfortably deliver rise.

**Critically: this is ranking, not hiding.** A near-86 dish stays fully orderable and findable. Hiding an
available dish would be a lie, and a guest who came for the prawns must still be able to order them.
That line — between steering and manipulation — is one we've drawn deliberately.

---

## What we're not claiming

Stated up front rather than discovered under questioning:

- **Demand steering is a heuristic, not a validated uplift model.** It has not been A/B tested. Claiming a
  revenue percentage would be fabrication; claiming a mechanism is fair.
- **Weights are chosen, not learned.**
- **Six weeks of seeded history demonstrates the algorithms, not real customer behaviour.**
- **Sub-recipes (nested BOMs) are out of scope.** Toast supports them; three days doesn't.
- **Payment is simulated.** A sandbox PSP integration would prove nothing a mock doesn't, and the time is
  better spent on the differentiator.
- **The PS suggests Node + Express**; we use Next.js route handlers, which run on Node, so the app deploys
  as a single unit. The stack list is headed "Suggested."

---

## Summary

| PS challenge | Brigade's mechanism |
|---|---|
| Customers waiting to know availability | Computed availability view, published live to the guest's phone |
| Limited menu visibility | Allergens, ingredients, prep time, station; allergen filtering as hard exclusion |
| Long waits for tables and orders | Turn-time model → range quotes; leave-and-be-notified queue; per-item order progress |
| Delayed communication | One order object, three realtime subscribers; item-level status machine |
| Manual orders, billing, inventory | `place_order()` atomic transaction with row locking; append-only stock ledger; derived bills |
| Inefficient staff coordination | Brigade hierarchy as the RLS permission model; station-partitioned tickets |
| No operational insights | Menu-engineering matrix, demand forecast, reorder prediction, waste variance |

**And the thing none of them do:** predict the 86 before it happens, tell the guest, and steer demand
against it.

---

## Sources

- [Toast — menu item inventory overview](https://doc.toasttab.com/doc/platformguide/adminMenuItemInventoryOverview.html)
- [Rezku — what "86" means in a restaurant](https://rezku.com/blog/what-does-86-mean-in-a-restaurant/)
- [Sculpture Hospitality — restaurant industry statistics 2025](https://www.sculpturehospitality.com/blog/restaurant-industry-statistics-2025)
- [Apicbase — restaurant inventory statistics](https://get.apicbase.com/restaurant-inventory-statistics/)

*Detailed specs: [`docs/`](docs/README.md) · Wireframes: [`wireframes/index.html`](wireframes/index.html)
· Deploy checklist: [`DEPLOY.md`](DEPLOY.md)*
