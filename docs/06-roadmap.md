# 06 — Roadmap, cut line, risks

Solo. Three days. 25–27 July 2026. Live state is in [`PROGRESS.md`](../PROGRESS.md) — this file is the
plan, that file is the truth.

## Day 1 — docs, design, foundation

1. `PROGRESS.md` ✔, then this docs tree
2. Greybox wireframes → `superpowers:brainstorm` → `frontend-design`
3. `git init`, **public** GitHub repo, first commit
4. Next.js 15 + TS + Tailwind v4 scaffold
5. Supabase project; migrations 001–011; RLS for all 7 roles
6. `dish_availability` view, `place_order()` function
7. Seed script — 6 weeks of history
8. Auth end to end: email+password+OTP **and** Google OAuth, prod callback configured
9. **Deploy #1 green before sleeping**

## Day 2 — the core loop

The guest→kitchen→guest circuit, which is the demo.

1. Live menu with runway badges
2. Cart + `place_order` RPC + the `INSUFFICIENT_STOCK` path
3. Guest order tracking, realtime
4. KDS docket wall — station lanes, item status, ticket age
5. Floor / table map
6. Reservations + walk-in queue with quoted wait
7. Billing
8. **Deploy #2 green**

## Day 3 — management, intelligence, ship

1. Manager dashboard
2. Inventory + recipe editor
3. **Runway board** — the signature screen
4. Analytics: sales, menu-engineering matrix, forecast (`dataviz` skill first)
5. Velocity / reorder / steering / notifications
6. Flip every feature doc `Status:` to `built` or `cut`; reconcile `07-submission.md`
7. README, PPT → PDF, demo recording
8. **Final deploy, verified from a phone on cellular** — not just localhost, not just desktop

**Reserve the last 3 hours for submission only.** No new features in that window.

## Cut line

Ordered. If behind, cut from the top and record it in `PROGRESS.md` → *Cut so far*.

1. Staff / shift management
2. Split billing
3. Supplier auto-ordering
4. Waste variance
5. Dish modifiers

**Never cut:** the KDS or the runway board. They are what the demo is *of* — everything else is
supporting cast. Also never cut: auth (it's a whole user story), or the seed script (without it the
intelligence layer has nothing to compute on).

## Risks

| # | Risk | Why it bites | Mitigation |
|---|---|---|---|
| 1 | **Supabase built-in SMTP is rate-capped** | Low hourly limit. OTP silently stops sending mid-demo, and it looks like the auth is broken | Test the cap on day 1. Either wire custom SMTP (Resend) or make Google OAuth the primary demo path with OTP shown separately and documented |
| 2 | **Google OAuth redirect URI mismatch in production** | Works on localhost, 400s on the deployed domain. Classic Sunday-night discovery | Configure the prod callback on day 1, immediately after deploy #1 |
| 3 | Analytics look fake | 3 days of real data means empty charts and a forecast with no signal | 6-week seed script, treated as core (see [03-data-model.md](03-data-model.md)) |
| 4 | Scope creep at Platinum | Five shallow AI-ish features that each half-work | Platinum is *one* mechanism — runway. Cut line pre-agreed above |
| 5 | Realtime connection limits on free tier | Subscriptions leak on navigation, hit the cap, realtime dies | One channel per surface, unsubscribed on unmount. Verify by navigating 20× and watching the dashboard |
| 6 | First deploy left to Sunday | Build-time failures on Vercel that never appear locally (env vars, server/client boundaries, RSC) | Deploy at the end of day 1 and day 2 |
| 7 | RLS locks *you* out | Policies written late, then everything returns zero rows and it looks like the data layer is broken | Write policies with the tables (migration 010), and seed via service role which bypasses RLS |
| 8 | Stock projection drifts from the ledger | `stock_qty` and `stock_movements` disagree; every number downstream is wrong | Only ever mutate stock inside `place_order()` or `adjust_stock()`. Never a bare `UPDATE`. Add a reconciliation query to the runbook |
| 9 | Solo fatigue on day 3 | The day with the most cognitive load (analytics + intelligence + submission) is the day with the least energy | Docs written on day 1 *are* the mitigation — day 3 is execution against a spec, not design |

## Definition of done

Not "it runs locally." A level counts as complete when:

- it works on the **deployed** URL,
- from a **phone**, not just a desktop browser,
- with a **fresh account** created through the real signup flow,
- and its feature doc `Status:` says `built`.
