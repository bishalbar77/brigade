# 05 — The runway engine

The product's whole differentiation lives here. Everything in this file is deterministic arithmetic —
no LLM, no model API, no network call. See ADR-7 in [02-architecture.md](02-architecture.md).

Implemented as pure functions in `lib/runway/` with no Supabase imports, so it can be unit-tested
without a database. This is the part most worth testing and the part most likely to be subtly wrong.

---

## 1. Portions available

```
portions(d) = min over i ∈ recipe(d) of  floor( stock_i / qty(d,i) )
```

The binding ingredient decides. Six steaks and one lemon means one steak dish.

Edge cases that must be handled, not assumed away:

| Case | Behaviour |
|---|---|
| Dish has no `recipe_items` | Unlimited (BOM not entered yet ≠ unavailable) |
| `qty(d,i) = 0` | Impossible — `check (qty > 0)` on the table; `nullif` in the view as belt-and-braces |
| `stock_i` negative | Cannot happen: `place_order` refuses before it would. If seen, the ledger and projection have drifted — a bug, surface it loudly |
| Fractional stock | `floor`, always. Half a portion is zero portions. |

Computed in SQL as the `dish_availability` view — see [03-data-model.md](03-data-model.md).

## 2. Velocity

How fast a dish actually sells, segmented by weekday and daypart, because Saturday dinner and Tuesday
lunch are different restaurants.

```
for each (dish d, weekday w, daypart p):
    samples = units sold per hour in the last K=6 occurrences of (w,p)
    v(d,w,p) = EWMA(samples, α = 0.3)
             = α·x_recent + (1−α)·prev
```

α = 0.3 weights the recent past without letting one unusual night dominate. K = 6 is six weeks of the
same slot — the reason the seed script generates six weeks of history.

**Cold start:** `sample_count < 3` → fall back to the category mean, then to a global mean. Never
return 0, or runway becomes infinite and the whole feature silently disappears.

Stored in `dish_velocity`, refreshed after each service rather than computed per request.

## 3. Runway — the core metric

```
runway_minutes(d) = portions(d) / v(d, today, now_daypart) × 60

predicted_86_at   = now + runway_minutes(d)
```

Bands drive the UI (see [04-design-system.md](04-design-system.md)):

| Band | Condition |
|---|---|
| `out` | `portions = 0` |
| `critical` | runway < 45 min, or `portions ≤ 3` |
| `low` | runway < 120 min |
| `plenty` | otherwise |

`portions ≤ 3` is in the critical test on purpose: at low absolute counts the ratio is noisy, and "3
left" matters to a guest regardless of what the rate says.

**Band is not urgency.** The runway board sorts by *predicted time*, never by band — conflating the
two mis-orders it. Real seeded data made this obvious: a 3-portion dish is forced critical by the rule
above while a 4-portion dish actually 86s 73 minutes sooner, so band-ordering buried the dish the
kitchen needed first. The band is a scarcity signal worth showing a guest; it is not a claim about
what to deal with first. `byUrgency` tiers as: already out → has a prediction (soonest first) → finite
but unpredictable (fewest portions first) → unlimited.

**Outside service hours** velocity is 0 and runway is undefined — show portions, suppress the
countdown. A board predicting an 86 at 04:00 destroys trust in the number.

## 4. Reorder prediction

```
daily_usage(i)    = Σ over dishes d of  v(d) × qty(d,i) × open_hours(d's dayparts)
reorder_point(i)  = daily_usage(i) × lead_time_days(supplier) × 1.2
suggested_qty(i)  = max(0, par_level(i) − stock_qty(i))
needs_order(i)    = stock_qty(i) ≤ reorder_point(i)
```

The 1.2 is a safety factor covering demand variance and late deliveries. `shelf_life_days` caps the
suggestion — never suggest ordering more of something perishable than can be used before it spoils,
which is how naive reorder systems generate the waste they were bought to prevent.

## 5. Menu engineering (Kasavana–Smith)

The standard industry matrix, computed from live ingredient costs rather than a stale spreadsheet.

```
food_cost(d)  = Σ_i qty(d,i) × cost_per_unit_cents(i)
margin(d)     = price_cents(d) − food_cost(d)
popularity(d) = units_sold(d) / total_units_sold        (over the window)

classify(d):
   pop ≥ median_pop  and  margin ≥ median_margin  →  Star       keep, protect, feature
   pop ≥ median_pop  and  margin <  median_margin →  Plowhorse  reprice or re-engineer recipe
   pop <  median_pop and  margin ≥ median_margin  →  Puzzle     promote, reposition on menu
   pop <  median_pop and  margin <  median_margin →  Dog        cut
```

Medians, not means — a single outlier dish shouldn't move the classification boundary.

## 6. Demand steering

This is the part no shipped POS does, and the reason the product isn't a clone.

Knowing a dish will 86 at 20:40 is only half useful. The other half is *reducing demand for it now*,
so the kitchen isn't flooded with orders it can't fill and guests aren't disappointed.

```
steer_score(d) = w₁·norm(margin(d))
               + w₂·norm(runway_minutes(d))
               − w₃·scarcity_penalty(d)
               + w₄·affinity(guest, d)

scarcity_penalty(d) = 1 if band(d) = critical, 0.5 if low, 0 otherwise
initial weights: w₁ 0.30, w₂ 0.25, w₃ 0.30, w₄ 0.15
```

`steer_score` orders the guest browse rail. Effects:

- Dishes about to 86 sink out of the primary rail and gain a scarcity badge. **They remain fully
  orderable** — this is ranking, not hiding. Hiding an available dish would be a lie, and a guest who
  came for the prawns must still be able to find them.
- High-margin dishes with long runway rise, which is the revenue lever.
- All weights live in one config object so the behaviour is inspectable and tunable.

**Honest limitation to state in the demo:** this is a heuristic ranking, not a proven uplift model. It
is not A/B tested. Claiming a revenue number would be fabrication; claiming a mechanism is fair.

## 7. Recommendations — item-item collaborative filtering

No LLM. Classic co-occurrence.

```
build M[d₁][d₂] = number of orders containing both d₁ and d₂
similarity(d₁,d₂) = cosine(M[d₁], M[d₂])

recommend(guest):
    seed  = dishes in guest's order history (or current cart)
    cands = top-N by Σ similarity(seed, cand)
    filter: portions(cand) > 0
    filter: no allergen overlap with guest profile
    cold start (no history) → order by margin × popularity
```

The availability filter is the differentiator: **Brigade never recommends a dish the kitchen can't
make.** A recommender that suggests an 86'd dish is worse than no recommender.

The allergen filter is a hard exclusion, never a ranking penalty. Ranking down an allergen is a safety
bug.

## 8. Waste variance (Bonus)

Only possible because `stock_movements` is an append-only ledger (ADR-5).

```
theoretical_depletion(i, window) = Σ over order_items sold of qty × qty(d,i)
actual_depletion(i, window)      = Σ of stock_movements.delta where reason ∈ (depletion, waste)
variance(i)                      = actual − theoretical
variance_pct(i)                  = variance / theoretical
```

Persistent negative variance means stock leaving without being sold — spoilage, over-portioning, or
theft. Given that 75% of restaurant inventory shrinkage is attributed to staff
([Sculpture Hospitality](https://www.sculpturehospitality.com/blog/restaurant-industry-statistics-2025)),
this is a genuinely valuable number.

**Framing rule for the UI:** variance is surfaced as *"investigate this"*, never *"someone stole this."*
Over-portioning and bad prep yields look identical to theft in the data, and the system does not know
which it is.

## 9. Insight generation

Insights are templated from the numbers above — deterministic strings with computed values
interpolated, written to the `insights` table. Not generated prose.

| Kind | Trigger | Message shape |
|---|---|---|
| `runway_critical` | band → critical during service | "{dish} 86s ~{time} · {n} portions left" |
| `reorder` | `stock ≤ reorder_point` | "Order {qty} {unit} {ingredient} — {days}d lead time" |
| `menu_dog` | Dog for 2+ consecutive weeks | "{dish}: {pop}% of covers, {margin} margin. Consider cutting." |
| `variance` | `variance_pct` < −5% over 7 days | "{ingredient} using {pct}% more than recipes predict. Investigate." |
| `forecast_peak` | tomorrow's forecast > 1.3× trailing mean | "Tomorrow forecast {n} covers, {pct}% above average. Prep up." |

Each row already has `title` and `body` columns, so a narration layer could be added later without
touching any of the maths above. That seam is intentional.

## Test plan for this file

The maths is where correctness actually matters, so it gets real tests rather than a click-through:

- `portions`: binding-ingredient selection, empty BOM → unlimited, fractional stock floors
- `velocity`: EWMA converges as expected on a known series; cold start never returns 0
- `runway`: banding boundaries at 45/120 min; `portions ≤ 3` forces critical; outside service hours
  suppresses the countdown
- `reorder`: shelf-life cap actually caps the suggestion
- `menu class`: all four quadrants land correctly on a fixture with a deliberate outlier
- `recommend`: an 86'd dish never appears; an allergen match never appears
- `variance`: a seeded waste event produces the expected negative variance
