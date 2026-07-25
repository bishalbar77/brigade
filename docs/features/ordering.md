# Ordering

**User story:** US3 (Silver) · **Status:** planned

**Problem it solves:** "Manual order management" and "long waiting times for orders." Also the single
hardest correctness problem in the product: two guests must not both be sold the last portion.

## Behaviour

Guest adds dishes to a cart (client-side, persisted to `localStorage` so a refresh doesn't lose it),
reviews, and places the order. Placing it:

1. validates availability **inside a database transaction**,
2. creates `order_items`,
3. depletes ingredient stock via the ledger,
4. pushes the docket to the kitchen,
5. redirects the guest to order tracking.

If any item is short, **nothing is committed** — the guest is told which dish and how many are actually
left, and can adjust. Partial orders are not silently placed; a guest who ordered 3 and got 1 without
being asked is worse off than one who was told.

## Screens

`/cart` · redirect to `/order/[id]` on success

## Data

- **Reads** `dish_availability`, `recipe_items`, `dishes.price_cents`
- **Writes** `orders`, `order_items`, `stock_movements`, `ingredients.stock_qty` — all inside one
  transaction

`order_items.unit_price_cents` is captured at order time. A bill must not change because someone edited
a price afterwards.

## API

```
POST /api/orders
  body: { tableId, items: [{ dishId, qty, notes, modifiers }] }
  → 201 { orderId }
  → 409 { code: 'INSUFFICIENT_STOCK', dish, available }
```

The handler calls the `place_order()` Postgres function via RPC. It does **not** check availability
itself and then insert — that's the race.

## Realtime

Publishes to `restaurant:{id}:kds` (new docket), `restaurant:{id}:availability` (stock changed), and
`order:{id}` (the guest's own tracking).

## Rules & edge cases

**The last-portion race — the core correctness problem.**

Two guests both see "1 left" and tap order simultaneously. A read-then-write in application code lets
both succeed and drives stock negative. `place_order()` prevents it:

```
1. gather every ingredient_id implied by the requested items
2. SELECT ... FROM ingredients WHERE id = ANY(ids) ORDER BY id FOR UPDATE
3. recompute availability from the *locked* rows
4. if short → RAISE 'INSUFFICIENT_STOCK' (whole transaction rolls back)
5. insert order_items; append stock_movements; update projection
```

`ORDER BY id` is not cosmetic. Two concurrent orders touching an overlapping ingredient set will
deadlock if they acquire locks in different orders. Sorting makes lock acquisition consistent.

Other rules:

- Unverified email cannot place an order — enforced in the function, not just the UI
- Guest can only add items to an order they own; enforced in RLS, not by hiding the button
- Modifiers with `ingredient_delta` adjust the depletion, so a "no cheese" variant doesn't deplete cheese
- Zero or negative `qty` rejected by a check constraint, not just client validation
- Cart survives refresh; cart items that became unavailable while sitting in the cart are flagged on the
  cart screen *before* submission
- Double-tap on submit must not create two orders — idempotency key on the request
- `voided` items reverse their stock via a compensating `stock_movements` row, never by deleting the
  original. The ledger is append-only (ADR-5)

## Verification

- **The race test:** two browser sessions order the last portion at the same moment → exactly one
  succeeds; the other gets `INSUFFICIENT_STOCK` naming the dish and the real remaining count
- `stock_movements` shows exactly one depletion for that portion
- `stock_qty` never goes negative under concurrent load
- The stock reconciliation query in [../08-runbook.md](../08-runbook.md) returns zero rows afterwards
- A failed order leaves **no** partial `orders` or `order_items` row
- Editing a dish price after ordering does not change the existing bill
- Voiding an item restores stock and leaves both ledger rows intact
- Double-submitting creates one order

## Cut-line

Not cuttable — it's the centre of the product. **Modifiers** are cut-line item 5 and can go; the
atomic placement path cannot.
