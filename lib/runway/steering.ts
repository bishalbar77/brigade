import type { RunwayBand, RunwayResult } from "./types";

/**
 * Demand steering — the half of the runway idea no shipped POS does.
 *
 * Knowing a dish will 86 at 20:40 is only half useful. The other half is reducing
 * demand for it NOW, so the kitchen isn't flooded with orders it can't fill and
 * guests aren't disappointed. See docs/features/demand-steering.md.
 *
 * This is RANKING, NOT HIDING. A near-86 dish sinks and gains a scarcity badge but
 * stays fully orderable and findable. Hiding an available dish would be a lie, and
 * a guest who came for the branzino must still be able to order it. That line —
 * between steering and manipulation — is drawn deliberately.
 */

/** All weights in one object so behaviour is inspectable and tunable. */
export const STEER_WEIGHTS = {
  margin: 0.30,
  runway: 0.25,
  scarcity: 0.30,
  affinity: 0.15,
} as const;

const SCARCITY_PENALTY: Record<RunwayBand, number> = {
  out: 1,
  critical: 1,
  low: 0.5,
  plenty: 0,
};

/** Min-max normalise into 0..1. Returns 0.5 for a degenerate range. */
export function normalise(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  if (max <= min) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export interface SteerInput {
  dishId: string;
  marginCents: number;
  runway: RunwayResult;
  /** 0..1 similarity to this guest's history. 0 when unknown. */
  affinity: number;
}

export interface SteerScored extends SteerInput {
  score: number;
}

/**
 * Score and sort dishes for the guest browse rail.
 *
 * Caller must pass dishes from a SINGLE category: steering sorts *within* a
 * category. A menu that reorders across starters and mains is unusable.
 */
export function scoreForSteering(dishes: readonly SteerInput[]): SteerScored[] {
  if (dishes.length === 0) return [];

  const margins = dishes.map((d) => d.marginCents);
  const minMargin = Math.min(...margins);
  const maxMargin = Math.max(...margins);

  // Unlimited / unpredicted dishes are treated as having the longest runway,
  // because there is no evidence they're about to run out.
  const finiteRunways = dishes
    .map((d) => d.runway.runwayMinutes)
    .filter((m): m is number => m !== null);
  const minRunway = finiteRunways.length ? Math.min(...finiteRunways) : 0;
  const maxRunway = finiteRunways.length ? Math.max(...finiteRunways) : 1;

  return dishes
    .map((d) => {
      const nMargin = normalise(d.marginCents, minMargin, maxMargin);
      const nRunway =
        d.runway.runwayMinutes === null ? 1 : normalise(d.runway.runwayMinutes, minRunway, maxRunway);
      const penalty = SCARCITY_PENALTY[d.runway.band];

      const score =
        STEER_WEIGHTS.margin * nMargin +
        STEER_WEIGHTS.runway * nRunway -
        STEER_WEIGHTS.scarcity * penalty +
        STEER_WEIGHTS.affinity * Math.min(1, Math.max(0, d.affinity));

      return { ...d, score };
    })
    .sort((a, b) => b.score - a.score || a.dishId.localeCompare(b.dishId));
}

/**
 * Item-item collaborative filtering. No LLM — classic co-occurrence.
 *
 * `orders` is a list of dish-id sets, one per historical order.
 */
export function buildCooccurrence(orders: readonly (readonly string[])[]): Map<string, Map<string, number>> {
  const matrix = new Map<string, Map<string, number>>();

  const bump = (a: string, b: string) => {
    let row = matrix.get(a);
    if (!row) { row = new Map(); matrix.set(a, row); }
    row.set(b, (row.get(b) ?? 0) + 1);
  };

  for (const order of orders) {
    const unique = [...new Set(order)];
    for (const a of unique) {
      for (const b of unique) bump(a, b);  // includes a==b: the dish's own count
    }
  }

  return matrix;
}

export function cosineSimilarity(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  for (const [k, v] of a) {
    const bv = b.get(k);
    if (bv !== undefined) dot += v * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RecommendCandidate {
  dishId: string;
  portions: number;
  allergens: readonly string[];
  marginCents: number;
  popularity: number;
}

/**
 * Recommend dishes similar to a seed set.
 *
 * Two filters that are not negotiable:
 *  - `portions > 0` — a recommender that suggests an 86'd dish is worse than no
 *    recommender. This grounding is what differentiates it from a generic
 *    "customers also bought", and it's only possible because availability is
 *    computed rather than stored.
 *  - allergens are a HARD EXCLUSION, never a ranking penalty. Ranking down an
 *    allergen is a safety bug, not a tuning choice.
 */
export function recommend(
  seedDishIds: readonly string[],
  candidates: readonly RecommendCandidate[],
  cooccurrence: ReadonlyMap<string, ReadonlyMap<string, number>>,
  guestAllergens: readonly string[],
  limit = 3,
): string[] {
  const seeds = new Set(seedDishIds);
  const allergenSet = new Set(guestAllergens.map((a) => a.toLowerCase()));

  const eligible = candidates.filter(
    (c) =>
      c.portions > 0 &&
      !seeds.has(c.dishId) &&
      !c.allergens.some((a) => allergenSet.has(a.toLowerCase())),
  );

  // Cold start: no seed history, or no co-occurrence data at all.
  const haveSignal = seedDishIds.some((id) => cooccurrence.has(id));
  if (!haveSignal) {
    return [...eligible]
      .sort((a, b) => b.marginCents * b.popularity - a.marginCents * a.popularity)
      .slice(0, limit)
      .map((c) => c.dishId);
  }

  const scored = eligible.map((c) => {
    let sim = 0;
    const candRow = cooccurrence.get(c.dishId);
    if (candRow) {
      for (const seed of seedDishIds) {
        const seedRow = cooccurrence.get(seed);
        if (seedRow) sim += cosineSimilarity(seedRow, candRow);
      }
    }
    return { dishId: c.dishId, sim, tie: c.marginCents * c.popularity };
  });

  return scored
    .sort((a, b) => b.sim - a.sim || b.tie - a.tie || a.dishId.localeCompare(b.dishId))
    .slice(0, limit)
    .map((s) => s.dishId);
}
