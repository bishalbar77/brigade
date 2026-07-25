# Billing

**User story:** US3 (Silver) · **Status:** built

_As deployed:_ `/bill/[orderId]` → `pay_order()`. Prices only SERVED items at the price captured on the line, refuses while anything is still with the kitchen, and is idempotent. Split billing is cut (cut-line 2).

**Problem it solves:** "Manual billing management." A bill should be a derivation of what was actually
served, not a number a server types into a calculator at the end of the meal.

## Behaviour

Once items are served, the guest opens the bill from their tracking screen — or a server opens it from
the floor map. It lists served items at their captured prices, subtotal, tax, optional tip, and total.

Payment is recorded against the order. **Payment is simulated** — a mock provider that records a
`payments` row and marks the order paid. Wiring a real PSP in three days would consume time better
spent on the differentiator, and a sandbox integration proves nothing a mock doesn't.

Closing the bill moves the table to `dirty` (see [floor-map.md](floor-map.md)).

Receipt is a printable/shareable view.

## Screens

`/bill/[orderId]` (guest) · `/ops/floor` → bill drawer (server)

## Data

- **Reads** `orders`, `order_items` (served + their captured `unit_price_cents`), `payments`
- **Writes** `payments`, `orders.subtotal_cents`/`tax_cents`/`tip_cents`/`total_cents`/`status`/`closed_at`,
  `tables.status`

## API

```
GET  /api/orders/[id]/bill      → computed totals
POST /api/orders/[id]/pay       { method, tipCents } → 201 | 409 (already paid)
```

Totals are computed **server-side**. A client-submitted total is a client-controlled price.

## Rules & edge cases

- **Money is integer cents everywhere.** No floats. `0.1 + 0.2` is exactly the class of bug that must
  never appear on a bill.
- **Prices come from `order_items.unit_price_cents`**, captured at order time — never re-joined to
  `dishes.price_cents`. A price edit must not retroactively change an open bill.
- **Voided items are excluded** from the total but still shown on the bill as cancelled, so a guest can
  see the kitchen removed something rather than wondering what happened.
- **Unserved items block closing** unless explicitly voided. Charging for food that never arrived is the
  worst possible bug in this feature.
- **Idempotent payment.** Double-tapping "Pay" must not create two `payments` rows — enforced with a
  unique constraint plus an idempotency key, not a disabled button.
- Tax rate comes from restaurant config, not hardcoded.
- Rounding happens once, on the final total, using a stated rule — never per line item, which produces
  totals that don't add up.
- A guest can read only their own bill; RLS enforces it.
- Closing an already-closed order → 409, not a second charge.

## Verification

- Bill totals equal the sum of served items at their captured prices
- Edit a dish price after ordering → the open bill is unchanged
- Void an item → excluded from the total, still visible as cancelled
- Attempt to close with an unserved, non-voided item → refused
- Double-submit payment → exactly one `payments` row
- Closing the bill sets the table to `dirty`
- Another guest's bill id returns nothing via the REST API
- Totals are correct with a tip and with an awkward tax rate (verify no float drift)

## Cut-line

The core bill stays — it's an explicit US3 bullet. **Split billing is cut-line item 2** and is the first
thing to go: it's fiddly (by item, by share, by person) and demos poorly compared to the runway board.
Print/share receipt view goes with it if needed.
