# Digital menu

**User story:** US3 (Silver) · **Status:** planned

**Problem it solves:** Two PS challenges at once — "customers waiting to know whether dishes are
available" and "limited visibility into menu items and restaurant services." This is the surface where
Brigade's differentiator becomes visible to a guest: the availability number that existing POS systems
compute but only ever show to staff.

## Behaviour

A guest opens `/menu` (typically by QR code at the table) and sees dishes grouped by category. Each
dish shows name, description, price, image, and — the point — its **live availability**:

| Runway band | What the guest sees |
|---|---|
| plenty | nothing; no badge at all |
| low | "12 left" |
| critical | "4 left · about 40 min" |
| out | name struck through, "86" label, not orderable |

No account needed to browse. Ordering requires being signed in and verified.

Dishes are ordered by `steer_score` (see [../05-runway-engine.md](../05-runway-engine.md)), so
near-86 dishes sink in the browse rail and high-margin, long-runway dishes rise. **Near-86 dishes stay
fully orderable** — this is ranking, not hiding. A guest who came for the branzino must still find it.

Availability changes **live**, without a reload. Someone at another table ordering the last portion
updates this screen.

Filters: allergens (hard exclusion), vegetarian/vegan tags, category.

## Screens

`/menu` (list) · `/menu/[dishId]` (detail — see [order-tracking.md](order-tracking.md) for what
follows)

## Data

- **Reads** `dishes`, `menu_categories`, `dish_availability`, `dish_velocity` (for the countdown),
  `profiles.allergens` if signed in
- **Writes** none

`cost_per_unit_cents` and `margin` must **never** appear in a guest payload. Enforced by column grants,
not by remembering to omit them from a select.

## API

- Server component reads the menu on first paint (fast, SEO-able, works with JS disabled)
- `lib/runway/steering.ts` computes ordering server-side
- Client component subscribes to availability updates and patches in place

## Realtime

Subscribes to `restaurant:{id}:availability`. On a payload, patches the affected dish's portion count
and band without refetching the whole menu.

One channel, unsubscribed on unmount.

## Rules & edge cases

- **Dish with no recipe entered** → treated as unlimited, no badge. Not "unavailable." A half-configured
  menu must not read as a closed kitchen.
- **Outside service hours** → show portions, suppress the countdown. A menu predicting an 86 at 04:00
  destroys trust in the number.
- **Availability changes while the guest is looking at a dish** → the detail page updates in place; if
  it drops to 0 the order button becomes disabled with an explanation, never a silent failure on tap.
- **Allergen filter is a hard exclusion**, never a ranking penalty. Ranking down an allergen is a
  safety bug.
- **Image missing** → designed placeholder, not a broken-image icon.
- **Empty category** → hidden entirely rather than shown empty.
- Guest is not told *why* something is 86'd. Ingredient-level stock is staff information.

## Verification

- Set an ingredient to a known quantity; confirm the menu shows `floor(stock / recipe qty)` for the
  binding ingredient
- Order one portion in browser A; browser B's menu decrements within ~1s with no reload
- Zero the binding ingredient; the dish becomes struck-through and unorderable
- A dish with no `recipe_items` shows as available with no badge
- Allergen filter never surfaces a matching dish
- Guest network payload contains no cost or margin field
- Menu is legible and scrollable at 375 px with no horizontal overflow

## Cut-line

Core — not cuttable. If pressed: **demand steering can fall back to manual `sort` order** while
availability badges stay. Availability is the differentiator; steering is the amplifier.
