# 10 — UI plan: appealing and easy to use

> **Status: DONE.** Every item below is built and tested. The audit findings are kept as
> written, because a plan that erases the problem it solved stops explaining why the code
> looks the way it does.
>
> Verified by `npm run check`: 102 unit tests, 29 feature blocks / 148 end-to-end
> assertions, prod build. 147 of 148 pass; the one failure is
> `supabase/patches/006_view_writes_and_tenancy.sql`, which is unrelated to this work and
> still needs applying to the live database.
>
> **Six things turned out differently from the plan.** They are marked ⚠ inline below, and
> summarised in [What changed from the plan](#what-changed-from-the-plan).

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

> ⚠ **The sampled list above was itself wrong once, and searching was not enough.** The
> top Commons hit for "gulab jamun" is `File:KalaJamoon.JPG` — *kala* jamun, a different
> and darker sweet. The curated map uses `File:Two Gulab Jamun in a plate 01.jpg` instead.
>
> More generally: all 28 first-pass photos were fetched, then **rendered to a contact
> sheet and looked at**, and **11 were replaced** — naan served on newspaper, a buffet
> chafing dish for the biryani, a date-stamped papad, and rice moulded into a smiley face
> with tomato-slice eyes. Every one of those was a correct search result for the dish
> name. Commons removes the risk of the *wrong dish*; only looking removes the risk of an
> unappetising one.

- [x] **Curate, don't search at seed time.** A committed map of dish name → Commons file
      title, so the same photo lands every run. A live search per dish makes the menu's
      appearance nondeterministic and is how a salad ends up on the biryani.
- [x] **`scripts/fetch-dish-images.ts`** — resolve each file title via the Commons API
      (capturing `thumburl` at 900px, `Artist`, `LicenseShortName`, file page URL), download,
      upload to a **public Supabase Storage bucket `dish-images`** created through the Storage
      admin API with the service key (no dashboard step), then write the storage URL into
      `dishes.image_url`.
- [x] **Re-host, don't hotlink.** `next.config.ts` already permits
      `*.supabase.co/storage/v1/object/public/**`, so **no config change is needed** and the
      app never depends on Commons being reachable at request time.
- [x] **Render** a 16:9 `next/image` above the text block in `components/guest/MenuCard.tsx`,
      and a larger one on `app/(guest)/menu/[dishId]/page.tsx`. Keep the existing card chrome
      — border, `--radius-lg`, `--color-bg-raised`.
- [x] **Null-image fallback:** a deterministic warm gradient keyed off the dish name, plus the
      category in `.eyebrow`. Not decoration — 28 curated photos will not cover a 29th dish
      added later, and a card that changes shape when a photo is missing makes the grid
      ragged. Existing tokens only.
- [x] **Attribution** as a small ~~`.eyebrow`~~ credit on the dish page, plus
      `docs/image-credits.md` (dish, author, licence, source link) linked from the guest
      footer. CC BY and CC BY-SA both require it.

      > ⚠ **Not `.eyebrow`.** That class uppercases, and it rendered the photographer as
      > `PRIYAM1307`, which is not how they write their name. Attribution reproduces a
      > name; it does not restyle it. Plain `--text-step--1` in `--color-fg-subtle`
      > instead, on the dish page and on `/credits`.

- [x] **A route, not only a file.** `docs/image-credits.md` is not reachable from a
      browser, so the licence obligation needed a real page: `/credits`, rendering the
      generated `lib/data/image-credits.ts`, linked from the guest footer on every page.
- [x] **Photographs survive `npm run seed`.** The seed truncates and rebuilds `dishes`, so
      `image_url` was going to be lost on every run. Because the storage path is a pure
      function of the dish name, the seed lists the bucket and restores the URL — **only
      for objects that are actually there**, so a missing photo is the gradient rather
      than a broken image. Verified: a full re-seed kept all 28 photos with zero Commons
      requests.

## Phase B — ask who the user is

- [x] In `app/(guest)/page.tsx`, promote the audience split from a footnote to a real choice,
      placed under the existing hero and proof card so the thesis still leads. Two cards,
      side by side above 480px, stacked below:
      - **"I'm eating here"** → `/menu`
      - **"I'm on the team"** → the signed-in user's `ROLE_HOME` if a staff session exists,
        else `/auth/sign-in?returnTo=/ops/kds`
- [x] Reuse `homeFor()` and `isStaff()` from `lib/auth/roles.ts:38-44`. The landing page is
      already a server component doing data fetching, so `getCurrentProfile()` costs nothing
      new.
- [x] Keep the existing "See what's on" / "Book a table" CTAs — a diner who has already
      decided should not have to answer a question first. Remove the `.eyebrow` "Staff → the
      pass" link, which this replaces.

## Phase C — guest usability

- [x] **C1. The tax bug. Do this first — it is the only correctness defect in this plan.**
      `CartView.tsx:79` must use the restaurant's real rate. `app/(guest)/cart/page.tsx`
      already fetches the restaurant; pass `taxRate` down exactly as
      `app/(guest)/bill/[orderId]/page.tsx:80` does.
- [x] **C2. Add to order from the menu list.** A `+` control in each `MenuCard` footer calling
      the existing `addLine` (`lib/cart.ts:57`). `MenuList.tsx` is already `"use client"`, so
      no new boundary. One dish drops from two taps to one; a second from three to one.
- [x] **C3. Find a dish** — in `MenuList.tsx`, beside the allergen chips, which stay as they
      are (the hard-exclusion reasoning at `:83-93` is correct and is not being changed):
      a search field over name + description; a sticky category strip that jumps to sections
      (sections gain `id`s); **veg / vegan chips from the `tags` already on `MenuListDish`**,
      plus a small veg marker on each card.
- [x] **C4. Say something happened.** `AddToOrder.tsx:34,62` sets `added` once and never
      clears it, so a second tap changes nothing on screen. Reset it, and add one `aria-live`
      region for cart changes — the count badge is `aria-hidden` (`CartLink.tsx:63`), so
      additions are currently silent to a screen reader. One shared live region, not a toast
      library.
- [x] **C5. Notes to the kitchen.** `CartLine.notes` already flows cart → `place_order` → the
      docket, where `Docket.tsx:165-176` renders it in warning colour with a `!`. There is no
      input anywhere. Add one per cart line; `lib/cart.ts:59` already declines to merge noted
      lines.

      > ⚠ **This plan's own premise was wrong, and hid an oversell bug.** `addLine`
      > declining to merge noted lines is what MAKES two lines share one `dishId` — and
      > `setQty`, `removeLine` and `overAvailability` were all keyed on `dishId`. So:
      >
      > - `overAvailability` checked each line independently. Two lines of 2 against 3
      >   portions available both passed, and **4 portions went to a kitchen that had 3** —
      >   the same class of bug `place_order()` guards against per ingredient.
      > - `setQty` on one line silently changed its twin.
      >
      > Fixed by giving lines real identity: `CartLine.id`, quantity and removal keyed on
      > it, availability aggregated per *dish*, plus `setDishQty`/`removeDish`/`qtyForDish`.
      > `readCart` backfills ids so a cart saved by the old build still loads.
      > `lib/cart.test.ts` — 20 tests — pins all of it.
      >
      > The server was always safe: `place_order()` aggregates demand per ingredient
      > across the whole order, so duplicate `dish_id`s were summed correctly there.
- [x] **C6. Booking honesty** in `ReserveView.tsx` / `app/(guest)/reserve/page.tsx`:
      show the real date on day buttons (only today is labelled; the rest read "Fri"/"Sat");
      separate lunch from dinner (`reserve/page.tsx:91-113` flattens both services into one
      undivided run of ~14 buttons); stop silently sending `6` for a "6+" party (`:59`);
      ~~compute the real queue position~~ instead of the hardcoded `position: 1` (`:137`); and
      list the diner's own upcoming bookings — `reservations_read_own` already permits it, and
      today a booking vanishes on reload with no reference and no way to cancel.

      > ⚠ **The real queue position cannot be computed, and pretending otherwise would
      > have been the same bug in a new coat.** It needs a count of *other* parties' rows,
      > and `queue_read_own` correctly refuses that — a guest reads their own entry and
      > nothing else. Getting it would take a new security-definer view like
      > `reservation_load`, i.e. another SQL patch to apply, with 006 already pending.
      >
      > So the number is shown **only when it is known**: `join_queue()` returns the real
      > position at the moment of joining, and that is displayed then. On a later page load
      > the card says what it does know — the time they joined, and the current quote.
      > `position` is typed `number | null` so the honest gap cannot be filled by accident.
      >
      > Cancelling a booking is named rather than offered, for the same reason: it needs an
      > UPDATE a guest does not have. A button that fails is worse than a sentence that
      > tells you who to ask.
- [x] **C7. Forms.** `AuthShell.tsx`'s `Field` gains `aria-invalid` + `aria-describedby`
      wiring (both currently **zero** across the codebase) and per-field messages; password
      fields get a show/hide toggle. All three forms carry `noValidate` with a single
      post-submit rule, so a malformed email produces no message until the server answers.
- [x] **C8. Accessibility floor.** A skip link and `id="main"` in all three layouts; a real
      `.sr-only` utility to replace the inline `left: -9999px` in `Busy.tsx:25`; and fix the
      sold-out card keeping tab order with `href="/menu"` (`MenuCard.tsx:48-55`) —
      `pointer-events` does not stop Enter. Delete `components/ui/Placeholder.tsx`, which
      nothing imports.

## Phase D — ops usability (lower priority, behaviour only)

Staff-facing, so no visual change. Every ops table is `minWidth: 40rem` inside `.scroll-x`
(`components/ops/ReadOnly.tsx:121-159`), so all seven sideways-scroll on a phone, with no
sticky column and no sortable header anywhere (`aria-sort` count: zero).

- [x] Under 640px, `Table` renders each row as a stacked label/value card instead of
      scrolling. One change to the shared primitive fixes all seven screens.

      > ⚠ **`min-width: 0` was not enough, and only a screenshot showed it.** A
      > `display: table` box is shrink-to-fit, so it still sized itself to the max-content
      > width of its cells — label plus value on one unbroken line — and stayed ~700px
      > inside `.scroll-x`. Every long value was cut off at the right edge: "Chicken
      > thigh, bone" for *boneless*, "Deonar Halal M" for *Meats*. The table needs
      > `display: block` (and `tbody` likewise) to fill the container and let cells wrap.
      >
      > Column labels come from `--col-1…--col-10`, set on the table from the same `head`
      > array the real header row uses, so the two cannot drift. That is why the seven
      > consuming pages needed no change at all.
      >
      > A follow-on: `Pill` had inline `whiteSpace: "nowrap"`, so the action pill still
      > clipped. Removing it outright **regressed the wall screen** — one row became five
      > lines, one word per line, which is precisely what the ops surface cannot afford.
      > It moved to a `.ops-pill` class so the ≤640px block can relax it and nothing else
      > changes. Both widths re-screenshotted to confirm.
- [x] Sortable headers with `aria-sort` on Pantry (9 columns, the widest) and the analytics
      table.
- [x] One filter where the screen already counts the thing: Pantry "needs ordering only" —
      `app/ops/inventory/page.tsx:36-41` computes that number and offers no way to act on it.

---

## Explicitly not in scope

Palette, type scale, fonts, spacing, radii and the two-density system are unchanged. **No
Tailwind migration** — the app is 429 inline `style={{}}` objects and zero utility classes,
and converting that is a large mechanical diff with no user-visible benefit. `motion` and
`recharts` are installed and imported nowhere; left alone rather than adopted mid-plan.

## Verification

**Result: `npm run check` is 6 of 7 green — 102 unit tests, typecheck, 27 database
assertions, `verify:data`, 29 feature blocks / 148 end-to-end assertions, prod build.** The
single failure is patch 006 (views writable by `anon`), which predates this work; note that
check 4 applies that patch to a throwaway database and passes, so the SQL itself is sound
and only the live database is missing it.

Unit tests went 70 → 102: `lib/money.test.ts` (12) pins the tax arithmetic and
`lib/cart.test.ts` (20) pins line identity.

New assertions in `scripts/verify-features.mjs`, following the established pattern of reading
**rendered HTML** rather than trusting source:

- [x] every dish card renders an image or the deterministic fallback — **and no card renders
      neither**, which is the failure that would make the grid ragged;
- [x] the landing page offers both audience routes, and the staff route carries `returnTo`;
- [x] search, category jump and veg filter are present on `/menu`;
- [x] **the cart's tax equals the restaurant's `tax_rate`**, computed from the database rather
      than asserted against a literal, so it cannot drift again;
- [x] a skip link exists in all three layouts;
- [x] a note typed in the cart reaches `order_items.notes` **and appears on the cook's
      docket** — the whole point of the field;
- [x] the booking page shows real dates, separates lunch from dinner, no longer offers
      "6+", and never claims a queue position it does not know;
- [x] the pantry hands column labels to CSS, sets `aria-sort` when sorted, and filters to
      what needs ordering.

**Looked at, not just asserted.** Rendered through Chrome's debug protocol at a real CSS
viewport, because the automated layer sees strings and not layout. This found three things
no assertion would have: the pantry's clipped values, the pill regression on the wall
screen, and two sentences set in `.eyebrow`'s uppercase. Measured `scrollWidth -
innerWidth` at 375px on `/menu`, `/cart`, `/` and `/ops/inventory`: **0 on all four.**

> A note on method: the first screenshot appeared to show the menu overflowing badly at
> 375px, and it was an artefact — `--window-size` does not set the CSS viewport in
> headless Chrome. Measuring before believing it is the only reason that did not become a
> fix for a bug that did not exist.

**Two bugs in the test suite itself**, both of the same family as ones caught earlier in
this project:

- **A test that ate its own precondition.** "A dish page offers a way to add to it" opened
  `S.menu[0]`, captured before anything was ordered — but the race check deliberately buys
  every remaining portion of the first sauté dish, usually that same row. The page
  correctly said "Finished for tonight" and the check failed for being right. It now
  re-reads the menu and picks a dish that is orderable at that moment.
- **The suite was not idempotent.** Cleanup put the stock back and reopened the table but
  left the ORDER open, so `orders_one_open_per_table` refused the next run's order at the
  same table with a bare HTTP 500 — six knock-on failures from one stale row. Every order
  the script places now carries a `verify-features-` key prefix, and setUp deletes them
  (never the seeded live orders, which have no key). Legacy prefixes are matched too, so a
  database dirtied by an older build heals itself.

Licensing check before shipping: **all 28 entries** in `docs/image-credits.md` carry a
named author and an explicit licence — no "Unknown", no "See source" — and both the dish
page and `/credits` show the credit.

## What changed from the plan

Six things. Each is marked ⚠ above with the full reasoning; in short:

| # | The plan said | What was actually true |
|---|---|---|
| 1 | Commons results are of the named dish, so search is enough | True, but not sufficient — **11 of 28** photos were replaced after looking at them. The sampled "gulab jamun" credit was *kala* jamun. |
| 2 | Attribution as a small `.eyebrow` credit | `.eyebrow` uppercases, rendering a photographer as `PRIYAM1307`. Attribution reproduces a name. |
| 3 | `addLine` already declines to merge noted lines, so notes are safe | That is what creates two lines per dish — and `overAvailability` then let **4 portions be ordered against 3**. Needed real line identity. |
| 4 | Compute the real queue position | Not possible: `queue_read_own` forbids counting other parties. Shows the join time instead of inventing a rank. |
| 5 | Drop `min-width` and rows restack | A `display: table` box is shrink-to-fit; it needs `display: block`, and the `Pill` fix had to be scoped or it broke the wall screen. |
| 6 | (unstated) photos persist | `npm run seed` truncates `dishes`, so the seed had to restore `image_url` from the bucket. |

Two additions the plan did not call for, both forced by it: `/credits` as a real route
(a markdown file in `docs/` cannot satisfy a licence a *reader* must be able to check), and
`formatRate()` so the cart and bill name the rate from one place rather than two copies of
`toFixed(0)`.

## Order it was built in

1. **C1** — the tax bug, alone. The only correctness defect here.
2. **Phase A** — photos. Biggest visible change per unit of work.
3. **Phase B** — the role chooser. Small, and it fixes staff reachability.
4. **C2, C3, C4** — the ordering path: add from list, find a dish, confirm the add.
5. **C8** — accessibility floor. Cheap and mechanical.
6. **C5, C6, C7** — notes, booking honesty, form validation.
7. **Phase D** — ops tables.

Every step was left in a shippable state, and all seven landed.
