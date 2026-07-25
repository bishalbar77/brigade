import { bindingIngredient, isManually86, isUnlimited, portionsAvailable } from "./availability";
import { type DaypartWindow, currentDaypart, resolveVelocity } from "./velocity";
import {
  BAND_THRESHOLDS,
  type Dish,
  type RunwayBand,
  type RunwayResult,
  type Velocity,
} from "./types";

/**
 * The core metric: minutes until a dish 86s at tonight's actual sell rate.
 *
 *   runway_minutes = portions / velocity_per_hour * 60
 *
 * See docs/05-runway-engine.md §3.
 */
export function runwayMinutes(portions: number, unitsPerHour: number): number | null {
  if (isUnlimited(portions)) return null;
  if (unitsPerHour <= 0) return null; // undefined, not infinite
  return (portions / unitsPerHour) * 60;
}

/**
 * Which band a dish is in. Drives every runway UI affordance.
 *
 * `portions <= 3` forces critical regardless of rate: at low absolute counts the
 * ratio is noisy, and "3 left" matters to a guest whatever the sell rate says.
 */
export function bandFor(portions: number, minutes: number | null): RunwayBand {
  if (portions <= 0) return "out";
  if (portions <= BAND_THRESHOLDS.criticalPortions) return "critical";
  if (minutes === null) return "plenty"; // unlimited, or rate unknown
  if (minutes < BAND_THRESHOLDS.criticalMinutes) return "critical";
  if (minutes < BAND_THRESHOLDS.lowMinutes) return "low";
  return "plenty";
}

export interface RunwayInput {
  dish: Dish;
  stockByIngredient: ReadonlyMap<string, number>;
  velocity?: Velocity;
  categoryMeanVelocity?: number;
  globalMeanVelocity?: number;
  serviceWindows: readonly DaypartWindow[];
  now?: Date;
}

/**
 * Full runway calculation for one dish.
 *
 * Deliberate behaviours worth knowing:
 *  - outside service hours: portions only, no prediction (velocity is meaningless)
 *  - fewer than 3 velocity samples: `insufficientHistory`, so the UI can say
 *    "not enough history" instead of fabricating a time
 *  - manual 86 overrides computed availability but stays distinguishable from it
 */
export function computeRunway(input: RunwayInput): RunwayResult {
  const {
    dish,
    stockByIngredient,
    velocity,
    categoryMeanVelocity,
    globalMeanVelocity = 0,
    serviceWindows,
    now = new Date(),
  } = input;

  const rawPortions = portionsAvailable(dish.recipe, stockByIngredient);
  const unlimited = isUnlimited(rawPortions);

  // A manual 86 (burnt sauce, fryer down) zeroes availability regardless of stock.
  const manually86 = isManually86(dish, now);
  const portions = manually86 ? 0 : rawPortions;

  const daypart = currentDaypart(now, serviceWindows);
  const serviceOpen = daypart !== null;

  const { unitsPerHour, insufficientHistory } = resolveVelocity(
    velocity,
    categoryMeanVelocity,
    globalMeanVelocity,
  );

  // Suppress the prediction when the kitchen is closed or history is too thin.
  const minutes =
    serviceOpen && !insufficientHistory ? runwayMinutes(portions, unitsPerHour) : null;

  const predicted86At = minutes === null ? null : new Date(now.getTime() + minutes * 60_000);

  return {
    dishId: dish.id,
    portions: unlimited && !manually86 ? rawPortions : portions,
    runwayMinutes: minutes,
    predicted86At,
    band: bandFor(portions, minutes),
    unlimited: unlimited && !manually86,
    insufficientHistory: insufficientHistory && serviceOpen,
    bindingIngredientId: bindingIngredient(dish.recipe, stockByIngredient),
  };
}

/** Sort for the runway board: soonest to 86 first. */
export function byUrgency(a: RunwayResult, b: RunwayResult): number {
  const rank: Record<RunwayBand, number> = { out: 0, critical: 1, low: 2, plenty: 3 };
  if (rank[a.band] !== rank[b.band]) return rank[a.band] - rank[b.band];

  // within a band, the one with an actual prediction and less time left comes first
  if (a.runwayMinutes !== null && b.runwayMinutes !== null) return a.runwayMinutes - b.runwayMinutes;
  if (a.runwayMinutes !== null) return -1;
  if (b.runwayMinutes !== null) return 1;
  return a.portions - b.portions;
}
