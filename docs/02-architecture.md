# 02 — Architecture

## Stack

| Layer | Choice |
|---|---|
| Frontend + API | Next.js 15 (App Router) + TypeScript; route handlers for the API |
| Database | Supabase Postgres |
| Auth | Supabase Auth — email+password with OTP verification, Google OAuth |
| Authorization | Postgres Row Level Security |
| Realtime | Supabase Realtime (Postgres changes + broadcast) |
| Styling | Tailwind CSS v4 + CSS custom properties for tokens |
| Motion | `motion` (Framer Motion) |
| Charts | Recharts |
| Deploy | Vercel (app) + Supabase Cloud (data) |

## Topology

```
                    ┌───────────────────────────────┐
   guest phone ────▶ │                               │
   KDS wall screen ─▶│   Next.js 15 on Vercel        │
   manager desktop ─▶│   ├─ RSC / client components  │
                    │   └─ route handlers (/api)    │
                    └───────────┬───────────────────┘
                                │ supabase-js
                    ┌───────────▼───────────────────┐
                    │   Supabase                    │
                    │   ├─ Postgres + RLS           │
                    │   ├─ Auth (OTP, Google OAuth) │
                    │   ├─ Realtime                 │
                    │   └─ Storage (dish images)    │
                    └───────────────────────────────┘
```

Two distinct read paths, deliberately:

- **Reads that must be fresh** (guest menu availability, KDS tickets, floor map) go through the
  browser client with a Realtime subscription. No polling.
- **Reads that must be trusted** (anything involving cost, margin, or another tenant's data) go
  through a route handler with the user's session, so RLS applies server-side too.

Writes that must be atomic (`place_order`) go to a Postgres function via RPC, never to the table API.
See [05-runway-engine.md](05-runway-engine.md) and [features/ordering.md](features/ordering.md).

## Realtime channels

| Channel | Payload | Subscribed by |
|---|---|---|
| `restaurant:{id}:kds` | `order_items` inserts + status updates | KDS, expo |
| `restaurant:{id}:floor` | `tables`, `orders` | Floor map, host |
| `restaurant:{id}:availability` | recomputed `dish_availability` rows | Guest menus, runway board |
| `order:{id}` | one order's item statuses | That guest's tracking screen |

One channel per surface, unsubscribed on unmount — free-tier connection limits are real.

## Decision records

### ADR-1 — Next.js route handlers instead of a separate Express service

The PS *suggests* "Backend: Node.js with Express.js." Brigade uses Next.js route handlers instead.

**Why:** Next.js route handlers *are* Node. A single deployable means one repo, one build, one
`vercel deploy`, one set of env vars, and no CORS or session-forwarding work. Solo across three days
cannot afford to operate two services, and the PS heading is "**Suggested** Technical Stack."

**Cost:** a judge scanning for the literal word "Express" won't find it. Mitigated by stating this
explicitly in the README rather than hoping it isn't noticed.

### ADR-2 — Supabase rather than self-managed Postgres + Passport

User Story 2 asks for email+password **with OTP**, **Google OAuth**, and role-based access. Supabase
Auth provides the first two as configuration, and RLS lets the third be enforced in the database
rather than in UI conditionals. Realtime removes the need to write and host a WebSocket server.

**Cost:** vendor coupling, and the built-in SMTP has a low hourly cap that will throttle OTP during a
demo. See the risk register in [06-roadmap.md](06-roadmap.md).

### ADR-3 — Authorization in RLS, not in application code

Every table has RLS enabled and policies keyed on `auth.uid()` → `profiles.role` +
`profiles.restaurant_id`. Application code never decides whether a read is allowed.

**Why:** it's multi-tenant. A missed `where restaurant_id = ?` in application code is a cross-tenant
data leak; the same mistake with RLS on returns zero rows. It also makes the security claim testable —
you can hit the REST endpoint directly with a guest JWT and watch it refuse.

### ADR-4 — Availability is a derived view, never a stored flag

`dish_availability` is a SQL view computing portions from the recipe BOM against live stock. There is
no `is_available` column anywhere.

**Why:** a stored flag has to be kept in sync by every code path that touches stock, and one missed
path means the menu lies. A view cannot drift. Cost: recomputed per query, which is irrelevant at
this data size.

### ADR-5 — Stock as an append-only ledger with a projected balance

`stock_movements` is immutable and append-only; `ingredients.stock_qty` is a projection of it.

**Why:** waste variance (theoretical depletion vs actual counts) is only computable if history is
preserved, and it's the Bonus feature. It also gives an audit trail for free, which is where the 75%-
of-shrinkage-is-staff finding from [01-overview.md](01-overview.md) becomes actionable.

**Cost:** two writes per depletion instead of one, and the projection can drift from the ledger if a
write path forgets. Mitigated by only ever mutating stock inside `place_order()` or an explicit
adjustment function — never a bare `UPDATE`.

### ADR-6 — Item-level status, not order-level

`order_items.status` carries the lifecycle, not just `orders.status`.

**Why:** dishes at one table finish at different times. Real kitchen display systems track the item;
an order-level status can't express "starter away, main still on grill," which is the entire job of
the pass.

### ADR-7 — No LLM

The intelligence layer is deterministic statistics: EWMA velocity, reorder points, Kasavana-Smith menu
engineering, item-item cosine similarity.

**Why:** five of the six Platinum examples (recommendations, inventory prediction, demand forecasting,
smart notifications, operational insights) are statistics, not language tasks. The PS marks AI
**Optional**. A live demo that cannot fail on a rate limit, a cold start, or a billing issue is worth
more than a narration layer.

**Cost:** forfeits the "AI-powered assistance" bullet. The README's AI Usage section says so plainly.
The seam is kept clean — every insight has a `title`/`body` already, so a narration layer could be
added later without touching the math.

## Repository layout

```
app/
  (guest)/                 menu, dish, cart, order tracking, reserve, bill
  (ops)/                   kds, floor, runway, inventory, menu-admin, analytics
  api/                     route handlers
components/
  ui/                      primitives shared across both densities
  guest/  ops/             density-specific components
lib/
  supabase/                client, server, middleware clients
  runway/                  availability, velocity, forecast, steering  ← pure functions, testable
  money.ts                 integer-cents helpers
supabase/
  migrations/              ordered SQL
  seed/                    6 weeks of history generator
docs/                      this tree
wireframes/                greybox HTML
```

`lib/runway/` holds pure functions with no Supabase imports so the maths can be tested without a
database. That is deliberate — it's the part most worth testing and the part most likely to be wrong.
