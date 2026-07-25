# Auth

**User story:** US2 (Silver) · **Status:** built

_As deployed:_ `/auth/sign-in` `/auth/sign-up` `/auth/verify` `/auth/callback`. OTP path works but the project's built-in SMTP is rate-capped — see the note in 07-submission.md.

**Problem it solves:** Every other feature needs to know who is asking and what they're allowed to do.
The PS asks for email+password with OTP, Google OAuth, and role-based access — and role-based access is
where most implementations cheat by hiding buttons instead of denying data.

## Behaviour

**Guest signup** — email + password → OTP code sent to email → enter code → profile created with role
`guest` → lands on `/menu`.

**Google OAuth** — one tap, no OTP (Google has already verified the address), profile created with role
`guest`.

**Staff** — never self-signup. An `owner` invites a staff member and assigns a role; the invite carries
`restaurant_id` and the role. This matters: self-service signup that could pick its own role would be
a privilege-escalation hole.

**Post-login routing** by role:

| Role | Lands on |
|---|---|
| `owner` | `/ops/analytics` |
| `manager` | `/ops/inventory` |
| `chef` | `/ops/kds?station={their station}` |
| `expo` | `/ops/kds` |
| `server` | `/ops/floor` |
| `host` | `/ops/reservations` |
| `guest` | `/menu` |

## Screens

`/auth/sign-in` · `/auth/sign-up` · `/auth/verify` (OTP entry) · `/auth/callback` (OAuth handler) ·
`/auth/invite/[token]` (staff acceptance)

## Data

- **Writes** `auth.users` (via Supabase Auth), `profiles` (via trigger on user creation)
- **Reads** `profiles` for role + `restaurant_id` on every authorized request

Profile row is created by a Postgres trigger on `auth.users` insert, defaulting to `role = 'guest'`.
Doing it in a trigger rather than application code means a user can never exist without a profile,
which would break every RLS policy that joins through it.

## API

Mostly Supabase client SDK rather than custom routes:

```
supabase.auth.signUp({ email, password })
supabase.auth.verifyOtp({ email, token, type: 'signup' })
supabase.auth.signInWithPassword({ email, password })
supabase.auth.signInWithOAuth({ provider: 'google' })
supabase.auth.signOut()
```

Custom route handlers:
- `GET /auth/callback` — exchanges the OAuth code for a session, then redirects by role
- `POST /api/staff/invite` — `owner` only; creates an invite with role + `restaurant_id`

Session refresh happens in Next.js middleware so server components see a valid session.

## Realtime

None.

## Rules & edge cases

- **Roles are enforced in RLS, not the UI.** Hiding a nav item is presentation; the database refusing
  the row is security. Both, but the second is the real one.
- Role is **never** accepted from client input. It comes from `profiles`, set by an invite or defaulted
  to `guest`.
- Unverified email cannot place an order — enforced in `place_order()`, not just the UI.
- OTP expiry → clear message with a working "resend," not a dead end.
- OAuth account whose email matches an existing password account → link to the same user rather than
  creating a duplicate.
- Signed-out access to an ops route → redirect to sign-in with `returnTo` preserved.
- Signed-in-but-wrong-role access to an ops route → 403 page explaining it, not a silent redirect loop.
- **Rate-capped OTP email** is the known operational risk — see [../08-runbook.md](../08-runbook.md).

## Verification

- Fresh email+password signup, real OTP entered, lands on `/menu`
- Google OAuth signup and sign-in both work **on the deployed domain**
- All 7 roles land on the correct surface
- With a `guest` JWT, `GET /rest/v1/ingredients` returns no rows — tested against the REST API
  directly, bypassing the UI entirely
- A guest cannot read another restaurant's `orders`
- Wrong-role visit to `/ops/analytics` gives an explanatory 403
- Session survives a page refresh and a server-component navigation

## Cut-line

Not cuttable — it's an entire user story. If time is short, the **staff invite flow** degrades to
seeded staff accounts plus a documented manual `UPDATE profiles SET role = ...`; the OTP and OAuth
paths stay.
