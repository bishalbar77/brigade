# Recipes & menu management

**User story:** US4 (Gold) · **Status:** planned

**Problem it solves:** The recipe bill-of-materials is the mechanism the entire product rests on — it's
what turns "we have 3 kg of chicken" into "you can serve 6 of these." Without a BOM editor, availability
is unconfigurable and Brigade is just a menu website.

## Behaviour

**Dish editing** — name, description, price, image, category, station, prep time, tags, allergens.

**The BOM editor** — the important half. Attach ingredients with quantities per portion. As the chef
edits, the screen shows live:

- **food cost** = Σ (qty × unit cost)
- **margin** = price − food cost, and margin %
- **current portions available** from the BOM against today's stock
- **the binding ingredient** — which one runs out first

That immediate feedback is the feature. A chef changing a portion size sees the margin and the
availability move as they type, which is the moment costing stops being a spreadsheet exercise.

**Manual 86** — a chef can 86 a dish regardless of stock (something's burnt, the sauce broke, the fryer
is down). This is an override on top of computed availability, not a replacement for it.

## Screens

`/ops/menu` (dish list with margin + class) · `/ops/menu/[id]` (dish + BOM editor) ·
`/ops/menu/categories`

## Data

- **Reads** `dishes`, `recipe_items`, `ingredients`, `menu_categories`, `dish_availability`
- **Writes** `dishes`, `recipe_items`, `menu_categories`, `dish_modifiers`, `dishes.manual_86_until`

## API

```
POST   /api/dishes                        create
PATCH  /api/dishes/[id]                   update
PUT    /api/dishes/[id]/recipe            { items: [{ ingredientId, qty }] }   replaces the BOM
POST   /api/dishes/[id]/eighty-six        { until?: timestamptz }
DELETE /api/dishes/[id]/eighty-six        clear the override
```

BOM is replaced wholesale rather than patched item-by-item — a partial recipe update that half-applies
would silently corrupt availability, and a recipe is small enough that replacement is cheap.

## Realtime

Publishes to `restaurant:{id}:availability` when a BOM or manual 86 changes, since both change what
guests can order.

## Rules & edge cases

- **`qty > 0` enforced by a check constraint.** Zero would divide by zero in the availability view.
- **Archive, never delete, a dish.** `is_archived = true`. Historical `order_items` reference it and
  deleting would orphan past bills and break analytics.
- **Deleting an ingredient still used in a BOM is refused** with a list of the dishes that use it.
- **Manual 86 is an override with an expiry** (default: end of service). An 86 that silently persists
  into tomorrow is a lost sale nobody notices.
- **Computed 86 and manual 86 are distinct.** The runway board shows *why* a dish is off, because the
  actions differ: one needs a delivery, the other needs a new sauce.
- Sub-recipes (a house sauce used across five dishes) are **out of scope** — flat BOMs only. Toast
  supports nesting; three days doesn't. Noted rather than pretended away.
- Price changes don't alter historical `order_items.unit_price_cents`.
- `manager`/`owner` edit dishes and recipes; `chef` can only manual-86.

## Verification

- Create a dish, attach a BOM, confirm `dish_availability` reports `floor(stock / qty)` for the binding
  ingredient
- Editing a qty updates cost, margin and portions live in the editor
- Attempt `qty = 0` → rejected by the constraint, not just the form
- Archive a dish → gone from the guest menu, still present in historical analytics
- Delete an in-use ingredient → refused, naming the dependent dishes
- Manual 86 removes the dish from the guest menu; expiry restores it automatically
- Runway board distinguishes manual from computed 86
- A `chef` cannot change a price (tested via API)

## Cut-line

Not cuttable — without a BOM editor the differentiator can't be configured or demoed. Degradation: the
live cost/margin preview can go (compute it in analytics instead), and modifiers are cut-line item 5.
The BOM editor itself stays.
