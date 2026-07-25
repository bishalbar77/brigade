# 07 — Submission

> **Reconcile this file against the deployed app on day 3.** Every `—` below becomes either a route or
> the word `cut`. A compliance matrix that overclaims is worse than none.

## PS requirements checklist

| Requirement | State |
|---|---|
| Hosted application live and publicly accessible | ☐ |
| GitHub repository public | ☐ |
| README: Team Name | ☐ |
| README: Tech Stack | ☐ |
| README: User Stories Completed | ☐ |
| README: AI Usage | ☐ |
| README: Hosted Application Link | ☐ |
| Given PPT submitted as PDF (template provided day 3) | ☐ |
| Meaningful commit history | ☐ |

## User story compliance matrix

### US1 — Bronze · modern, intuitive interface for customers and management

| Evidence | Where | Status |
|---|---|---|
| Two deliberate densities, one token system | `docs/04-design-system.md` | — |
| Guest surface, mobile-first | `/menu`, `/order/[id]` | — |
| Ops surface, wall-screen legible | `/ops/kds` | — |
| Accessibility floor (focus, contrast, reduced-motion, 375px) | throughout | — |

### US2 — Silver · authentication

| Requirement | Implementation | Status |
|---|---|---|
| Email & password with OTP | Supabase Auth, email OTP verification | — |
| Google OAuth | Supabase Auth provider | — |
| Role-based access | 7 roles enforced in **Postgres RLS**, not UI conditionals | — |

Role model in [03-data-model.md](03-data-model.md). The claim worth making to judges: authorization is
enforced in the database, so it can be tested by hitting the REST API directly with a guest token and
watching it refuse.

### US3 — Silver · digitized workflows

| PS example | Implementation | Status |
|---|---|---|
| Digital menu | `/menu` | — |
| Live item availability | `dish_availability` view + realtime | — |
| Smart reservations | `/reserve` + queue with quoted wait | — |
| Order management | `place_order()` atomic RPC | — |
| Queue management | `/ops/floor`, host surface | — |
| Billing | `/bill/[orderId]` | — |
| Customer notifications | `notifications` table + realtime | — |

### US4 — Gold · management dashboard

| PS example | Implementation | Status |
|---|---|---|
| Orders | `/ops/kds`, `/ops/floor` | — |
| Tables | `/ops/floor` | — |
| Inventory | `/ops/inventory` | — |
| Staff | `/ops/staff` — **cut-line item 1** | — |
| Customers | guest history in analytics | — |
| Sales | `/ops/analytics` | — |
| Analytics | `/ops/analytics` | — |

### US5 — Platinum · intelligent operations

| PS example | Implementation | Status |
|---|---|---|
| Personalized recommendations | item-item cosine similarity, availability + allergen filtered | — |
| Inventory prediction | reorder points from consumption rate × lead time, shelf-life capped | — |
| Demand forecasting | EWMA velocity by weekday × daypart | — |
| Smart notifications | runway/reorder/variance triggers → `insights` | — |
| Operational insights | Kasavana–Smith menu engineering, waste variance | — |
| AI-powered assistance | **not implemented** — deliberate, see below | n/a |

### Bonus

| Feature | Status |
|---|---|
| Predictive 86 (runway) — the core differentiator | — |
| Demand steering | — |
| Waste variance from an append-only stock ledger | — |
| Multi-tenant from the first migration | — |

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
