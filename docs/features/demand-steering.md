# Demand steering & recommendations

**User story:** US5 (Platinum) · **Status:** built (partial)

_As deployed:_ Scarcity demotion and ordering ship. The MARGIN term is dropped on the guest path — a guest cannot read cost, and reimplementing steer_score in SQL would be a second untested copy. Margin steering is a manager-side view.

**Problem it solves:** "Personalized recommendations" from the PS — but more importantly, this is the half
of the runway idea that no shipped POS does. Knowing a dish will 86 at 20:40 is only half useful; the
other half is reducing demand for it *now*, so the kitchen isn't flooded with orders it can't fill and
guests aren't disappointed.

It turns an inventory constraint into a revenue lever, which is the argument for the whole product.

## Behaviour

**Menu ordering.** The guest browse rail is sorted by `steer_score` rather than a fixed `sort` column:

```
steer_score(d) = 0.30·norm(margin)
               + 0.25·norm(runway_minutes)
               − 0.30·scarcity_penalty
               + 0.15·affinity(guest, d)
```

Net effect: dishes about to 86 sink and gain a scarcity badge; high-margin dishes the kitchen can
comfortably deliver rise.

**Recommendations.** "Goes well with" on the dish detail page and in the cart, from item-item cosine
similarity over order co-occurrence — filtered so that only dishes with `portions > 0` and no allergen
overlap can be suggested.

## Screens

Affects `/menu` (ordering), `/menu/[dishId]` (pairings), `/cart` (add-ons)

## Data

- **Reads** `dish_availability`, `dish_velocity`, `dishes`, `recipe_items` + `ingredients` (for margin),
  historical `order_items` (co-occurrence), `profiles.allergens`
- **Writes** none

Co-occurrence matrix is precomputed after each service, not built per request.

## API

Computed server-side in `lib/runway/steering.ts` and `lib/runway/affinity.ts` — pure functions, no
Supabase imports, unit-testable without a database.

```
GET /api/dishes/[id]/pairings → ranked, availability- and allergen-filtered
```

## Realtime

Reuses `restaurant:{id}:availability`. When a dish crosses into the critical band its rank drops and its
badge appears without a reload.

## Rules & edge cases

- **Ranking, never hiding.** A near-86 dish sinks and gets badged but stays fully orderable. Hiding an
  available dish would be a lie, and a guest who came for the prawns must still be able to find them.
  This is the line between steering and manipulation, and it's worth being explicit about.
- **Allergen filtering is a hard exclusion**, never a ranking penalty. Ranking down an allergen is a
  safety bug, not a tuning choice.
- **Never recommend an unavailable dish.** A recommender that suggests something 86'd is worse than no
  recommender. This availability filter is the differentiator over a generic "customers also bought."
- **Cold start** (guest with no history, or a restaurant with thin data) → fall back to
  margin × popularity. Never return an empty rail.
- **Weights live in one config object** so behaviour is inspectable and tunable rather than scattered
  through the ranking code.
- **Cost data must not leak.** Margin influences ordering but never appears in a guest payload — the
  guest sees a sorted list, not the reason.
- Category grouping is preserved; steering sorts *within* a category. A menu that reorders across
  starters and mains becomes unusable.
- Diversity guard: don't fill the rail with five variations of one dish because they happen to score well.

## Honest limitations

Worth stating plainly in the demo and the deck rather than being caught on it:

- This is a **heuristic ranking, not a validated uplift model.** It has not been A/B tested. Claiming a
  revenue number would be fabrication; claiming a mechanism is fair.
- Co-occurrence over six weeks of seeded data demonstrates the algorithm, not real customer behaviour.
- Weights are chosen, not learned.

## Verification

- Drive a dish into the critical band → its rank drops in the guest rail and the badge appears live
- That dish remains orderable and findable
- An 86'd dish never appears in any pairing response
- A guest with a declared allergen never sees a matching dish in recommendations or the menu
- Cold-start guest gets a non-empty rail ordered by margin × popularity
- Guest payloads contain no cost, margin or score field
- Steering never reorders across categories
- Unit tests cover each term of `steer_score` independently

## Cut-line

**Cut-line-adjacent:** steering is the amplifier, availability is the differentiator. If time is short,
degrade to manual `sort` order on the menu while keeping availability badges and pairings — then drop
pairings and keep availability. Availability alone still satisfies US3; steering is what earns Platinum
and Bonus.
