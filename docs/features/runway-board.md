# Runway board

**User story:** US5 (Platinum) · **Status:** built

_As deployed:_ `/ops/runway`, with stock top-up on the binding ingredient.

**Problem it solves:** The product's entire differentiation, on one screen. Existing POS systems tell
you a dish is out *after* stock hits zero. This tells the kitchen at 18:00 that the tandoori prawns will 86 at
roughly 20:40 with 4 portions left — while there is still time to prep more, adjust the menu, or brief
the floor.

Per [../06-roadmap.md](../06-roadmap.md) this is never cut. It is the screen that proves Brigade isn't
a Toast clone.

## Behaviour

A board of every dish in tonight's service, ordered by urgency — soonest to 86 at the top. Each row:

- dish name and station
- **portions remaining**
- **predicted 86 time** ("86s ~20:40")
- the **runway countdown** — the signature element (see [../04-design-system.md](../04-design-system.md)),
  a dish's remaining life rendered as a physical, depleting thing rather than a number in a badge
- current sell rate, so the prediction is inspectable rather than magic
- the **binding ingredient** — *which* ingredient is the constraint, because that's the actionable part

Everything updates live as orders land.

Actions available to `manager` / `owner` directly from a row: adjust stock (a delivery arrived, or a
count was wrong), or 86 a dish manually.

## Screens

`/ops/runway` · condensed 86-board panel embedded in [kds.md](kds.md)

## Data

- **Reads** `dish_availability`, `dish_velocity`, `recipe_items`, `ingredients`, `dishes`
- **Writes** `stock_movements` (via `adjust_stock()`) when a manager corrects stock

## API

- Server component computes bands via `lib/runway/`
- `POST /api/inventory/adjust` — `{ ingredientId, delta, reason, note }` → `adjust_stock()`

Never a bare `UPDATE ingredients SET stock_qty` — see ADR-5 in [../02-architecture.md](../02-architecture.md).

## Realtime

Subscribes to `restaurant:{id}:availability`. Recomputes bands and re-sorts on each payload.

## Rules & edge cases

- **Outside service hours, suppress predictions.** Velocity is 0, so runway is undefined. Show portions
  only. A board predicting an 86 at 04:00 destroys trust in every other number on the screen.
- **Cold-start dishes** (`sample_count < 3`) show portions and are explicitly marked "not enough history"
  rather than given a fabricated prediction.
- **`portions ≤ 3` forces the critical band** regardless of rate — at low absolute counts the ratio is
  noisy, and "3 left" matters on its own.
- **Show the binding ingredient.** "Tandoori prawns 86s at 20:40" is information; "because you have 0.75kg of prawns"
  is something a chef can act on in the next five minutes.
- **Unlimited dishes** (no BOM entered) are grouped separately, not shown with an infinite runway.
- The countdown animates on **change**, then rests. A permanently moving element in a kitchen is noise.
- Predictions are ranges/approximations in the copy ("~20:40"), never false precision.

## Verification

- With seeded history, a high-velocity dish shows a shorter runway than a low-velocity dish at equal
  stock
- Placing orders moves the countdown live, without reload
- Zeroing an ingredient flips every dependent dish to `out` and shows the correct binding ingredient
- Band boundaries land correctly at 45 min / 120 min / `portions ≤ 3`
- Outside service hours, no prediction is shown
- A dish with < 3 velocity samples is marked as such rather than predicted
- Adjusting stock from the board writes a `stock_movements` row and leaves the reconciliation query
  clean
- Reduced-motion setting replaces the animated countdown with a plain number and label
- Legible at 2 m

## Cut-line

**Never cut.** Degradation path if desperate, in order: drop the sell-rate column → drop the inline
stock-adjust action → drop the animated countdown for a plain number. **Never drop the predicted 86
time** — that single field is the product's whole claim to not being a clone.
