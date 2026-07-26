# 07 — Submission

> **Reconciled against the deployed app.** Every claim below was checked by visiting the route, not by
> reading the plan. An adversarial audit of the live deployment then re-checked it independently; what it
> found is recorded under *Known defects* at the bottom rather than quietly fixed.

## PS requirements checklist

| Requirement | State |
|---|---|
| Hosted application live and publicly accessible | ✅ https://brigade-flame.vercel.app |
| GitHub repository public | ✅ verified `private: false` |
| README: Team Name | ✅ |
| README: Tech Stack | ✅ incl. the Express deviation, stated |
| README: User Stories Completed | ✅ |
| README: AI Usage | ✅ no LLM in product, stated and justified |
| README: Hosted Application Link | ✅ |
| Given PPT submitted as PDF (template provided day 3) | ⬜ awaiting template |
| Meaningful commit history | ✅ 20+ commits, each stating the reasoning |

## User story compliance matrix

### US1 — Bronze · modern, intuitive interface for customers and management

| Evidence | Where | Status |
|---|---|---|
| Two deliberate densities, one token system | `docs/04-design-system.md` | ✅ ops text now genuinely 24px |
| Guest surface, mobile-first | `/menu`, `/order/[id]` | ✅ |
| Ops surface, wall-screen legible | `/ops/kds` | ✅ |
| Accessibility floor (focus, contrast, reduced-motion, 375px) | throughout | ⚠️ contrast fixed; see defects |

### US2 — Silver · authentication

| Requirement | Implementation | Status |
|---|---|---|
| Email & password with OTP | Supabase Auth, email OTP verification | ✅ `/auth/verify` — SMTP cap, see defects |
| Google OAuth | Supabase Auth provider | ✅ configured for production |
| Role-based access | 7 roles enforced in **Postgres RLS**, not UI conditionals | ✅ 43 RLS policies, 7 roles |

Role model in [03-data-model.md](03-data-model.md). The claim worth making to judges: authorization is
enforced in the database, so it can be tested by hitting the REST API directly with a guest token and
watching it refuse.

### US3 — Silver · digitized workflows

| PS example | Implementation | Status |
|---|---|---|
| Digital menu | `/menu` | ✅ |
| Live item availability | `dish_availability` view + realtime | ✅ 12s refetch + realtime accelerator |
| Smart reservations | `/reserve` + queue with quoted wait | ✅ `/reserve` — real slots from service hours, server-side capacity check |
| Order management | `place_order()` atomic RPC | ✅ race verified on live data |
| Queue management | `join_queue()` + `/ops/reservations` | ✅ quote from real turn-time medians |
| Billing | `/bill/[orderId]` → `pay_order()` | ✅ served-items-only, idempotent, simulated payment |
| Customer notifications | `notifications` table + realtime | ❌ cut — tables exist, nothing writes them |

### US4 — Gold · management dashboard

| PS example | Implementation | Status |
|---|---|---|
| Orders | `/ops/kds`, `/ops/floor` | ✅ |
| Tables | `/ops/floor` | ✅ `/ops/floor` (read-only) |
| Inventory | `/ops/inventory` | ✅ `/ops/inventory` (read-only) |
| Staff | `/ops/staff` — **cut-line item 1** | ❌ cut (cut-line 1) |
| Customers | `/orders` — a diner's own order history | ✅ `/orders`, linked from the guest header |
| Sales | `/ops/analytics` | ✅ |
| Analytics | `/ops/analytics` | ✅ Kasavana–Smith matrix |

### US5 — Platinum · intelligent operations

| PS example | Implementation | Status |
|---|---|---|
| Personalized recommendations | item-item cosine similarity, availability + allergen filtered | ⚠️ engine tested, not surfaced |
| Inventory prediction | reorder points from consumption rate × lead time, shelf-life capped | ✅ shelf-life cap included |
| Demand forecasting | EWMA velocity by weekday × daypart | ✅ EWMA on `/ops/runway` |
| Smart notifications | runway/reorder/variance triggers → `insights` | ❌ cut |
| Operational insights | Kasavana–Smith menu engineering, waste variance | ✅ matrix + food-cost band |
| AI-powered assistance | **not implemented** — deliberate, see below | n/a |

### Bonus

| Feature | Status |
|---|---|
| Predictive 86 (runway) — the core differentiator | ✅ `/ops/runway` — the differentiator |
| Demand steering | ⚠️ scarcity demotion ships; margin term dropped on the guest path |
| Waste variance from an append-only stock ledger | ⚠️ maths tested, no UI surfaced |
| Multi-tenant from the first migration | ✅ every table carries `restaurant_id`; tenant checks in `advance_item_status()` after patch 003 |

## How to describe the AI decision

Say it plainly rather than hedging. Draft for the README's AI Usage section:

> **AI usage.** Brigade's intelligence layer is deterministic statistics, not a language model:
> EWMA demand forecasting, reorder-point calculation, Kasavana–Smith menu engineering, and item-item
> collaborative filtering for recommendations. Five of the six Platinum examples in the problem
> statement are statistical problems, and the PS lists AI as optional. We chose computation over
> generation for three reasons: the numbers are auditable, the results are reproducible, and a live
> demo cannot fail on an API rate limit.
>
> AI *was* used to build the project — Claude Code wrote and reviewed code throughout, which is the
> premise of a vibe-coding hackathon. The `insights` table stores `title`/`body` per row, so a natural-
> language narration layer could be added without changing any of the underlying maths.

Also state the Express deviation, in the Tech Stack section:

> The PS suggests Node.js with Express. Brigade uses Next.js route handlers, which run on Node, so
> the app deploys as a single unit. No separate Express service.

## PPT outline

The official template arrives day 3; map content onto its slides.

| Slide | Content |
|---|---|
| Title | Brigade · team · live URL · repo |
| Problem | The menu is a promise the kitchen may not keep. The 7 PS challenges, grouped |
| Research | **Toast/Square already auto-86 — so that's table stakes.** The two gaps that remain |
| Why it matters | 4–10% inventory wasted; food cost 28–32% of revenue; 52% rank it their top challenge |
| The idea | Runway: minutes until a dish 86s. One number, four surfaces |
| Architecture | One diagram from [02-architecture.md](02-architecture.md) |
| The hard part | `place_order()` — the last-portion race, and how locking solves it |
| Demo | Guest orders → KDS docket → stock drops → runway countdown moves → 86 predicted |
| Intelligence | Menu-engineering matrix + reorder + waste variance, all deterministic |
| Rubric | The compliance matrix above |
| Honest limits | Steering is a heuristic, not an A/B-tested uplift model. No LLM, by choice |

## Demo script

Rehearse this. Two devices, two browsers, seeded data with 2–3 dishes deliberately near-86.

1. **Phone** — open the menu. Point out "6 left" on a real dish. *This number is computed from the
   pantry, not typed in by a manager.*
2. **Phone** — order that dish.
3. **Desktop, KDS** — docket appears within a second, in the right station lane.
4. **Phone** — the menu now says "5 left." Nobody touched anything.
5. **Desktop, runway board** — that dish's countdown has moved. *This is the part no POS does: it says
   when it will run out, not that it already has.*
6. **Second browser** — order the last portions, then try to order one more. Show the
   `INSUFFICIENT_STOCK` message. *Two guests can't buy the same last portion; that's enforced in a
   database transaction, not in the UI.*
7. **KDS** — fire → plated. **Phone** — the guest's tracking rail advances.
8. **Analytics** — menu-engineering matrix on six weeks of history. Name one Dog and say what you'd do.
9. Close on the thesis sentence.

Fallback if live realtime misbehaves on venue wifi: a recorded run of the same script, referenced in
the README.


---

## Known defects

An adversarial audit of the live deployment ran across five independent lenses
(security, correctness, accessibility, auth, rubric honesty). Each finding was then
given to a separate agent instructed to *refute* it, defaulting to "not real" unless
independently reproduced. **44 confirmed, 1 refuted.**

Recording them here rather than quietly fixing them, because three were cases where
this repo's own docs or commit messages claimed a guarantee that did not exist.

### Fixed

| Was claimed | What was actually true | Fix |
|---|---|---|
| "Role + station gated — a chef works their own station only" | `advance_item_status()` checked neither station NOR tenant. A host fired a grill ticket: HTTP 204 | patch 003 |
| Contrast ≥ 4.5:1 on body text | 3 of 8 tokens failed against `bg-raised` (flame 3.78:1, ash 3.29:1, subtle 3.94:1) | tokens re-solved |
| "Two densities" — KDS legible at 2 m | `font-size` on `body` resolved the GUEST token once; inherited ops text was 17.28px, not 24px | `[data-density]` sets its own size |
| Predicted 86 times are correct | `restaurants.timezone` was never read; UTC server rendered London times an hour early, and near midnight loaded the wrong day's hours | `lib/runway/clock.ts` |
| "Availability reaches the guest… counts change as other tables order" | Realtime authorises row-by-row against the subscriber's RLS, so guests got 0 events while the pill said "live" | poll-first + freshness-based pill |
| Stock only ever mutated by `place_order()`/`adjust_stock()` | A manager could `PATCH ingredients.stock_qty` via PostgREST, writing no ledger row | column REVOKE |
| Cost gated to owner/manager | Every staff role could read `cost_per_unit_cents`; no REVOKE existed | patch 003 |
| Guests see ingredient names, not quantities | `recipe_items` was `using (true)` | names-only view |
| — | `dish_binding_ingredient` leaked exact pantry stock to anonymous callers | `security_invoker` |
| — | KDS Fire buttons unreachable at 375/414px — the rail painted over them | shrinkable grid + breakpoint |

### Three more, found later, by a different method

The audit read code and probed endpoints. It never signed in as a diner and pressed
"Book". `npm run verify:features` does, and found these on its first run — which is the
argument for testing a feature the way a person uses it rather than the way it is built.

| Was claimed | What was actually true | Fix |
|---|---|---|
| "Capacity re-checked server-side" — booking works | Booking was refused for **every diner**. The route counted `tables` with the caller's session, but `tables_read` requires `is_staff()`, so a diner counted 0 tables and always got "fully booked". The `/reserve` page had the mirror fault and offered exactly the slots the API would reject | patch 005: `book_table()` + two availability views |
| The floor map shows what is free | A table with an open order still showed `open`. `pay_order()` released a paid table to `dirty`; nothing ever set `seated`. Only the seed script had written it | patch 004: trigger on `orders` |
| Runway gauges are labelled for screen readers | They were — with the *wrong sentence*. The `aria-label` said a dish "runs out about 23:14" while the screen said "enough for tonight": a prediction spoken only to blind users after it was deliberately withheld from everyone else. The suppression rule had been added to the visible branch only | `RunwayMeter` label mirrors the visible branches |

The common shape of all three: **a rule was implemented in one of two places that had to
agree**, and nothing compared them. The seed script masked the first two by writing data,
with the service key, that the product itself could not have produced.

### A third pass, and the worst finding of the build

A six-lens adversarial sweep raised 13 findings and then lost 17 of its 19 agents to an
auth error before refuting any of them — so its headline "nothing survived" meant nothing
was *tested*, not that nothing was there. Each was reproduced by hand instead. All stood.

| Was claimed | What was actually true | Fix |
|---|---|---|
| Stock is only ever mutated by `place_order()` or `adjust_stock()`; authorization lives in RLS | **Every view in `public` accepted writes from `anon`.** A chef PATCHed `ingredients_public` and moved stock 4.565 → 999 **with no ledger row**, while the same PATCH on the base table correctly returned 403. An anonymous caller inserted, updated and deleted reservations through `reservation_load` | patch 006 |
| — | `adjust_stock()`, `record_count()`, `void_order_item()` and `place_order()` had no tenant check. Another restaurant's manager moved Brigade's stock and signed the ledger entry; another restaurant's chef voided Brigade's dockets; an order at one tenant depleted another's pantry | patch 006 |
| "A chef de partie works THEIR station" | A chef PATCHed their own `profiles.station` to `saute` (204) and fired a sauté ticket. `role: 'owner'` was correctly refused — station simply wasn't in the policy | patch 006 |
| Recipe quantities are not readable outside the kitchen | `recipe_items_read` was `is_staff()` with no tenant filter: every restaurant's staff could read every other's BOM | patch 006 |
| Analytics is the intelligence layer | **Food cost printed 5.9%**, directly above the line naming the 28–32% band it compares to. PostgREST caps responses at 1000 rows and a client `.limit(20000)` cannot raise it — 1000 of 3411 order items, HTTP 200, no error. The twenty dish counts summing to exactly 1000 was the tell. Now 22.4%, which matches an independent recomputation | paging in `reports.ts` |
| — | Voiding an order's **last** item left the bill at full price, because the recompute joined a `GROUP BY` subquery that returns no rows when nothing survives. `pay_order()` would settle it | patch 006 |
| — | The pantry's "used/day" applied one daypart's rate across a hardcoded 11-hour day: prawn usage overstated 18%, chai understated 10% — under a printed formula that made it look exact | summed per service window |
| — | **Nothing in the app linked to `/cart`.** "Add to order" put a dish somewhere the diner could only reach by typing the URL. Neither shell showed who you were signed in as, and ops had no sign-out at all | cart link + `AccountBar` |

Two of those are worth stating plainly because they indict the process, not the code:

**`sql-lint` had already flagged those views**, and all five warnings were waved through as
intentional — the reasoning only ever considered whether a guest could *read* them. Views
in Postgres are auto-updatable, and Supabase grants write access on new ones by default,
so each was a way around every policy on its base table. The lint was right; the review
of it was half a review. Its message now describes both directions and names the fix.

**`verify:features` passed `/cart`** by requesting the path. Testing a URL is not testing a
journey, and the same blind spot had passed an empty host's book. It now checks that a
person could get there by tapping.

Two findings were accepted rather than fixed, and are named here instead:

- **"Seats turned" is seats at the tables used, not guests.** A four-top with two diners
  counts four. The honest fix is a `covers` column written when a party is seated — patch
  004's trigger is the hook — and deriving a guest count from furniture would be a worse
  number wearing a better name. The tiles were renamed to what they measure instead.
- **Revenue is now net of tax and tips** (`subtotal_cents`). `total_cents` was gross of 8%
  tax, and its two writers disagree about tips — `pay_order()` includes them, the seed does
  not — so the tile changed definition the moment anyone paid during a demo.

### A fourth pass: could a person find their way around?

An exploration of every route against every `href` found that **`/order/[id]` was a true
orphan** — nothing in the app linked to it. It was reached exactly once, by the redirect
that fires when an order is placed, and `CartView` calls `clearCart()` on the same line, so
the id survived nowhere but the address bar. Close the tab and a diner could no longer
reach their own order or their own bill, while the kitchen still had both on screen.

| Was claimed | What was actually true | Fix |
|---|---|---|
| Order tracking and billing are guest features | Reachable once, then never again. No history, nothing persisted, no link anywhere | `/orders` + a header link |
| — | **The auth pages had no layout at all.** `/auth/sign-in` and `/auth/verify` served ZERO links: no wordmark, no nav, no way back but the browser | `app/auth/layout.tsx` |
| — | **`/auth/sign-up` was unreachable without JavaScript.** Its only link sits in the sign-in footer, inside a Suspense boundary, so the prerendered HTML omitted it | footer added to the fallback |
| The cart recovers from an unverified email | It linked `/auth/verify` with no `?email=`, so the screen could not resend a code and claimed one had been sent. Verifying then ignored `returnTo` and dropped the diner on `/menu`, away from their full cart | both threaded |
| A failed magic link explains itself | `/auth/callback` redirects with `?error=…` and sign-in never read it, so the message was discarded and the person saw a blank form | surfaced |
| — | **Ops had zero links to the guest half.** Anyone following the one "Staff → the pass" link was inside ops for good — including a judge comparing the menu against the board | "Guest view" in the ops header |
| Guest surfaces use plain language | The menu showed diners "86" and "no limit set". That branch also returned before the `aria-label` was built, so a screen reader heard the number "86" and nothing else | `detail` now switches register; "Sold out" |
| — | Two silent dead ends: an all-voided bill rendered a disabled button, an empty list and no link; a tracking rail with no items rendered an empty `<ul>` under "In the kitchen" | both explain and link out |

And the one that was a data mistake rather than a code one: **the runway board had nothing
to count down.** The seed pinned only the dearest dishes, which are the ones that barely
sell — 4 portions of prawns at 0.15/hr lasts 27 hours, so every dish honestly reported
"enough for tonight". Runway is portions ÷ rate, and the scarce dishes were the slow ones.
The constraint now sits on the busiest dish (butter chicken, 1.74/hr) giving a predicted 86
mid-service.

That in turn exposed a real grouping bug: bands are thresholds on *minutes* (critical <45,
low <120) and service is longer than that, so a dish with 207 minutes left is banded
`plenty` while running out four hours before closing. The board grouped by band and filed it
under "enough for tonight". It now groups by `lastsThroughService`, which is the field the
engine computes for exactly that question.

### Open, and deliberately so

| Defect | Why it is acceptable for this submission |
|---|---|
| Built-in SMTP is rate-capped | Custom SMTP is the documented fix; the OTP path itself works. Google OAuth is the demo path |
| No security headers (CSP, X-Frame-Options) | Vercel defaults; no user-generated HTML is rendered |
| No password-attempt throttle | Supabase-side concern; not something this app implements |
| `notifications`/`insights` unsurfaced | Cut honestly rather than claimed — the generators are tested, nothing writes them on a schedule |
| Recommendations engine not surfaced | Tested in `lib/runway/steering.ts`; no UI shipped |
| Seeded dockets open 280+ minutes late | An artefact of seeding "live" orders at a fixed time; cosmetic, and the ages are real |
