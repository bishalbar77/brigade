# 08 — Runbook

Operational reference. Written before the code so the deploy path isn't discovered on Sunday night.

## Local setup

```bash
npm install
cp .env.example .env.local        # fill in from the Supabase dashboard, see below
npm run sql:bundle                # regenerates supabase/apply_all.sql
# → paste supabase/apply_all.sql into the Supabase SQL editor and run once
npm run seed                      # 6 weeks of history — required for anything statistical
npm run dev                       # http://localhost:3000
```

### Applying migrations

**Preferred: the SQL editor.** `npm run sql:bundle` concatenates every migration into
`supabase/apply_all.sql`, in order, wrapped in a single transaction so a failure rolls back
cleanly. Paste it into the dashboard's SQL editor and run it once.

Why not `psql` or the CLI: a current Supabase project's direct host
(`db.<ref>.supabase.co`) is **IPv6-only** and won't resolve on an IPv4-only network, and the
pooled host is region-specific (`aws-N-<region>.pooler.supabase.com`), so it has to be copied
from **Settings → Database → Connection string** anyway. If you have that string:

```bash
psql "<connection-string-from-dashboard>" -f supabase/apply_all.sql
```

The Supabase CLI (`supabase db push`) also works, but it requires `supabase init` plus
migration filenames in `YYYYMMDDHHMMSS_name.sql` form — ours are `001_`…`011_` for
readability, so they'd need renaming first. Not worth it for a 3-day build.

### Verifying the schema landed

```bash
# should return [] (empty, not an error) once migrations have run
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/restaurants?select=id" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

| Response | Meaning |
|---|---|
| `[]` | schema applied, no data yet → run `npm run seed` |
| `{"code":"PGRST205"...}` | table not found → migrations have **not** been applied |
| `{"message":"Invalid API key"}` | wrong key |
| `{"message":"No API key found..."}` | the `apikey` header is missing |

## Environment variables

| Var | Where from | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | **no — never** |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` / prod domain | yes |

`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely. It belongs in the seed script and nowhere else.
It must never appear in a `NEXT_PUBLIC_` var, a client component, or a committed file. If it leaks,
rotate it in the dashboard immediately — treat it like a database password, because it is one.

`.env.local` is gitignored. `.env.example` is committed with empty values.

## Auth configuration

Both providers need setup in the Supabase dashboard, and both have a failure mode that only appears
in production.

**Email OTP** — Authentication → Providers → Email → enable "Confirm email."

> ⚠️ The built-in SMTP has a low hourly cap. It will stop sending mid-demo and look like broken auth.
> Test the cap on day 1. If it's tight, either configure custom SMTP (Authentication → Settings →
> SMTP; Resend's free tier is sufficient) or make Google OAuth the primary demo path and show OTP
> separately with the limit documented.

**Google OAuth** — Google Cloud Console → Credentials → OAuth 2.0 Client ID (Web application).

Authorized redirect URI — **the Supabase callback, not the app's**:
```
https://<project-ref>.supabase.co/auth/v1/callback
```
Then Supabase → Authentication → Providers → Google, paste client ID + secret.

Also set Authentication → URL Configuration:
- Site URL → the production domain
- Redirect URLs → both `http://localhost:3000/**` and `https://<prod-domain>/**`

> ⚠️ Missing the production entry is the classic Sunday-night failure: works locally, 400s on the live
> URL. Configure it right after deploy #1.

## Deploy

```bash
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_SITE_URL production
vercel --prod
```

Then, in order: update Supabase Site URL + Redirect URLs to the real domain → re-test Google OAuth on
the deployed URL → re-test OTP on the deployed URL.

Deploy at the end of day 1 and day 2, not once at the end. Vercel surfaces build errors that never
appear in `npm run dev` — server/client boundary violations, missing env vars, RSC misuse.

## Demo accounts

Created by the seed script. Password is the same for all of them; it's seeded data, not real.

| Email | Role | Lands on |
|---|---|---|
| `owner@brigade.test` | owner | `/ops/analytics` |
| `manager@brigade.test` | manager | `/ops/inventory` |
| `grill@brigade.test` | chef (grill) | `/ops/kds?station=grill` |
| `expo@brigade.test` | expo | `/ops/kds` |
| `server@brigade.test` | server | `/ops/floor` |
| `host@brigade.test` | host | `/ops/reservations` |
| `priya@brigade.test` | guest | `/menu` |

Keep a **fresh** signup as part of the demo too — a seeded login doesn't prove the OTP flow works.

## Common problems

| Symptom | Likely cause | Fix |
|---|---|---|
| Every query returns `[]`, no error | RLS policy denies, which is not an error | Check `profiles.role` and `restaurant_id` for the logged-in user. Query as service role to confirm data exists |
| `INSUFFICIENT_STOCK` on a dish that looks available | Working as designed — another order took it | Check `dish_availability` for that dish |
| Availability never updates in the UI | Realtime subscription not established, or table not in the publication | Check migration 011; check the browser console for the channel status |
| Realtime worked, then stopped after navigating around | Subscription leak hit the connection cap | Every `subscribe()` needs an `unsubscribe()` in the effect cleanup |
| OTP email never arrives | SMTP hourly cap hit | Wait, or switch to custom SMTP. See Auth section |
| Google OAuth 400 `redirect_uri_mismatch` | Prod callback not configured | Add the Supabase callback URL in Google Console, and prod domain in Supabase URL config |
| Charts empty | Seed didn't run, or ran against a different project | `npm run seed`; verify `NEXT_PUBLIC_SUPABASE_URL` matches |
| `stock_qty` disagrees with the ledger | Something wrote stock outside the sanctioned functions | Run the reconciliation query below, then find and fix the bare `UPDATE` |

### Stock reconciliation

`ingredients.stock_qty` is a projection of `stock_movements` (ADR-5). They must agree:

```sql
select i.id, i.name, i.stock_qty as projected,
       coalesce(sum(m.delta), 0) as ledger,
       i.stock_qty - coalesce(sum(m.delta), 0) as drift
from ingredients i
left join stock_movements m on m.ingredient_id = i.id
group by i.id, i.name, i.stock_qty
having i.stock_qty <> coalesce(sum(m.delta), 0);
```

Any row returned is a bug. Stock must only ever be mutated inside `place_order()` or
`adjust_stock()` — never a bare `UPDATE ingredients SET stock_qty = ...`.

## Pre-submission verification

Run this list against the **deployed** URL, on a **phone**, on **cellular** — not localhost, not
desktop wifi.

- [ ] Sign up fresh with email + password, receive and enter OTP, land on `/menu`
- [ ] Sign in with Google
- [ ] Each of the 7 roles lands on its correct surface
- [ ] Menu shows live portion counts; a near-86 dish shows its countdown
- [ ] Place an order → docket appears on KDS in ~1s → guest tracking advances
- [ ] Two browsers race the last portion → exactly one wins, loser sees a useful message
- [ ] Stock reconciliation query returns zero rows
- [ ] Guest cannot read another restaurant's orders via the REST API directly
- [ ] `cost_per_unit_cents` appears in no guest-facing payload
- [ ] Analytics charts have data; forecast is non-zero
- [ ] Keyboard-only navigation works; focus is visible
- [ ] Reduced-motion setting removes animation
- [ ] No horizontal scroll at 375 px
- [ ] KDS readable from ~2 m
- [ ] README complete; repo public; live link correct
