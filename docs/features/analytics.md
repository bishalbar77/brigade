# Analytics

**User story:** US4 + US5 (Gold + Platinum) · **Status:** built

_As deployed:_ `/ops/analytics`. Service summary + Kasavana–Smith matrix, drawn only above 30 paid orders.

**Problem it solves:** "Lack of operational insights and business analytics." The bar to clear is that
these charts answer a question an owner actually has — what lost money, what to order, where stock is
going — rather than displaying revenue over time because it's easy to plot.

> Load the **`dataviz` skill** before writing the first chart. Chart colours come from the semantic tokens
> in [../04-design-system.md](../04-design-system.md), with a separate validated categorical scale — "red"
> must keep meaning *critical* and not *the third series*.

## Behaviour

`/ops/analytics`, owner and manager only. Four sections, in descending order of usefulness:

**1. Service summary** — covers, revenue, average spend per cover, average turn time, for a selected
range. The orientation numbers.

**2. Menu engineering matrix** — the centrepiece. A scatter of every dish, popularity against margin,
quadranted into Star / Plowhorse / Puzzle / Dog (Kasavana–Smith; see
[../05-runway-engine.md](../05-runway-engine.md)). Each quadrant states the action: protect, reprice,
promote, cut. This is the chart that makes an owner change something on Monday.

**3. Demand forecast** — projected covers and per-dish demand for the next few days from EWMA velocity by
weekday × daypart, with the prep implication ("Saturday dinner: prep 18 branzino").

**4. Inventory intelligence** — reorder suggestions, waste variance per ingredient, and food cost as a
percentage of revenue against the 28–32% industry band from [../01-overview.md](../01-overview.md).

## Screens

`/ops/analytics` · `/ops/analytics/menu` (matrix detail) · `/ops/analytics/forecast`

## Data

- **Reads** `orders`, `order_items`, `dishes`, `recipe_items`, `ingredients`, `stock_movements`,
  `dish_velocity`
- **Writes** none (`insights` rows are written by the notification job, not by viewing a chart)

Aggregations run as SQL views or route handlers, not by pulling raw rows to the client.

## API

```
GET /api/analytics/summary?from&to
GET /api/analytics/menu-matrix?from&to
GET /api/analytics/forecast?days=7
GET /api/analytics/inventory
```

## Realtime

None. Analytics is a considered read, not a live feed — a matrix that reshuffles while you're reading it
is worse, not better.

## Rules & edge cases

- **Owner/manager only**, in RLS. These payloads contain cost and margin.
- **Historical cost, not current cost.** Margin uses the cost as at the time of sale. If a supplier raises
  a price today, last month's reported profit must not change — otherwise the numbers are unauditable.
- **Medians, not means**, for the matrix boundaries. One outlier dish shouldn't move the quadrant lines.
- **Insufficient data must say so.** A range with three orders gets "not enough data," not a confidently
  drawn trend. This is the failure mode that makes hackathon analytics look fake, and the 6-week seed
  script (see [../03-data-model.md](../03-data-model.md)) is the mitigation.
- **Archived dishes still appear** in historical ranges — they sold in that period.
- Forecast is shown with an explicit horizon and framed as an estimate. No confidence intervals: with this
  model they'd be theatre.
- Charts need accessible non-colour encoding too — the matrix labels its quadrants in text, so it isn't
  colour-only.
- Empty ranges render a designed empty state, not an axis with no marks.

## Verification

- Summary numbers reconcile against a hand-computed SQL total for a known day
- Matrix places a deliberately-seeded dish in each of the four quadrants
- Change an ingredient's cost → last month's margin is unchanged; this month's forecast cost updates
- A 2-day range shows "not enough data" rather than a trend
- Forecast for a high-velocity dish exceeds a low-velocity one; nothing forecasts 0 through cold start
- A `chef` gets 403 on every analytics endpoint (tested via API)
- Charts readable in light and dark, and legible without relying on hue alone
- No horizontal body scroll at 375 px — wide charts scroll inside their own container

## Cut-line

The **menu engineering matrix stays** — it's the single most credible Gold/Platinum artifact and it's
computed from data the product already has. Degradation order: drop inventory intelligence → drop
forecast charts (keep the numbers on the runway board) → keep matrix + service summary. Those two alone
satisfy US4's Sales and Analytics bullets.
