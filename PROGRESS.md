# Brigade — progress

> Resume file. Any new session: read this first, do what `NEXT:` says. Update it at the end of
> every work block, not retroactively. Plan lives at `~/.claude/plans/precious-stirring-hejlsberg.md`.

**NEXT:** restart the session so plugin skills load, then wireframes → `superpowers:brainstorm` →
`frontend-design`, then build the guest menu (first real UI). Backend is done and verified.
Optional when convenient: paste `supabase/patches/001_fk_deferrable.sql` in the SQL editor.
**Deadline:** 2026-07-27 (day 1 of 3 · started 2026-07-25)
**Live URL:** — **Repo:** local only, not pushed — **Supabase project:** `pgtpcgxjgdymibfccgns` ✔ seeded

Run `npm run verify:data` after any reseed and before the demo — 11 checks incl. the stock-ledger
invariant and a live run of the runway engine.

---

## Setup

- [x] `superpowers@superpowers-marketplace` v6.2.0 installed + enabled
- [x] `frontend-design@claude-plugins-official` installed + enabled
- [x] Frontend-aesthetics cookbook distilled into `CLAUDE.md`
- [x] Problem statement read; product + scope decided (Brigade · deep Gold + runway · no LLM)
- [x] `PROGRESS.md` created
- [x] `git init` + meaningful commits on `main`
- [x] Supabase project + `.env.local` (all 3 keys set, verified against live API)
- [x] Migrations applied via SQL editor — 8 tables, 2 views, 43 policies
- [x] `npm run seed` green — 1077 orders / 5286 items / 6 weeks
- [x] `npm run verify:data` — 11/11 checks pass
- [ ] **Session restarted so plugin skills load** ← required before brainstorm / frontend-design
- [ ] Public GitHub repo created + pushed
- [ ] Vercel project linked, first deploy green
- [ ] Apply `supabase/patches/001_fk_deferrable.sql` (not urgent — seed works around it)

## Docs

- [x] `docs/README.md` — index + glossary
- [x] `docs/01-overview.md` — problem, research, thesis, personas
- [x] `docs/02-architecture.md` — stack, topology, 7 decision records
- [x] `docs/03-data-model.md` — schema, RLS, migrations, seed strategy
- [x] `docs/04-design-system.md` — tokens, two densities, a11y floor (palette/type pending `frontend-design`)
- [x] `docs/05-runway-engine.md` — the math
- [x] `docs/06-roadmap.md` — schedule, cut line, risks
- [x] `docs/07-submission.md` — PS compliance matrix, PPT outline, demo script
- [x] `docs/08-runbook.md` — setup, env, deploy, troubleshooting
- [x] 15 feature docs + index in `docs/features/`
- [x] `CLAUDE.md` — project context + non-negotiables
- [x] Project memory written (auto-loads in a fresh session)

## Design

- [x] Greybox wireframes in `wireframes/index.html` (15 screens, annotated) ← **review this**
- [ ] `superpowers:brainstorm` → spec in `docs/superpowers/specs/`
- [ ] `frontend-design` → token system, folded into `04-design-system.md`

## Day 1 — foundation

- [x] Next.js 15 + TS + Tailwind v4 scaffold (typecheck clean, prod build green)
- [x] Schema + migrations (`001`–`011` + `010b`)
- [x] RLS policies for all 7 roles
- [x] `dish_availability` + `dish_binding_ingredient` views
- [x] `place_order()` with `FOR UPDATE ORDER BY id` locking
- [x] `adjust_stock()`, `record_count()`, `void_order_item()`, `advance_item_status()`
- [x] `lib/runway/` engine — 61 unit tests passing
- [x] Seed script written **and executed** against the live database
- [x] Data verification script (`npm run verify:data`)
- [ ] Auth UI: email + password + OTP
- [ ] Auth: Google OAuth (**prod** callback configured)

## Day 2 — core loop

- [ ] Live menu + runway badges
- [ ] Cart + atomic order placement
- [ ] Guest order tracking (realtime)
- [ ] KDS docket wall (realtime, station lanes)
- [ ] Floor map
- [ ] Reservations + walk-in queue
- [ ] Billing
- [ ] Deploy #2 green

## Day 3 — intelligence + ship

- [ ] Manager dashboard
- [ ] Inventory + recipe editor
- [ ] Runway board (signature screen)
- [ ] Analytics + menu-engineering matrix
- [ ] Velocity / forecast / demand steering
- [ ] Notifications
- [ ] Every feature doc `Status:` flipped to `built` or `cut`
- [ ] `07-submission.md` reconciled against what actually deployed
- [ ] README (team, stack, user stories, AI usage, live link)
- [ ] PPT → PDF
- [ ] Final deploy verified **from a phone**

---

## Env / credential state

Tracked separately from code state — these are what silently cost an hour after a restart.

| Thing | State |
|---|---|
| Supabase URL + publishable key | ✔ set, verified live |
| Supabase secret key | ✔ set — **but rejected on ~30% of `/auth/v1/admin/*` calls** (403 `bad_jwt`, server-side inconsistency). Seed retries around it. Publishable key measured 0/10 rejections, so the live app is unaffected. Legacy `service_role` JWT would remove it entirely |
| Google OAuth client | not created |
| Prod redirect URI | not configured |
| Custom SMTP (OTP rate-cap workaround) | not decided |
| Vercel project | not linked |
| Demo logins | `{role}@brigade.test` · password `brigade-demo-2026` · see `docs/08-runbook.md` |

## Decisions locked

| Decision | Value | Why |
|---|---|---|
| Product | Brigade — predictive scarcity, not inventory tracking | Toast/Square already auto-86; copying that = the clone the PS forbids |
| Scope | Deep Bronze→Gold + Platinum as one mechanism | Polished vertical slice scores better than 5 stubs |
| AI | **No LLM** — deterministic statistics | 5 of 6 Platinum examples are stats; PS marks AI Optional; demo can't fail on a rate limit |
| Stack | Next.js 15 route handlers, not separate Express | Solo/3 days can't afford two services; PS stack is "Suggested" |
| Backend | Supabase (Postgres + Auth + Realtime + RLS) | US2 is mostly configuration here |

## Cut so far

_nothing cut yet_ — cut line order when needed: staff/shifts → split billing → supplier auto-ordering → waste variance → modifiers. **Never cut KDS or the runway board; they are the demo.**

## Session log

- **2026-07-25 · block 1** — Installed both plugins via `claude plugin` CLI (the `/plugin` slash commands need an interactive session). Distilled aesthetics cookbook into `CLAUDE.md`. Researched the domain: found Toast/Square already ship recipe→auto-86, which forced the product thesis to move from "track inventory" to "forecast scarcity and steer demand against it." Named it Brigade (brigade de cuisine → station hierarchy → maps onto both KDS lanes and RBAC roles). Plan approved.
- **2026-07-25 · block 4** — Schema applied and seeded against the live project; 11/11 verification checks pass, including ledger == projection for all 37 ingredients. Four real bugs found by actually running things rather than reading them: (1) the `IMMUTABLE` index cast, (2) `recipe_items.ingredient_id` / `order_items.dish_id` were `ON DELETE RESTRICT`, which makes deleting a restaurant **impossible** — cascade order between sibling paths isn't guaranteed, so the restrict fires; fixed to `NO ACTION DEFERRABLE`, same guarantee, patch in `supabase/patches/`, (3) `sb_secret_` key rejected on ~30% of auth-admin calls (server-side; retry added), (4) **the runway board was sorting by band, not by time** — a 3-portion dish forced critical outranked a 4-portion dish that 86s 73 min sooner. Band is a scarcity signal, not urgency. Also widened service hours to continuous 11:00→close and gave Sunday an evening service, because Sunday is a demo day and it had no `(sunday, dinner)` velocity rows at all.
- **2026-07-25 · block 3** — Built the design-independent foundation: scaffold, 12 migration files, and `lib/runway/` with 57 passing tests. Typecheck clean, production build green, 5 commits on `main`. Two fixes worth remembering: `create-next-app` refuses a non-empty directory so the scaffold is hand-rolled, and the PostCSS config must use **object** form (`{"@tailwindcss/postcss": {}}`) because vite/vitest rejects the string-array form Next accepts. Deliberately did *not* pick a palette — `app/globals.css` has placeholder greys with fixed token *names*, leaving colour and type to `frontend-design`. **Blocked on a Supabase project**: nothing database-facing can be verified until one exists.
- **2026-07-25 · block 2** — Wrote the full docs tree: 9 top-level + 15 feature docs + index (~20k words). Chose to leave palette/typography **unset** in `04-design-system.md` — that's `frontend-design`'s job and pre-deciding it would waste the skill's process. Recorded 7 ADRs; the load-bearing ones are ADR-4 (availability is a view, never a stored flag) and ADR-5 (stock as append-only ledger + projection), because waste variance and audit both depend on ADR-5. Wrote project memory so a fresh session recovers context, not just state.
