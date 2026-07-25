# Brigade — UI layer design

**Date:** 2026-07-25 · **Deadline:** 2026-07-27 · **Solo**

Scope: the UI/UX layer only. The product concept, schema, authorization and intelligence layer are
settled and built — see [SOLUTION.md](../../../SOLUTION.md), [docs/01-overview.md](../../01-overview.md),
[docs/03-data-model.md](../../03-data-model.md), [docs/05-runway-engine.md](../../05-runway-engine.md).

**Starting state.** Backend complete and verified against live Supabase: 12 migrations applied, 43 RLS
policies, `place_order()` with row locking, `lib/runway/` with 61 passing unit tests, six weeks of
seeded history (1077 orders / 5286 items). `npm run verify:data` passes 11/11. `app/` contains three
placeholder files and a token-name scaffold in `globals.css`.

**Not in scope.** Palette and typography. Those are `frontend-design`'s free axes; pre-deciding them
here would waste that skill's process. The only constraint carried forward: don't spend a free axis on
the three known AI-design defaults, listed in [04-design-system.md](../../04-design-system.md).

---

## Decisions

Four decisions were taken during brainstorming. Each records the alternative rejected, because the
reasoning matters more than the choice if circumstances change.

### D1 — Spine deep, breadth read-only

Fifteen screens costed at ~30+ hours against ~16–20 realistic solo hours. Rather than thin everything,
the demo path is built to full interaction and the remaining ops screens are built **read-only**:
populated with real seeded data, no forms, no mutation. Read-only costs roughly 30% of full CRUD, so
every US4 bullet gets a genuine populated screen while the differentiator keeps its budget.

**"Read-only" means precisely: no writes originate from this screen.** It does *not* mean static —
read-only screens still hold a realtime subscription and update live, because that costs nothing extra
once the hook exists. They have no forms, no validation, no optimistic updates, and no destructive
actions.

*Rejected:* spine-only (leaves US4's Tables and Inventory bullets with no screen at all) and uniform
breadth (nothing finished; the runway board — the entire differentiation claim — gets no more care
than a staff list).

### D2 — Ordering requires an account; browsing does not

`place_order()` already requires an authenticated user with a confirmed email, and `guest_id` is what
lets RLS scope "your own orders". Browsing the menu stays fully public, so **availability reaches a
guest with no account at all** — the differentiator is visible before any friction. The gate sits at
"add to order".

*Rejected:* anonymous sign-in. It is truer to how QR ordering works and lower friction, but it needs
`place_order()`'s email check special-cased and its RLS re-verified — real risk on day 2 of 3 against
a backend that is currently green. Also rejected: server-taken orders, which removes guest
self-ordering and therefore half the thesis.

### D3 — KDS carries a runway rail; the board is separate and deeper

The kitchen screen shows dockets **and** a persistent runway rail, so a cook sees what is cooking and
what is about to run out in one glance with no navigation. The manager gets a separate full-depth board
with sell rates, binding ingredients and stock actions.

*Rejected:* one combined screen (a cook reading at 2 m and a manager reading dense numbers at 60 cm
have genuinely conflicting needs; the compromise serves neither) and fully separate screens (a cook
would have to leave the ticket wall to learn something is about to 86 — exactly when they won't — and
the demo would need a tab-switch at its key moment).

### D4 — Live changes are visible, but never mutate what the guest is touching

When another table's order drops a count, that dish's number animates briefly then rests. A silent
change reads as a static page, and this is the demo moment. But a dish already in the cart or open on
the detail screen never mutates underneath: it shows an inline notice instead, so a tap never lands on
a stale button. `prefers-reduced-motion` drops the animation, not the update.

*Rejected:* silent updates (make the most impressive behaviour in the product invisible) and
refresh-on-interaction (forfeits the live claim, weakening "availability reaches the guest" to
"eventually reaches").

---

## Route architecture

Two route groups. The density split is structural, not cosmetic — see
[docs/04-design-system.md](../../04-design-system.md).

```
app/
  (guest)/                     data-density="guest"   phone-first, public where possible
    page                       landing — live "what's on" strip
    t/[label]/route            QR entry → sets table cookie → redirect /menu
    menu                       live menu, steer-ordered within category
    menu/[dishId]              dish detail + pairings
    cart                       pre-validation + place order
    order/[id]                 per-item tracking rail
    bill/[orderId]             served items, totals, simulated payment
    reserve                    booking + walk-in queue join
  (ops)/                       data-density="ops"     role-guarded in layout
    kds                        dockets + runway rail        ← wall screen, no mouse
    runway                     deep board + stock adjust    ← manager, only write path in ops
    floor                      read-only table map
    inventory                  read-only + reorder suggestions
    menu                       read-only dish list + BOM view (cost, margin, binding)
    reservations               read-only bookings + queue
    analytics                  menu-engineering matrix + service summary
  auth/
    sign-in · sign-up · verify · callback
  api/
    orders                     POST → place_order RPC
    order-items/[id]/status    PATCH → advance_item_status RPC
    inventory/adjust           POST → adjust_stock RPC (manager only)
```

**QR entry.** `/t/T7` sets a `brigade_table` cookie and redirects to `/menu`, keeping `?table=` out of
every subsequent URL. When no cookie is present the menu shows a table picker — which is also the
demo-friendly path, since scanning a physical QR mid-presentation is awkward.

## Screen inventory and depth

| Screen | US | Depth | Notes |
|---|---|---|---|
| Landing | 1 | deep | Hero proves the product with a live figure, not a claim |
| Sign in / up / verify / callback | 2 | deep | OTP + Google, role-based landing |
| Menu | 3 | deep | Runway badges, steer ordering, allergen filter |
| Dish detail | 3 | deep | `RunwayMeter`, allergens, ingredient names, pairings |
| Cart | 3 | deep | Pre-validation, `INSUFFICIENT_STOCK` recovery |
| Order tracking | 3 | deep | Per-item rail, live |
| Bill | 3 | deep | Served items only, simulated payment |
| Reserve / queue | 3 | deep | Range quotes from real turn times |
| **KDS + runway rail** | 4 | deep | **Never cut.** Station lanes, ticket age, tap-only |
| **Runway board** | 5 | deep | **Never cut.** The differentiation claim |
| Analytics | 4+5 | deep | Kasavana–Smith matrix + service summary |
| Floor map | 4 | **read-only** | Real table states, no seating actions |
| Inventory list | 4 | **read-only** | Real stock + reorder suggestions; adjustment lives on the runway board (see below) |
| Reservations admin | 3+4 | **read-only** | Real bookings + queue, no seating |
| Recipe / BOM view | 4 | **read-only** | Per-dish BOM with cost, margin, portions and binding ingredient. Read-only, not cut — see below |
| Staff | 4 | **cut** | Cut-line 1; seeded accounts + documented SQL |
| Split billing | 3 | **cut** | Cut-line 2 |
| Supplier ordering | 5 | **cut** | Cut-line 3 |
| Waste variance UI | — | **cut** | Cut-line 4; maths exists and is tested |
| Modifiers UI | 3 | **cut** | Cut-line 5; schema supports it |

**Two reconciliations against existing feature docs**, found in spec self-review:

*[features/recipes.md](../../features/recipes.md) says the BOM editor is "not cuttable — without it the
differentiator can't be configured or demoed."* That is right about the mechanism and wrong about the
editor. Seeded data already carries BOMs, so availability is fully demoable without any editing UI —
but the *explanatory* value is real: showing that this dish needs 1 bass + 0.5 lemon, and that bass is
what binds it to 4 portions, is the clearest 15 seconds available for explaining the whole product. So
a **read-only BOM view** ships, and only the editing form is cut. Recipes remain configurable by SQL.

*[features/inventory.md](../../features/inventory.md) says "the ledger, adjustments and reorder
suggestions stay" because US4 names Inventory.* Kept, but relocated: **stock adjustment lives on the
runway board**, not the inventory list. You adjust stock at the moment you notice the shortage, which
is exactly where the board already tells you about it — and it keeps a write path on the never-cut
screen rather than a read-only one. The inventory list stays read-only.

Each feature doc's `Status:` field is updated to `built`, `built (read-only)` or `cut` on day 3, and
[docs/07-submission.md](../../07-submission.md) reconciled against what actually deployed. A docs tree
claiming more than the app is worse than no docs.

## Data flow

Server components render first paint; client components subscribe and patch. Mutations go through
route handlers to Postgres functions, never direct table writes — the availability check and the write
must share a transaction.

| Surface | First paint | Live channel |
|---|---|---|
| Menu | RSC from `menu_public` | `restaurant:{id}:availability` → patch counts in place |
| Dish detail | RSC | `availability` → inline notice, never silent mutation (D4) |
| Order tracking | RSC | `order:{id}` |
| KDS + rail | RSC | `restaurant:{id}:kds` + `availability` |
| Runway board | RSC | `availability` |
| Floor / reservations | RSC | `restaurant:{id}:floor` |
| Analytics | RSC only | **none** — a matrix that reshuffles while being read is worse, not better |

Three hooks own all subscriptions: `useAvailability`, `useKds`, `useOrder`. One channel per surface,
unsubscribed on unmount — free-tier connection limits are real and a leak on navigation kills realtime
for every client.

Reads that touch cost or margin go through a route handler with the user's session so RLS applies
server-side too. Guest surfaces read `menu_public`; non-manager staff surfaces read
`ingredients_public`. Neither exposes `cost_per_unit_cents`.

## Components

```
components/
  ui/                    primitives shared across both densities
  runway/RunwayMeter     the signature element — one component, two densities
  guest/                 MenuCard, DishHeader, CartLine, TrackingRail, BillLines
  ops/                   Docket, StationLane, RunwayRail, RunwayRow, TicketAge
```

`RunwayMeter` takes a `RunwayResult` straight from `lib/runway` and appears on the dish detail, the KDS
rail and the board. It animates on change then rests — a permanently moving element in a kitchen is
noise. Under `prefers-reduced-motion` it renders a plain number and label.

Status is never encoded in colour alone. Every runway state carries at least two of colour, glyph,
text label, position: a line cook reads the KDS through glare on a grease-filmed screen, and a
mis-read ticket state wastes a plate.

## Error handling

| Case | Behaviour |
|---|---|
| `INSUFFICIENT_STOCK` | `detail = "dish\|portions"` parsed into a typed 409; cart offers "reduce to N" / "remove" / "see similar". Names the dish and the real remaining count — never a generic failure |
| Cart holds a now-scarce item | Pre-validated on mount and before submit, so the 409 is reserved for a genuine race — which is still handled, because that race is real |
| `EMAIL_NOT_VERIFIED` | Routes to `/auth/verify` with a working resend, not a dead end |
| Illegal KDS transition | 409 from `advance_item_status`; button reflects only legal next states |
| Realtime drop | Refetch on reconnect **and** on tab focus. A KDS showing stale tickets is dangerous |
| Outside service hours | Portions shown, countdown suppressed. A board predicting an 86 at 04:00 destroys trust in every other number |
| Thin velocity history | "Not enough history" rather than a fabricated time |
| Empty states | Designed, never a bare spinner or blank panel |

## Build order

Each step is independently demoable, so a slip costs breadth rather than the demo.

| # | Work | Rationale |
|---|---|---|
| 1 | `frontend-design` → tokens, both shells | Everything downstream derives from it |
| 2 | Guest menu + runway badges | Public, needs no auth — demoable immediately |
| 3 | KDS + rail + runway board | The never-cut pair; works off the 3 seeded live orders |
| — | **Deploy checkpoint** | Vercel live + **production** OAuth callback configured |
| 4 | Auth: OTP, Google, role routing | Gates ordering |
| 5 | Cart → place order → tracking → bill | Closes the guest loop |
| 6 | Read-only floor / inventory / reservations | US4 breadth at ~30% the cost |
| 7 | Analytics matrix + summary | Most credible Gold artifact |
| 8 | Feature-doc reconciliation, README, PPT, final deploy | Last 3 hours; no new features |

Deploying at step 3 rather than at the end is deliberate: Vercel surfaces build failures that never
appear in `npm run dev` — server/client boundary violations, missing env vars, RSC misuse — and the
production OAuth callback is the classic Sunday-night discovery.

## Testing

`lib/runway` has 61 unit tests. Adding, in the same style:

- cart reducer — add, increment past availability, remove, persistence across reload
- `INSUFFICIENT_STOCK` detail parsing, including a dish name containing a `|`
- band → UI mapping, so a `critical` band can never render as `plenty`

Everything else is the manual checklist in [docs/08-runbook.md](../../08-runbook.md), run against the
**deployed** URL on a **phone**, plus `npm run verify:data` after any reseed.

The concurrency test stays the headline: two browsers race the last portion, exactly one wins, the
loser gets a useful message, and the stock reconciliation query returns zero rows afterwards.

## Risks specific to this phase

| Risk | Mitigation |
|---|---|
| Design system takes longer than budgeted and squeezes screens | Token *names* already exist in `globals.css`; `frontend-design` fills values, so components can be written against them in parallel |
| Realtime subscription leak kills the demo | One channel per surface, cleanup in effect teardown; verify by navigating 20× and watching the Supabase dashboard |
| Read-only screens read as unfinished | Each states its scope in-page rather than implying a broken button; feature docs say `built (read-only)` |
| Guest auth friction stalls the demo | Demo signs in as seeded `priya@brigade.test`; fresh signup+OTP demonstrated separately so the rate-capped SMTP is never on the critical path |
| Build failures found late | Deploy checkpoint at step 3 |
