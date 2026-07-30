# 10 — UI plan: appealing and easy to use

> **Status: planned, not started.** Written to survive a session ending, so it carries the
> audit findings with file:line references — a new session should not have to re-discover
> them. Work items are checkboxes; tick them as they land.

## Why

Brigade works. Every route returns 200, the runway engine is correct, 27 database assertions
and 120 end-to-end assertions pass. What it does not do is *look like a restaurant* or *feel
effortless to order from*. Two audits of the live deployment found three root causes.

### 1. There are no images anywhere

Confirmed against live HTML for `/`, `/menu`, `/reserve`, `/auth/sign-in`: **zero `<img>`,
zero `<svg>`, zero `url()`, no `public/` directory, no favicon.**

The plumbing exists and was never connected:

| Fact | Where |
|---|---|
| `image_url` column exists | `supabase/migrations/005_menu.sql:20` |
| It is selected | `lib/data/menu.ts:128` |
| Mapped to `imageUrl` | `lib/data/menu.ts:169` |
| **No component ever reads it** | grep returns only the two lines above |
| Never seeded — `SeedDish` has no image field | `supabase/seed/data.ts:18-31` |
| Storage remote patterns already declared | `next.config.ts:5-7`, comment: "Dish images live in Supabase Storage" |

The only non-typographic visual in the product is one radial gradient on `body`
(`app/globals.css:258-263`).

### 2. A diner cannot browse 28 dishes efficiently

| Affordance | State | Evidence |
|---|---|---|
| Search | none | no search input in the codebase |
| Category jump / sticky headers | none | `MenuList.tsx:226-244` renders sections with no `id`s |
| Veg / vegan filter | none | — |
| Allergen filter | **exists, and is good** | `MenuList.tsx:146-194` |
| Layout | single column at every width | `MenuList.tsx:238` — `display: grid` with no `grid-template-columns` |

`tags` (19 of 28 dishes carry `vegetarian`/`vegan`) is fetched, typed on both `MenuListDish`
(`MenuList.tsx:30`) and `MenuCardDish` (`MenuCard.tsx:19`) — and **never rendered**.

Adding one dish costs **two taps** (the whole card is a link to the detail page; the only
add control lives there, `AddToOrder.tsx:66-111`). A second dish costs three more.

### 3. The cart lies about money

`components/guest/CartView.tsx:79` hardcodes `taxCents(subtotal, 0.08)`. The bill reads the
restaurant's real rate (`app/(guest)/bill/[orderId]/page.tsx:80`), seeded at `0.05`
(`supabase/seed/seed.ts:241`), which is also what `place_order()`/`pay_order()` use.

**On a ₹480 subtotal the cart quotes ₹38.40 tax and the bill charges ₹24.**

## Decisions already taken

Settled with the user — do not relitigate:

1. **Dish photos come from a stock source.** Caveats were stated and accepted.
2. **Palette and typography do not change.** Dark espresso `#1e1815`, steel-blue accent
   `#3d90d9`, Bricolage Grotesque / Newsreader / IBM Plex Mono, and all eight measured
   contrast tokens stay exactly as they are. This plan adds photography and fixes behaviour;
   it does not restyle.
3. **The entry point asks who you are** — staff or guest — and routes accordingly. Today the
   entire staff half of the product hangs off one `.eyebrow` link below the fold
   (`app/(guest)/page.tsx:196`).

---

## Phase A — real dish photography

**Source: Wikimedia Commons**, verified during planning. Real photos of these exact dishes
exist, no API key needed, each with a named author and explicit licence:

```
Butter chicken   CC BY-SA 2.0   stu_spivack
Biryani          CC BY-SA 3.0   Jyothis
Gulab jamun      CC BY-SA 4.0   Prakrutim
Masala chai      Public domain  Miansari66
Paneer tikka     CC BY 2.0 de   Sonja Pauen
```

Chosen over Unsplash for the exact risk flagged about stock search: Commons results are *of
the named dish*; Unsplash's frequently are not.

- [ ] **Curate, don't search at seed time.** A committed map of dish name → Commons file
      title, so the same photo lands every run. A live search per dish makes the menu's
      appearance nondeterministic and is how a salad ends up on the biryani.
- [ ] **`scripts/fetch-dish-images.ts`** — resolve each file title via the Commons API
      (capturing `thumburl` at 900px, `Artist`, `LicenseShortName`, file page URL), download,
      upload to a **public Supabase Storage bucket `dish-images`** created through the Storage
      admin API with the service key (no dashboard step), then write the storage URL into
      `dishes.image_url`.
- [ ] **Re-host, don't hotlink.** `next.config.ts` already permits
      `*.supabase.co/storage/v1/object/public/**`, so **no config change is needed** and the
      app never depends on Commons being reachable at request time.
- [ ] **Render** a 16:9 `next/image` above the text block in `components/guest/MenuCard.tsx`,
      and a larger one on `app/(guest)/menu/[dishId]/page.tsx`. Keep the existing card chrome
      — border, `--radius-lg`, `--color-bg-raised`.
- [ ] **Null-image fallback:** a deterministic warm gradient keyed off the dish name, plus the
      category in `.eyebrow`. Not decoration — 28 curated photos will not cover a 29th dish
      added later, and a card that changes shape when a photo is missing makes the grid
      ragged. Existing tokens only.
- [ ] **Attribution** as a small `.eyebrow` credit on the dish page, plus
      `docs/image-credits.md` (dish, author, licence, source link) linked from the guest
      footer. CC BY and CC BY-SA both require it.

## Phase B — ask who the user is

- [ ] In `app/(guest)/page.tsx`, promote the audience split from a footnote to a real choice,
      placed under the existing hero and proof card so the thesis still leads. Two cards,
      side by side above 480px, stacked below:
      - **"I'm eating here"** → `/menu`
      - **"I'm on the team"** → the signed-in user's `ROLE_HOME` if a staff session exists,
        else `/auth/sign-in?returnTo=/ops/kds`
- [ ] Reuse `homeFor()` and `isStaff()` from `lib/auth/roles.ts:38-44`. The landing page is
      already a server component doing data fetching, so `getCurrentProfile()` costs nothing
      new.
- [ ] Keep the existing "See what's on" / "Book a table" CTAs — a diner who has already
      decided should not have to answer a question first. Remove the `.eyebrow` "Staff → the
      pass" link, which this replaces.

## Phase C — guest usability

- [ ] **C1. The tax bug. Do this first — it is the only correctness defect in this plan.**
      `CartView.tsx:79` must use the restaurant's real rate. `app/(guest)/cart/page.tsx`
      already fetches the restaurant; pass `taxRate` down exactly as
      `app/(guest)/bill/[orderId]/page.tsx:80` does.
- [ ] **C2. Add to order from the menu list.** A `+` control in each `MenuCard` footer calling
      the existing `addLine` (`lib/cart.ts:57`). `MenuList.tsx` is already `"use client"`, so
      no new boundary. One dish drops from two taps to one; a second from three to one.
- [ ] **C3. Find a dish** — in `MenuList.tsx`, beside the allergen chips, which stay as they
      are (the hard-exclusion reasoning at `:83-93` is correct and is not being changed):
      a search field over name + description; a sticky category strip that jumps to sections
      (sections gain `id`s); **veg / vegan chips from the `tags` already on `MenuListDish`**,
      plus a small veg marker on each card.
- [ ] **C4. Say something happened.** `AddToOrder.tsx:34,62` sets `added` once and never
      clears it, so a second tap changes nothing on screen. Reset it, and add one `aria-live`
      region for cart changes — the count badge is `aria-hidden` (`CartLink.tsx:63`), so
      additions are currently silent to a screen reader. One shared live region, not a toast
      library.
- [ ] **C5. Notes to the kitchen.** `CartLine.notes` already flows cart → `place_order` → the
      docket, where `Docket.tsx:165-176` renders it in warning colour with a `!`. There is no
      input anywhere. Add one per cart line; `lib/cart.ts:59` already declines to merge noted
      lines.
- [ ] **C6. Booking honesty** in `ReserveView.tsx` / `app/(guest)/reserve/page.tsx`:
      show the real date on day buttons (only today is labelled; the rest read "Fri"/"Sat");
      separate lunch from dinner (`reserve/page.tsx:91-113` flattens both services into one
      undivided run of ~14 buttons); stop silently sending `6` for a "6+" party (`:59`);
      compute the real queue position instead of the hardcoded `position: 1` (`:137`); and
      list the diner's own upcoming bookings — `reservations_read_own` already permits it, and
      today a booking vanishes on reload with no reference and no way to cancel.
- [ ] **C7. Forms.** `AuthShell.tsx`'s `Field` gains `aria-invalid` + `aria-describedby`
      wiring (both currently **zero** across the codebase) and per-field messages; password
      fields get a show/hide toggle. All three forms carry `noValidate` with a single
      post-submit rule, so a malformed email produces no message until the server answers.
- [ ] **C8. Accessibility floor.** A skip link and `id="main"` in all three layouts; a real
      `.sr-only` utility to replace the inline `left: -9999px` in `Busy.tsx:25`; and fix the
      sold-out card keeping tab order with `href="/menu"` (`MenuCard.tsx:48-55`) —
      `pointer-events` does not stop Enter. Delete `components/ui/Placeholder.tsx`, which
      nothing imports.

## Phase D — ops usability (lower priority, behaviour only)

Staff-facing, so no visual change. Every ops table is `minWidth: 40rem` inside `.scroll-x`
(`components/ops/ReadOnly.tsx:121-159`), so all seven sideways-scroll on a phone, with no
sticky column and no sortable header anywhere (`aria-sort` count: zero).

- [ ] Under 640px, `Table` renders each row as a stacked label/value card instead of
      scrolling. One change to the shared primitive fixes all seven screens.
- [ ] Sortable headers with `aria-sort` on Pantry (9 columns, the widest) and the analytics
      table.
- [ ] One filter where the screen already counts the thing: Pantry "needs ordering only" —
      `app/ops/inventory/page.tsx:36-41` computes that number and offers no way to act on it.

---

## Explicitly not in scope

Palette, type scale, fonts, spacing, radii and the two-density system are unchanged. **No
Tailwind migration** — the app is 429 inline `style={{}}` objects and zero utility classes,
and converting that is a large mechanical diff with no user-visible benefit. `motion` and
`recharts` are installed and imported nowhere; left alone rather than adopted mid-plan.

## Verification

Existing gates stay green: `npm run check` — SQL lint, 70 unit tests, typecheck, 27 database
assertions, `verify:data`, 21 feature blocks / 120 assertions, prod build.

New assertions in `scripts/verify-features.mjs`, following the established pattern of reading
**rendered HTML** rather than trusting source:

- [ ] every dish card renders an image or the deterministic fallback — **and no card renders
      neither**, which is the failure that would make the grid ragged;
- [ ] the landing page offers both audience routes, and the staff route carries `returnTo`;
- [ ] search, category jump and veg filter are present on `/menu`;
- [ ] **the cart's tax equals the restaurant's `tax_rate`**, computed from the database rather
      than asserted against a literal, so it cannot drift again;
- [ ] a skip link exists in all three layouts.

By hand, because no automated layer sees it: `/menu` on a real phone at 375px with photos
loading on a slow connection; the sticky category strip while scrolling; the veg filter
combined with an allergen exclusion.

Licensing check before shipping: every entry in `docs/image-credits.md` has an author and a
licence, and the dish detail page shows the credit.

## Suggested order

1. **C1** — the tax bug, alone. The only correctness defect here.
2. **Phase A** — photos. Biggest visible change per unit of work.
3. **Phase B** — the role chooser. Small, and it fixes staff reachability.
4. **C2, C3, C4** — the ordering path: add from list, find a dish, confirm the add.
5. **C8** — accessibility floor. Cheap and mechanical.
6. **C5, C6, C7** — notes, booking honesty, form validation.
7. **Phase D** — ops, if time remains.

Stop after any numbered step and the app is in a shippable state.
