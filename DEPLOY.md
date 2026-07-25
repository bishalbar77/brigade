# Deploy checklist

One-time sequence. Everything here needs a browser login, so it's yours rather than
scriptable. Tick as you go — if the session dies, this file is the resume point.

Known values for this project:

| Thing | Value |
|---|---|
| Supabase project ref | `pgtpcgxjgdymibfccgns` |
| Supabase URL | `https://pgtpcgxjgdymibfccgns.supabase.co` |
| Google redirect URI (the one Google needs) | `https://pgtpcgxjgdymibfccgns.supabase.co/auth/v1/callback` |
| Demo logins | `{owner,manager,grill,expo,server,host}@brigade.test`, `priya@brigade.test` · `brigade-demo-2026` |

---

## 1 · Push to a public GitHub repo

The problem statement requires a **public** repo with meaningful commit history.
There are 16 commits waiting and no remote yet.

```bash
gh auth login                 # or create the repo in the browser
gh repo create brigade --public --source=. --remote=origin --push
```

Without `gh`: create an empty public repo named `brigade` on github.com (no README,
no .gitignore — this repo has both), then:

```bash
git remote add origin https://github.com/<you>/brigade.git
git push -u origin main
```

- [ ] Repo exists and is **public**
- [ ] `git log` on GitHub shows all 16 commits

> `.env.local` is gitignored and stays local. Confirm on GitHub that no keys are
> visible before moving on.

---

## 2 · Deploy to Vercel

```bash
npx vercel login
npx vercel link          # accept defaults; framework detects as Next.js
npx vercel --prod
```

**Environment variables — only two, and both are public:**

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
#   https://pgtpcgxjgdymibfccgns.supabase.co

npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
#   sb_publishable_vl4-RMxD8NBPL6gsaNv2xg_zRl_jYpL
```

Then redeploy so they take effect: `npx vercel --prod`

**Do NOT add `SUPABASE_SERVICE_ROLE_KEY` to Vercel.** It is referenced in exactly two
files — `supabase/seed/seed.ts` and `scripts/verify-data.ts` — both of which run on
your machine. No application code reads it, verified by grep. Keeping it out means a
compromised production deployment still cannot bypass RLS, because the only key that
could isn't there. That is a real security property, not a formality.

- [ ] `npx vercel --prod` succeeded
- [ ] Note the production URL here: `________________________________`
- [ ] Visiting `/` shows a real dish with a live portion count
- [ ] `/menu` loads and shows runway badges

> Vercel surfaces build failures that `next dev` does not — server/client boundary
> violations especially. One of those bit this build already (see the `lib/ops/tickets.ts`
> split), which is exactly why this step happens before Sunday.

---

## 3 · Google OAuth

Three places have to agree, and getting two of three right produces something that
works locally and 400s in production.

### 3a · Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project
2. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - App name, support email, developer contact email
   - Default scopes are fine (`email`, `profile`, `openid`)
3. ⚠ **Publishing status.** While it says **Testing**, only email addresses you add
   under *Test users* can sign in — everyone else gets "access blocked". For a demo,
   either click **Publish app** or add every address that will be demoed with,
   including any judge's. This is a silent trap: the button works, the sign-in fails.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URI** — Supabase's callback, *not* your app's:
     ```
     https://pgtpcgxjgdymibfccgns.supabase.co/auth/v1/callback
     ```
5. Copy the **Client ID** and **Client secret**

### 3b · Supabase → Authentication → Providers → Google

- Enable Google
- Paste Client ID and Client secret
- Save

### 3c · Supabase → Authentication → URL Configuration

- **Site URL:** your Vercel production URL
- **Redirect URLs** — add all of these:
  ```
  https://<your-vercel-domain>/**
  http://localhost:3000/**
  http://localhost:3111/**
  ```

`3111` is the port the local dev server runs on in this project; without it, OAuth
fails locally even once production works.

- [ ] Consent screen published, or test users added
- [ ] Client ID + secret in Supabase
- [ ] Site URL set to the Vercel domain
- [ ] All three redirect URLs added
- [ ] **Google sign-in tested on the deployed URL**, not just locally

---

## 4 · Email OTP (the rate cap)

Supabase's built-in SMTP has a low hourly cap. It doesn't error loudly — it just
stops sending, which reads as broken auth mid-demo. This is risk #1 in
[docs/06-roadmap.md](docs/06-roadmap.md).

Pick one:

- **Custom SMTP** (recommended): Supabase → Authentication → Settings → SMTP.
  Resend's free tier is enough. Removes the cap.
- **Or** make Google the demo path, and demonstrate the OTP screen separately with
  the cap acknowledged out loud.

To get a **6-digit code** rather than a magic link, edit
Authentication → Email Templates → Confirm signup and include `{{ .Token }}`. The
verify screen supports both, so either works — the code just demos better.

- [ ] Decided: custom SMTP / Google-first
- [ ] Fresh signup tested end to end **on the deployed URL**

---

## 5 · Verify the deployment

Against the **production URL**, on a **phone**, on **cellular** — not localhost, not
desktop wifi.

```bash
# from your machine, pointed at production
curl -s https://<domain>/            | grep -o "86s ~[0-9:]*" | head -1   # live prediction
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/menu
```

- [ ] `/` hero shows a real predicted 86 time
- [ ] `/menu` counts match `npm run verify:data` output
- [ ] Sign in as `manager@brigade.test` → lands on `/ops/inventory`
- [ ] Sign in as `grill@brigade.test` → lands on `/ops/kds` filtered to grill
- [ ] Place an order as `priya@brigade.test` → docket appears on `/ops/kds`
- [ ] Two browsers race the last portion → exactly one wins, loser sees the dish name
- [ ] Guest cannot read another restaurant's orders (see [docs/08-runbook.md](docs/08-runbook.md))
- [ ] No horizontal scroll at 375px
- [ ] KDS legible from ~2m

---

## 6 · Submission

- [ ] README: team name, tech stack, user stories completed, AI usage, live link
- [ ] Live URL public and working
- [ ] Repo public
- [ ] Every `docs/features/*.md` `Status:` reconciled to `built` / `built (read-only)` / `cut`
- [ ] [docs/07-submission.md](docs/07-submission.md) compliance matrix filled in
- [ ] PPT → PDF (template arrives day 3)
