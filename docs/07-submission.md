# 07 — Submission

> **Reconciled against the deployed app.** Every claim below was checked by visiting the route, not by
> reading the plan. An adversarial audit of the live deployment then re-checked it independently; what it
> found is recorded under *Known defects* at the bottom rather than quietly fixed.

## PS requirements checklist

| Requirement | State |
|---|---|
| Hosted application live and publicly accessible | ✅ https://brigade-flame.vercel.app |
| GitHub repository public | ⬜ push pending |
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
| Smart reservations | `/reserve` + queue with quoted wait | ✅ `/reserve` (read-only admin) |
| Order management | `place_order()` atomic RPC | ✅ race verified on live data |
| Queue management | `/ops/floor`, host surface | ✅ `/ops/reservations` (read-only) |
| Billing | `/bill/[orderId]` | ✅ simulated payment |
| Customer notifications | `notifications` table + realtime | ❌ cut — tables exist, nothing writes them |

### US4 — Gold · management dashboard

| PS example | Implementation | Status |
|---|---|---|
| Orders | `/ops/kds`, `/ops/floor` | ✅ |
| Tables | `/ops/floor` | ✅ `/ops/floor` (read-only) |
| Inventory | `/ops/inventory` | ✅ `/ops/inventory` (read-only) |
| Staff | `/ops/staff` — **cut-line item 1** | ❌ cut (cut-line 1) |
| Customers | guest history in analytics | ⚠️ order history only |
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

### Open, and deliberately so

| Defect | Why it is acceptable for this submission |
|---|---|
| Built-in SMTP is rate-capped | Custom SMTP is the documented fix; the OTP path itself works. Google OAuth is the demo path |
| No security headers (CSP, X-Frame-Options) | Vercel defaults; no user-generated HTML is rendered |
| No password-attempt throttle | Supabase-side concern; not something this app implements |
| `notifications`/`insights` unsurfaced | Cut honestly rather than claimed — the generators are tested, nothing writes them on a schedule |
| Recommendations engine not surfaced | Tested in `lib/runway/steering.ts`; no UI shipped |
| Seeded dockets open 280+ minutes late | An artefact of seeding "live" orders at a fixed time; cosmetic, and the ages are real |
