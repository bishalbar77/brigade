# Inventory

**User story:** US4 (Gold) · **Status:** planned

**Problem it solves:** "Manual inventory management." Also the foundation everything else stands on —
if stock is wrong, availability is wrong, runway is wrong, forecasts are wrong, and the whole product's
claim collapses.

## Behaviour

Ingredient list with current stock, par level, reorder point, unit cost, supplier, and shelf life.
Rows needing attention surface first: below reorder point, or expiring soon.

**Stock adjustments** are explicit and reasoned — `purchase`, `waste`, `correction`, `count`. Every one
writes a ledger row with who did it and why. There is no "just edit the number" affordance, because that
is how inventory systems become fiction.

**Reorder suggestions** come from the consumption model (see [../05-runway-engine.md](../05-runway-engine.md)):
which ingredients to order, how much, and by when given supplier lead time — capped by shelf life, so it
never suggests buying more perishable stock than can be used before it spoils.

**Waste variance** compares theoretical depletion (recipes × dishes sold) against actual movement,
surfacing ingredients walking out faster than the recipes explain.

## Screens

`/ops/inventory` (list) · `/ops/inventory/[id]` (detail + full movement history) ·
`/ops/inventory/counts` (stock-take entry)

## Data

- **Reads** `ingredients`, `stock_movements`, `suppliers`, `recipe_items`, sold `order_items` (for
  variance)
- **Writes** `stock_movements` (append-only), `ingredients.stock_qty` (projection), `ingredients` config
  fields

## API

```
POST  /api/inventory/adjust    { ingredientId, delta, reason, note }
POST  /api/inventory/count     { counts: [{ ingredientId, countedQty }] }
PATCH /api/inventory/[id]      { parLevel, reorderPoint, costPerUnitCents, supplierId, shelfLifeDays }
GET   /api/inventory/reorder   → suggestions
GET   /api/inventory/variance?days=7
```

## Realtime

Publishes to `restaurant:{id}:availability` after any adjustment, so guest menus and the runway board
react immediately to a delivery being received.

## Rules & edge cases

- **Stock is only ever mutated by `place_order()` or `adjust_stock()`.** Never a bare
  `UPDATE ingredients SET stock_qty`. This is the single rule that keeps the ledger and the projection in
  agreement — see ADR-5 in [../02-architecture.md](../02-architecture.md) and the reconciliation query in
  [../08-runbook.md](../08-runbook.md).
- **A stock count writes a `correction` movement for the difference**, it does not overwrite the balance.
  The gap between counted and expected *is* the variance signal — overwriting destroys the very data the
  Bonus feature needs.
- **Adjustments are `manager`/`owner` only**, enforced in RLS. A `chef` can 86 a dish but not rewrite
  stock.
- **Costs are gated.** `cost_per_unit_cents` must never reach a guest payload — column grants, not
  careful selects.
- Negative stock is impossible via ordering; a `correction` *can* set it negative if someone counts badly,
  which surfaces as an error state rather than being silently clamped.
- Shelf life caps reorder suggestions.
- **Variance is framed as "investigate," never "someone stole this."** Over-portioning, bad prep yields,
  and theft are indistinguishable in this data, and the system does not know which it is.
- Changing `cost_per_unit_cents` does **not** retroactively change historical margins — analytics uses
  cost as at the time of sale. Otherwise last week's profit changes when a supplier raises a price.

## Verification

- Receive a delivery via `adjust` → stock rises, ledger row written, dependent dishes' availability rises
  live on the guest menu
- Record a count that differs from expected → a `correction` movement appears for exactly the difference
- Reconciliation query returns zero rows after a mixed batch of orders, purchases and counts
- Reorder suggestion respects supplier lead time and is capped by shelf life
- Seed a waste event → variance reports the expected negative number
- A `chef` cannot adjust stock (tested via the API directly)
- No guest-facing response contains a cost field
- Editing an ingredient's cost leaves last week's reported margin unchanged

## Cut-line

The ledger, adjustments and reorder suggestions stay — they're US4's "Inventory" bullet and the base of
the runway engine. **Waste variance is cut-line item 4** and can go; **stock counts** can go with it,
leaving purchase/waste adjustments only.
